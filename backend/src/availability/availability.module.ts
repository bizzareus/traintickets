import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { JourneyTaskService } from './journey-task.service';
import { BrowserUseModule } from '../browser-use/browser-use.module';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { IrctcModule } from '../irctc/irctc.module';
import { Service2Module } from '../service2/service2.module';

@Module({
  imports: [
    BrowserUseModule,
    ChartTimeModule,
    IrctcModule,
    Service2Module,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, JourneyTaskService],
  exports: [AvailabilityService, JourneyTaskService],
})
export class AvailabilityModule {}
