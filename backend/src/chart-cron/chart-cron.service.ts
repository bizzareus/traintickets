import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { JourneyTaskService } from '../availability/journey-task.service';

@Injectable()
export class ChartCronService {
  constructor(private journeyTask: JourneyTaskService) {}

  private isProcessing = false;

  @Cron(CronExpression.EVERY_MINUTE) // every minute
  async handleChartCron() {
    if (this.isProcessing) {
      console.log('Skipping chart cron: previous execution still running');
      return;
    }

    this.isProcessing = true;
    try {
      const nowIst = DateTime.now().setZone('Asia/Kolkata');
      console.log('starting cron every minute', nowIst.toISO());

      // Find pending ChartTimeAvailabilityTask where chart time has arrived (chartAt <= now)
      const chartTimeTasksRun = await this.journeyTask.runDueTasks();
      if (chartTimeTasksRun > 0) {
        console.log('chart_time_tasks_run=' + chartTimeTasksRun);
      }
    } catch (error) {
      console.error('Error in chart cron:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
