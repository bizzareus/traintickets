import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RazorpayModule } from '../chart-alert-payments/razorpay.module';
import { SplitBookingController } from './split-booking.controller';
import { SplitBookingService } from './split-booking.service';
import { TripmgtBookingService } from './tripmgt-booking.service';
import { BookingV2Module } from '../booking-v2/booking-v2.module';
import { NotificationModule } from '../notification/notification.module';
import { ManualBookingService } from './manual-booking.service';
import { S3StorageService } from '../common/s3-storage.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RazorpayModule,
    BookingV2Module,
    NotificationModule,
  ],
  controllers: [SplitBookingController],
  providers: [
    SplitBookingService,
    TripmgtBookingService,
    ManualBookingService,
    S3StorageService,
  ],
  exports: [SplitBookingService, TripmgtBookingService, S3StorageService],
})
export class SplitBookingModule {}
