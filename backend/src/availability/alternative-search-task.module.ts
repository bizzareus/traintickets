import { Module } from '@nestjs/common';
import { AlternativeSearchTaskService } from './alternative-search-task.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingV2Module } from '../booking-v2/booking-v2.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, BookingV2Module, NotificationModule],
  providers: [AlternativeSearchTaskService],
  exports: [AlternativeSearchTaskService],
})
export class AlternativeSearchTaskModule {}
