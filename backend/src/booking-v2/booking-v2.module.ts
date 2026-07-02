import { Module } from '@nestjs/common';
import { IrctcModule } from '../irctc/irctc.module';
import { CronLeaderModule } from '../chart-cron/cron-leader.module';
import { BookingV2Controller } from './booking-v2.controller';
import { BestSeatsCronController } from './best-seats-cron.controller';
import { BookingV2Service } from './booking-v2.service';
import { BestTrainsRouteCache } from './best-trains-cache';
import { AlternatePathsRouteCache } from './alternate-paths-cache';
import { BestSeatsCronService } from './best-seats-cron.service';
import { PostHogTopRoutesService } from './posthog-top-routes.service';

@Module({
  imports: [IrctcModule, CronLeaderModule],
  controllers: [BookingV2Controller, BestSeatsCronController],
  providers: [
    BookingV2Service,
    BestTrainsRouteCache,
    AlternatePathsRouteCache,
    BestSeatsCronService,
    PostHogTopRoutesService,
  ],
  exports: [BookingV2Service],
})
export class BookingV2Module {}
