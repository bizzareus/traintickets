import { Module } from '@nestjs/common';
import { RefundRequestController } from './refund-request.controller';
import { RefundRequestService } from './refund-request.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [RefundRequestController],
  providers: [RefundRequestService],
  exports: [RefundRequestService],
})
export class RefundRequestModule {}
