import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JourneyTaskService } from '../availability/journey-task.service';
import { ChartCronLeaderService } from './chart-cron-leader.service';

/** Identifies this cron in the cron_run_log table. */
const CRON_NAME = 'chart-notification';

@Injectable()
export class ChartCronService {
  private running = false;

  constructor(
    private journeyTask: JourneyTaskService,
    private leader: ChartCronLeaderService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE) // every minute
  async handleChartCron() {
    // Only the leader replica runs the notification cron. Non-leaders return
    // without logging (expected steady state — logging it would just be noise).
    if (!(await this.leader.isLeader())) return;

    const startedAt = new Date();

    // If the previous tick is still running, record the overlap so a slow run
    // that eats into the next minute is visible (a common "not on time" cause).
    if (this.running) {
      await this.journeyTask.logCronRun({
        cronName: CRON_NAME,
        startedAt,
        status: 'skipped_overlap',
        isLeader: true,
      });
      return;
    }

    this.running = true;
    try {
      console.log('initiated cron');
      // Find pending ChartTimeAvailabilityTask where chart time has arrived (chartAt <= now)
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
    } finally {
      this.running = false;
    }
  }
}
