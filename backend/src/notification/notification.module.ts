import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { ShortLinkModule } from '../short-link/short-link.module';

@Module({
  imports: [ChartTimeModule, ShortLinkModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
