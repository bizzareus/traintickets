import { Module } from '@nestjs/common';
import { ChartAlertPaymentsController } from './chart-alert-payments.controller';
import { ChartAlertPaymentsService } from './chart-alert-payments.service';
import { RazorpayModule } from './razorpay.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AvailabilityModule } from '../availability/availability.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    AvailabilityModule,
    RazorpayModule,
    NotificationModule,
  ],
  controllers: [ChartAlertPaymentsController],
  providers: [ChartAlertPaymentsService],
  exports: [ChartAlertPaymentsService],
})
export class ChartAlertPaymentsModule {}
