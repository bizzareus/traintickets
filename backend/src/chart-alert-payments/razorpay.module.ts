import { Module } from '@nestjs/common';
import { RazorpayClient } from './razorpay.client';

/**
 * Standalone so both ChartAlertPaymentsModule and AvailabilityModule
 * (refunds service, kept out of the payments module to avoid a
 * JourneyTask circular dependency) can inject the client.
 */
@Module({
  providers: [RazorpayClient],
  exports: [RazorpayClient],
})
export class RazorpayModule {}
