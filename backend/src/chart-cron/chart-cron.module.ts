import { Module } from '@nestjs/common';
import { ChartCronService } from './chart-cron.service';
import { CronLeaderModule } from './cron-leader.module';
import { AvailabilityModule } from '../availability/availability.module';
import { NotificationModule } from '../notification/notification.module';
import { FailedDeliveryRefundService } from './failed-delivery-refund.service';

@Module({
  imports: [AvailabilityModule, CronLeaderModule, NotificationModule],
  providers: [ChartCronService, FailedDeliveryRefundService],
})
export class ChartCronModule {}
