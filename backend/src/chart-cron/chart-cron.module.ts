import { Module } from '@nestjs/common';
import { ChartCronLeaderService } from './chart-cron-leader.service';
import { ChartCronService } from './chart-cron.service.js';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule],
  providers: [ChartCronLeaderService, ChartCronService],
})
export class ChartCronModule {}
