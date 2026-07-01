import { Module } from '@nestjs/common';
import { ChartCronLeaderService } from './chart-cron-leader.service';

/**
 * Standalone module for the cron leader lease so multiple cron-owning modules can
 * share the single ChartCronLeaderService instance without importing each other
 * (avoids a ChartCronModule <-> BookingV2Module import cycle). Nest instantiates a
 * module once even when several modules import it, so all crons see the same
 * leader state and compete for the same lease.
 */
@Module({
  providers: [ChartCronLeaderService],
  exports: [ChartCronLeaderService],
})
export class CronLeaderModule {}
