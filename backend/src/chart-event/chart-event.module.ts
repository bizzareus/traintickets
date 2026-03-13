import { Module } from '@nestjs/common';
import { ChartEventService } from './chart-event.service';

@Module({
  providers: [ChartEventService],
  exports: [ChartEventService],
})
export class ChartEventModule {}
