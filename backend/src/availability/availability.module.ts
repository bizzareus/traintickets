import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { JourneyTaskService } from './journey-task.service';
import { BrowserUseModule } from '../browser-use/browser-use.module';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { IrctcModule } from '../irctc/irctc.module';
import { Service2Module } from '../service2/service2.module';
import { TrainCompositionModule } from '../train-composition/train-composition.module';
import { NotificationModule } from '../notification/notification.module';
import { BookingV2Module } from '../booking-v2/booking-v2.module';
import { AlternativeSearchTaskModule } from './alternative-search-task.module';

@Module({
  imports: [
    BrowserUseModule,
    ChartTimeModule,
    IrctcModule,
    TrainCompositionModule,
    Service2Module,
    NotificationModule,
    BookingV2Module,
    AlternativeSearchTaskModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, JourneyTaskService],
  exports: [
    AvailabilityService,
    JourneyTaskService,
    AlternativeSearchTaskModule,
  ],
})
export class AvailabilityModule {}
