import { Module } from '@nestjs/common';
import { RazorpayModule } from '../chart-alert-payments/razorpay.module';
import { ChartAlertRefundsService } from '../chart-alert-payments/chart-alert-refunds.service';
import { ResendWebhookController } from './resend-webhook.controller';
import { ResendWebhookService } from './resend-webhook.service';

@Module({
  imports: [RazorpayModule],
  controllers: [ResendWebhookController],
  providers: [ResendWebhookService, ChartAlertRefundsService],
})
export class ResendWebhookModule {}
