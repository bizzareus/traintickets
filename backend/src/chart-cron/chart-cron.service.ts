import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JourneyTaskService } from '../availability/journey-task.service';
import { ChartCronLeaderService } from './chart-cron-leader.service';

@Injectable()
export class ChartCronService {
  private running = false;

  constructor(
    private journeyTask: JourneyTaskService,
    private leader: ChartCronLeaderService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE) // every minute
  async handleChartCron() {
    if (!(await this.leader.isLeader())) return;
    if (this.running) return;

    this.running = true;
    try {
      console.log('initiated cron');
      // Find pending ChartTimeAvailabilityTask where chart time has arrived (chartAt <= now)
      const chartTimeTasksRun = await this.journeyTask.runDueTasks();
      if (chartTimeTasksRun > 0) {
        console.log('chart_time_tasks_run=' + chartTimeTasksRun);
      }
    } finally {
      this.running = false;
    }
  }
}
