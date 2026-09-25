import { ChartCronService } from './chart-cron.service';

describe('ChartCronService', () => {
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
