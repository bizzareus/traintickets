import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { ShortLinkModule } from '../short-link/short-link.module';
import { WasenderProvider } from './whatsapp-providers/wasender.provider';
import { WatiProvider } from './whatsapp-providers/wati.provider';
import { WhatsAppProviderFactory } from './whatsapp-providers/whatsapp.provider-factory';

import { NotificationDeduplicationService } from './notification-deduplication.service';

@Module({
  imports: [ChartTimeModule, ShortLinkModule],
  providers: [
    WasenderProvider,
    WatiProvider,
    WhatsAppProviderFactory,
    NotificationDeduplicationService,
    NotificationService,
  ],
  exports: [
    WasenderProvider,
    WatiProvider,
    WhatsAppProviderFactory,
    NotificationDeduplicationService,
    NotificationService,
  ],
})
export class NotificationModule {}
