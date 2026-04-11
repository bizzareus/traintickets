import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { JourneyTaskService } from '../availability/journey-task.service';

@Injectable()
export class ChartCronService {
  constructor(private journeyTask: JourneyTaskService) {}

  @Cron(CronExpression.EVERY_MINUTE) // every minute
  async handleChartCron() {
    const nowIst = DateTime.now().setZone('Asia/Kolkata');
    console.log('starting cron every minute', nowIst.toISO());

    // Find pending ChartTimeAvailabilityTask where chart time has arrived (chartAt <= now)
    // and trigger the check API internally to find any available seats for each task
    const chartTimeTasksRun = await this.journeyTask.runDueTasks();
    if (chartTimeTasksRun > 0) {
      console.log('chart_time_tasks_run=' + chartTimeTasksRun);
    }
  }
}
