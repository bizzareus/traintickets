import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { ShortLinkModule } from '../short-link/short-link.module';
import { WasenderProvider } from './whatsapp-providers/wasender.provider';
import { WatiProvider } from './whatsapp-providers/wati.provider';
import { WhatsAppProviderFactory } from './whatsapp-providers/whatsapp.provider-factory';

@Module({
  imports: [ChartTimeModule, ShortLinkModule],
  providers: [
    WasenderProvider,
    WatiProvider,
    WhatsAppProviderFactory,
    NotificationService,
  ],
  exports: [
    WasenderProvider,
    WatiProvider,
    WhatsAppProviderFactory,
    NotificationService,
  ],
})
export class NotificationModule {}
