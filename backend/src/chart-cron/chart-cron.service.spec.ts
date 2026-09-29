import { ChartCronService } from './chart-cron.service';
import { CronTime } from 'cron';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';

describe('ChartCronService', () => {
  it('polls notification recovery every minute so a five-minute cooldown does not become ten minutes', () => {
    const options = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      Reflect.get(ChartCronService.prototype, 'handleNotificationResendCron'),
    ) as { cronTime: string };
    const cron = new CronTime(options.cronTime);
    const next = cron
      .getNextDateFrom(new Date('2026-09-29T12:05:41Z'), 'UTC')
      .toJSDate();
    expect(next.toISOString()).toBe('2026-09-29T12:06:40.000Z');
    expect(cron.getNextDateFrom(next, 'UTC').toMillis() - next.getTime()).toBe(
      60_000,
    );
  });
  it('records a failed task as an unsuccessful cron outcome', async () => {
    const journey = {
      runDueTasks: jest.fn().mockResolvedValue({
        claimedTaskIds: ['task'],
        tasksRun: 1,
        results: [{ status: 'failed' }],
      }),
      logCronRun: jest.fn().mockResolvedValue(undefined),
    };
    await new ChartCronService(
      journey as never,
      { isLeader: jest.fn().mockResolvedValue(true) } as never,
    ).handleChartCron();
    expect(journey.logCronRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        failedCount: 1,
        completedCount: 0,
      }),
    );
  });

  it('records failed notification attempts in the resend cron status', async () => {
    const journey = {
      resendFailedWhatsAppNotifications: jest
        .fn()
        .mockResolvedValue({ found: 1, resent: 0, failed: 1 }),
      logCronRun: jest.fn().mockResolvedValue(undefined),
    };
    await new ChartCronService(
      journey as never,
      { isLeader: jest.fn().mockResolvedValue(true) } as never,
    ).handleNotificationResendCron();
    expect(journey.logCronRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', failedCount: 1 }),
    );
  });

  it('does not mark the cron green when availability succeeded but a notification failed', async () => {
    const journey = {
      runDueTasks: jest.fn().mockResolvedValue({
        claimedTaskIds: ['task'],
        tasksRun: 1,
        results: [
          {
            status: 'completed',
            emailStatus: 'pending_retry',
            whatsappStatus: 'sent',
          },
        ],
      }),
      logCronRun: jest.fn().mockResolvedValue(undefined),
    };
    await new ChartCronService(
      journey as never,
      { isLeader: jest.fn().mockResolvedValue(true) } as never,
    ).handleChartCron();
    expect(journey.logCronRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        failedCount: 1,
        completedCount: 0,
      }),
    );
  });
  it('skips the cron body when this process is not the leader', async () => {
    const journeyTask = { runDueTasks: jest.fn() };
    const leader = { isLeader: jest.fn().mockResolvedValue(false) };
    const service = new ChartCronService(journeyTask as never, leader as never);

    await service.handleChartCron();

    expect(leader.isLeader).toHaveBeenCalledWith('chart-notification');
    expect(journeyTask.runDueTasks).not.toHaveBeenCalled();
  });

  it('runs due tasks when this process is the leader', async () => {
    const mockRunResult = { claimedTaskIds: [], tasksRun: 0, results: [] };
    const journeyTask = {
      runDueTasks: jest.fn().mockResolvedValue(mockRunResult),
      logCronRun: jest.fn().mockResolvedValue({ id: 'log-1' }),
      resendFailedWhatsAppNotifications: jest
        .fn()
        .mockResolvedValue({ found: 0, resent: 0, failed: 0 }),
    };
    const leader = { isLeader: jest.fn().mockResolvedValue(true) };
    const service = new ChartCronService(journeyTask as never, leader as never);

    await service.handleChartCron();

    expect(leader.isLeader).toHaveBeenCalledWith('chart-notification');
    expect(journeyTask.runDueTasks).toHaveBeenCalledTimes(1);
  });

  it('does not let a blocked chart run stop alternative searches or resends', async () => {
    let finishRun!: (value: any) => void;
    const running = new Promise<any>((resolve) => {
      finishRun = resolve;
    });
    const journeyTask = {
      runDueTasks: jest.fn().mockReturnValue(running),
      logCronRun: jest.fn().mockResolvedValue({ id: 'log-1' }),
      resendFailedWhatsAppNotifications: jest
        .fn()
        .mockResolvedValue({ found: 0, resent: 0, failed: 0 }),
    };
    const alternativeSearchTask = {
      processDueTasks: jest.fn().mockResolvedValue(2),
    };
    const leader = { isLeader: jest.fn().mockResolvedValue(true) };
    const service = new ChartCronService(
      journeyTask as never,
      leader as never,
      alternativeSearchTask as never,
    );

    const chartRun = service.handleChartCron();
    await Promise.resolve();
    await service.handleAlternativeSearchCron();
    await service.handleNotificationResendCron();
    finishRun({ claimedTaskIds: [], tasksRun: 0, results: [] });
    await chartRun;

    expect(alternativeSearchTask.processDueTasks).toHaveBeenCalledTimes(1);
    expect(journeyTask.resendFailedWhatsAppNotifications).toHaveBeenCalledTimes(
      1,
    );
    expect(journeyTask.runDueTasks).toHaveBeenCalledTimes(1);
    expect(leader.isLeader).toHaveBeenCalledWith('alternative-search');
    expect(leader.isLeader).toHaveBeenCalledWith('failed-notification-resend');
  });
});
