import { Module } from '@nestjs/common';
import { RefundRequestController } from './refund-request.controller';
import { RefundRequestService } from './refund-request.service';
import { NotificationModule } from '../notification/notification.module';
import { RazorpayModule } from '../chart-alert-payments/razorpay.module';

@Module({
  imports: [NotificationModule, RazorpayModule],
  controllers: [RefundRequestController],
  providers: [RefundRequestService],
  exports: [RefundRequestService],
})
export class RefundRequestModule {}
