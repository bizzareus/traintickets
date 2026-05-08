import { Module } from '@nestjs/common';
import { ChartCronService } from './chart-cron.service.js';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule],
  providers: [ChartCronService],
})
export class ChartCronModule {}
