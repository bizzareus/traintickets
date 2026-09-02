import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { ShortLinkModule } from '../short-link/short-link.module';
import { WasenderProvider } from './whatsapp-providers/wasender.provider';
import { WatiProvider } from './whatsapp-providers/wati.provider';
import { WhatsAppProviderFactory } from './whatsapp-providers/whatsapp.provider-factory';

import { NotificationDeduplicationService } from './notification-deduplication.service';
import { NotificationUnsubscribeService } from './notification-unsubscribe.service';
import { NotificationUnsubscribeController } from './notification-unsubscribe.controller';

@Module({
  imports: [ChartTimeModule, ShortLinkModule],
  controllers: [NotificationUnsubscribeController],
  providers: [
    WasenderProvider,
    WatiProvider,
    WhatsAppProviderFactory,
    NotificationDeduplicationService,
    NotificationUnsubscribeService,
    NotificationService,
  ],
  exports: [
    WasenderProvider,
    WatiProvider,
    WhatsAppProviderFactory,
    NotificationDeduplicationService,
    NotificationUnsubscribeService,
    NotificationService,
  ],
})
export class NotificationModule {}
