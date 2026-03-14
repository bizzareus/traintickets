import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JourneyTaskService } from '../availability/journey-task.service';

@Injectable()
export class ChartCronService {
  constructor(private journeyTask: JourneyTaskService) {}

  @Cron('* * * * *') // every minute
  async handleChartCron() {
    const now = new Date();
    console.log('starting cron every minute', now.toISOString());

    // ChartTimeAvailabilityTask: fetch by chart time (chartAt <= now), run each due task
    const chartTimeTasksRun = await this.journeyTask.runDueTasks();
    if (chartTimeTasksRun > 0) {
      console.log('chart_time_tasks_run=' + chartTimeTasksRun);
    }
  }
}
