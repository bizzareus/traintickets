import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  JourneyTaskService,
  type RunDueTaskResult,
} from '../availability/journey-task.service';
import { AlternativeSearchTaskService } from '../availability/alternative-search-task.service';
import { ChartCronLeaderService } from './chart-cron-leader.service';
import { FailedDeliveryRefundService } from './failed-delivery-refund.service';
import { CronitorService, monitorCron } from '../monitoring/cronitor.service';

/** Identifies this cron in the cron_run_log table. */
const CRON_NAME = 'chart-notification';
const ALTERNATIVE_CRON_NAME = 'alternative-search';
const RESEND_CRON_NAME = 'failed-notification-resend';
const DELIVERY_REFUND_CRON_NAME = 'failed-delivery-refund';

const hasFailure = (r: RunDueTaskResult) =>
  r.status === 'failed' ||
  [r.emailStatus, r.whatsappStatus].some(
    (status) => status === 'pending_retry' || status === 'unsend',
  );

@Injectable()
export class ChartCronService {
  private alternativeRunning = false;
  private resendRunning = false;
  private deliveryRefundRunning = false;

  constructor(
    private journeyTask: JourneyTaskService,
    private leader: ChartCronLeaderService,
    @Optional() private alternativeSearchTask?: AlternativeSearchTaskService,
    @Optional() private deliveryRefund?: FailedDeliveryRefundService,
    @Optional() private monitoring?: CronitorService,
  ) {}

  private async withLeaseHeartbeat<T>(
    leaseName: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const heartbeat = setInterval(() => {
      void this.leader.isLeader(leaseName);
    }, 30_000);
    heartbeat.unref?.();
    try {
      return await work();
    } finally {
      clearInterval(heartbeat);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE) // every minute
  async handleChartCron() {
    if (!(await this.leader.isLeader(CRON_NAME))) return;

    const startedAt = new Date();
    try {
      console.log('initiated cron');
      const run = await monitorCron(
        this.monitoring,
        CRON_NAME,
        () => this.journeyTask.runDueTasks(),
        (result) => ({
          count: result.tasksRun,
          errorCount: result.results.filter(hasFailure).length,
        }),
      );
      if (run.tasksRun > 0) {
        console.log('chart_time_tasks_run=' + run.tasksRun);
      }

      const completedCount = run.results.filter(
        (r) => r.status === 'completed' && !hasFailure(r),
      ).length;
      const failedCount = run.results.filter(hasFailure).length;
      await this.journeyTask.logCronRun({
        cronName: CRON_NAME,
        startedAt,
        status: failedCount > 0 ? 'error' : 'success',
        isLeader: true,
        tasksClaimed: run.claimedTaskIds.length,
        tasksRun: run.tasksRun,
        completedCount,
        failedCount,
        input: { istNow: run.istNow, claimedTaskIds: run.claimedTaskIds },
        output: { results: run.results },
      });
    } catch (err) {
      await this.journeyTask.logCronRun({
        cronName: CRON_NAME,
        startedAt,
        status: 'error',
        isLeader: true,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  @Cron('20 * * * * *')
  async handleAlternativeSearchCron(): Promise<void> {
    if (!this.alternativeSearchTask || this.alternativeRunning) return;
    if (!(await this.leader.isLeader(ALTERNATIVE_CRON_NAME))) return;

    const startedAt = new Date();
    this.alternativeRunning = true;
    try {
      const result = await this.withLeaseHeartbeat(ALTERNATIVE_CRON_NAME, () =>
        monitorCron(
          this.monitoring,
          ALTERNATIVE_CRON_NAME,
          () => this.alternativeSearchTask!.processDueTasksWithStats(),
          (stats) => ({ count: stats.processed, errorCount: stats.failed }),
        ),
      );
      await this.journeyTask.logCronRun({
        cronName: ALTERNATIVE_CRON_NAME,
        startedAt,
        status: result.failed > 0 ? 'error' : 'success',
        isLeader: true,
        tasksClaimed: result.processed + result.failed,
        tasksRun: result.processed + result.failed,
        completedCount: result.processed,
        failedCount: result.failed,
        output: result,
      });
    } catch (err) {
      await this.journeyTask.logCronRun({
        cronName: ALTERNATIVE_CRON_NAME,
        startedAt,
        status: 'error',
        isLeader: true,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.alternativeRunning = false;
    }
  }

  // Poll every minute; per-task five-minute cooldown prevents early retries.
  // A five-minute poll plus send latency would otherwise skip the next slot.
  @Cron('40 * * * * *')
  async handleNotificationResendCron(): Promise<void> {
    if (this.resendRunning) return;
    if (!(await this.leader.isLeader(RESEND_CRON_NAME))) return;

    const startedAt = new Date();
    this.resendRunning = true;
    try {
      const result = await this.withLeaseHeartbeat(RESEND_CRON_NAME, () =>
        monitorCron(
          this.monitoring,
          RESEND_CRON_NAME,
          () => this.journeyTask.resendFailedWhatsAppNotifications(24),
          (stats) => ({ count: stats.found, errorCount: stats.failed }),
        ),
      );
      await this.journeyTask.logCronRun({
        cronName: RESEND_CRON_NAME,
        startedAt,
        status: result.failed > 0 ? 'error' : 'success',
        isLeader: true,
        tasksClaimed: result.found,
        tasksRun: result.resent + result.failed,
        completedCount: result.resent,
        failedCount: result.failed,
        output: result,
      });
    } catch (err) {
      await this.journeyTask.logCronRun({
        cronName: RESEND_CRON_NAME,
        startedAt,
        status: 'error',
        isLeader: true,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.resendRunning = false;
    }
  }

  @Cron(process.env.FAILED_DELIVERY_REFUND_CRON ?? '0 9 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async handleFailedDeliveryRefundCron(): Promise<void> {
    if (!this.deliveryRefund || this.deliveryRefundRunning) return;
    if (!(await this.leader.isLeader(DELIVERY_REFUND_CRON_NAME))) return;

    const startedAt = new Date();
    this.deliveryRefundRunning = true;
    try {
      const result = await this.withLeaseHeartbeat(
        DELIVERY_REFUND_CRON_NAME,
        () =>
          monitorCron(
            this.monitoring,
            DELIVERY_REFUND_CRON_NAME,
            () => this.deliveryRefund!.runDailyAudit(),
            (stats) => ({ count: stats.found, errorCount: stats.failed }),
          ),
      );
      await this.journeyTask.logCronRun({
        cronName: DELIVERY_REFUND_CRON_NAME,
        startedAt,
        status: result.failed > 0 ? 'error' : 'success',
        isLeader: true,
        tasksClaimed: result.found,
        tasksRun: result.refunded + result.skipped + result.failed,
        completedCount: result.notified,
        failedCount: result.failed,
        output: result,
      });
    } catch (err) {
      await this.journeyTask.logCronRun({
        cronName: DELIVERY_REFUND_CRON_NAME,
        startedAt,
        status: 'error',
        isLeader: true,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.deliveryRefundRunning = false;
    }
  }
}
