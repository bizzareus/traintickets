import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JourneyTaskService } from '../availability/journey-task.service';
import { AlternativeSearchTaskService } from '../availability/alternative-search-task.service';
import { ChartCronLeaderService } from './chart-cron-leader.service';

/** Identifies this cron in the cron_run_log table. */
const CRON_NAME = 'chart-notification';
const ALTERNATIVE_CRON_NAME = 'alternative-search';
const RESEND_CRON_NAME = 'failed-notification-resend';

@Injectable()
export class ChartCronService {
  private alternativeRunning = false;
  private resendRunning = false;

  constructor(
    private journeyTask: JourneyTaskService,
    private leader: ChartCronLeaderService,
    @Optional() private alternativeSearchTask?: AlternativeSearchTaskService,
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
      const run = await this.journeyTask.runDueTasks();
      if (run.tasksRun > 0) {
        console.log('chart_time_tasks_run=' + run.tasksRun);
      }

      const completedCount = run.results.filter(
        (r) => r.status === 'completed',
      ).length;
      const failedCount = run.results.filter(
        (r) => r.status === 'failed',
      ).length;
      await this.journeyTask.logCronRun({
        cronName: CRON_NAME,
        startedAt,
        status: 'success',
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
      const processed = await this.withLeaseHeartbeat(
        ALTERNATIVE_CRON_NAME,
        () => this.alternativeSearchTask!.processDueTasks(),
      );
      await this.journeyTask.logCronRun({
        cronName: ALTERNATIVE_CRON_NAME,
        startedAt,
        status: 'success',
        isLeader: true,
        tasksClaimed: processed,
        tasksRun: processed,
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

  @Cron('40 */5 * * * *')
  async handleNotificationResendCron(): Promise<void> {
    if (this.resendRunning) return;
    if (!(await this.leader.isLeader(RESEND_CRON_NAME))) return;

    const startedAt = new Date();
    this.resendRunning = true;
    try {
      const result = await this.withLeaseHeartbeat(RESEND_CRON_NAME, () =>
        this.journeyTask.resendFailedWhatsAppNotifications(24),
      );
      await this.journeyTask.logCronRun({
        cronName: RESEND_CRON_NAME,
        startedAt,
        status: 'success',
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
}
