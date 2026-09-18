import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RazorpayModule } from '../chart-alert-payments/razorpay.module';
import { SplitBookingController } from './split-booking.controller';
import { SplitBookingService } from './split-booking.service';
import { TripmgtBookingService } from './tripmgt-booking.service';

@Module({
  imports: [ConfigModule, PrismaModule, RazorpayModule],
  controllers: [SplitBookingController],
  providers: [SplitBookingService, TripmgtBookingService],
  exports: [SplitBookingService, TripmgtBookingService],
})
export class SplitBookingModule {}
