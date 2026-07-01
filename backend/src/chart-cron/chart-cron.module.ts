import { Module } from '@nestjs/common';
import { ChartCronService } from './chart-cron.service.js';
import { CronLeaderModule } from './cron-leader.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule, CronLeaderModule],
  providers: [ChartCronService],
})
export class ChartCronModule {}
