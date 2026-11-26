import { Module } from '@nestjs/common';
import { IrctcModule } from '../irctc/irctc.module';
import { CronLeaderModule } from '../chart-cron/cron-leader.module';
import { BookingV2Controller } from './booking-v2.controller';
import { SeatCacheController } from './seat-cache.controller';
import { BookingV2Service } from './booking-v2.service';
import { ConnectingRouteGraphService } from './connecting-route-graph.service';
import { ConnectingTrainsService } from './connecting-trains.service';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';
import { SeatCacheCronService } from './seat-cache-cron.service';
import { PostHogTopRoutesService } from './posthog-top-routes.service';
import { BestTrainsRouteCache } from './best-trains-cache';
import { AlternatePathsRouteCache } from './alternate-paths-cache';

import { PostHogAnalyticsService } from '../common/posthog-analytics.service';

@Module({
  imports: [IrctcModule, CronLeaderModule],
  controllers: [BookingV2Controller, SeatCacheController],
  providers: [
    BookingV2Service,
    ConnectingRouteGraphService,
    ConnectingTrainsService,
    DynamoDbSeatCacheService,
    SeatCacheCronService,
    PostHogTopRoutesService,
    BestTrainsRouteCache,
    AlternatePathsRouteCache,
    PostHogAnalyticsService,
  ],
  exports: [
    BookingV2Service,
    ConnectingRouteGraphService,
    ConnectingTrainsService,
    DynamoDbSeatCacheService,
    SeatCacheCronService,
    PostHogAnalyticsService,
  ],
})
export class BookingV2Module {}
