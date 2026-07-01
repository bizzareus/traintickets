import { Module } from '@nestjs/common';
import { IrctcModule } from '../irctc/irctc.module';
import { CronLeaderModule } from '../chart-cron/cron-leader.module';
import { BookingV2Controller } from './booking-v2.controller';
import { BookingV2Service } from './booking-v2.service';
import { BestTrainsRouteCache } from './best-trains-cache';
import { BestSeatsCronService } from './best-seats-cron.service';

@Module({
  imports: [IrctcModule, CronLeaderModule],
  controllers: [BookingV2Controller],
  providers: [BookingV2Service, BestTrainsRouteCache, BestSeatsCronService],
  exports: [BookingV2Service],
})
export class BookingV2Module {}
