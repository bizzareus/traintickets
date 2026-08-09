import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ChartTimeModule } from '../chart-time/chart-time.module';

@Module({
  imports: [ChartTimeModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
