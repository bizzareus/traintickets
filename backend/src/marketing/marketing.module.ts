import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { CronLeaderModule } from '../chart-cron/cron-leader.module';
import { PostHogAnalyticsService } from '../common/posthog-analytics.service';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { MarketingCronService } from './marketing.cron';

@Module({
  imports: [PrismaModule, NotificationModule, CronLeaderModule],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingCronService, PostHogAnalyticsService],
  exports: [MarketingService],
})
export class MarketingModule {}
