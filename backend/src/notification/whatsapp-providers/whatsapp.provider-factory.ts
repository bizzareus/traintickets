import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';
import { WasenderProvider } from './wasender.provider';
import { WatiProvider } from './wati.provider';

@Injectable()
export class WhatsAppProviderFactory implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProviderFactory.name);
  private readonly provider: WhatsAppProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly wasenderProvider: WasenderProvider,
    private readonly watiProvider: WatiProvider,
  ) {
    const activeProviderName = this.config
      .get<string>('WHATSAPP_PROVIDER')
      ?.trim()
      ?.toLowerCase();

    if (activeProviderName === 'wati') {
      this.provider = this.watiProvider;
      this.logger.log('Active WhatsApp Provider Strategy: WATI');
    } else {
      this.provider = this.wasenderProvider;
      this.logger.log('Active WhatsApp Provider Strategy: WASender');
    }
  }

  get providerName(): string {
    return this.provider.providerName;
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    return this.provider.sendWhatsApp(payload);
  }
}
