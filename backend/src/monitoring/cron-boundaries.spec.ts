import { ChartCronService } from '../chart-cron/chart-cron.service';
import { WasenderHealthcheckService } from '../whatsapp/wasender-healthcheck.service';
import type { CronitorOutcome } from './cronitor.service';
import type { CronitorJob } from './cronitor.config';

function recorder() {
  const outcomes: Array<{ job: CronitorJob; outcome: CronitorOutcome }> = [];
  return {
    outcomes,
    run: jest.fn(
      async <T>(
        job: CronitorJob,
        work: () => Promise<T>,
        summarize?: (result: T) => CronitorOutcome,
      ) => {
        const result = await work();
        outcomes.push({ job, outcome: summarize?.(result) ?? {} });
        return result;
      },
    ),
  };
}

describe('real cron execution boundaries', () => {
  it('emits outcomes for all four leader jobs, including returned failures', async () => {
    const monitoring = recorder();
    const journey = {
      runDueTasks: jest.fn().mockResolvedValue({
        tasksRun: 2,
        claimedTaskIds: ['a', 'b'],
        results: [
          { status: 'completed', emailStatus: 'pending_retry' },
          { status: 'completed' },
        ],
      }),
      resendFailedWhatsAppNotifications: jest
        .fn()
        .mockResolvedValue({ found: 3, resent: 2, failed: 1 }),
      logCronRun: jest.fn().mockResolvedValue(undefined),
    };
    const alternatives = {
      processDueTasksWithStats: jest
        .fn()
        .mockResolvedValue({ processed: 2, failed: 1, skipped: 0 }),
    };
    const refunds = {
      runDailyAudit: jest.fn().mockResolvedValue({
        found: 1,
        refunded: 0,
        notified: 0,
        skipped: 0,
        failed: 1,
      }),
    };
    const cron = new ChartCronService(
      journey as never,
      { isLeader: jest.fn().mockResolvedValue(true) } as never,
      alternatives as never,
      refunds as never,
      monitoring as never,
    );
    await cron.handleChartCron();
    await cron.handleAlternativeSearchCron();
    await cron.handleNotificationResendCron();
    await cron.handleFailedDeliveryRefundCron();
    expect(monitoring.outcomes).toEqual([
      { job: 'chart-notification', outcome: { count: 2, errorCount: 1 } },
      { job: 'alternative-search', outcome: { count: 2, errorCount: 1 } },
      {
        job: 'failed-notification-resend',
        outcome: { count: 3, errorCount: 1 },
      },
      { job: 'failed-delivery-refund', outcome: { count: 1, errorCount: 1 } },
    ]);
  });

  it('standby replicas send no synthetic successful runs', async () => {
    const monitoring = recorder();
    const cron = new ChartCronService(
      {} as never,
      { isLeader: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
      {} as never,
      monitoring as never,
    );
    await cron.handleChartCron();
    await cron.handleAlternativeSearchCron();
    await cron.handleNotificationResendCron();
    await cron.handleFailedDeliveryRefundCron();
    expect(monitoring.run).not.toHaveBeenCalled();
  });

  it('does not report an overlapping skipped resend as a successful run', async () => {
    const monitoring = recorder();
    let finish!: (result: {
      found: number;
      resent: number;
      failed: number;
    }) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const cron = new ChartCronService(
      {
        resendFailedWhatsAppNotifications: () => pending,
        logCronRun: jest.fn(),
      } as never,
      { isLeader: jest.fn().mockResolvedValue(true) } as never,
      undefined,
      undefined,
      monitoring as never,
    );
    const first = cron.handleNotificationResendCron();
    await Promise.resolve();
    await cron.handleNotificationResendCron();
    expect(monitoring.run).toHaveBeenCalledTimes(1);
    finish({ found: 0, resent: 0, failed: 0 });
    await first;
  });

  it('marks a resolved unhealthy WhatsApp result as failed', async () => {
    const monitoring = recorder();
    const health = new WasenderHealthcheckService(
      {
        get: (key: string) =>
          key === 'WASENDER_HEALTHCHECK_ENABLED' ? 'true' : undefined,
      } as never,
      monitoring as never,
    );
    jest.spyOn(health, 'checkHealth').mockResolvedValue({
      healthy: false,
      status: 'disconnected',
      qrSent: false,
      message: 'private provider detail',
      timestamp: new Date().toISOString(),
    });
    await health.handleScheduledHealthcheck();
    expect(monitoring.outcomes).toEqual([
      { job: 'wasender-healthcheck', outcome: { count: 1, errorCount: 1 } },
    ]);
  });

  it('does not ping for a disabled WhatsApp healthcheck', async () => {
    const monitoring = recorder();
    await new WasenderHealthcheckService(
      { get: () => undefined } as never,
      monitoring as never,
    ).handleScheduledHealthcheck();
    expect(monitoring.run).not.toHaveBeenCalled();
  });
});
