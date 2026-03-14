import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ChartCronService } from './chart-cron.service';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [ScheduleModule.forRoot(), AvailabilityModule],
  providers: [ChartCronService],
})
export class ChartCronModule {}
