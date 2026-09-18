import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';
import { WasenderProvider } from './wasender.provider';
import { Msg91Provider } from './msg91.provider';

@Injectable()
export class WhatsAppProviderFactory implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProviderFactory.name);
  private readonly provider: WhatsAppProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly wasenderProvider: WasenderProvider,
    private readonly msg91Provider: Msg91Provider,
  ) {
    const activeProviderName = this.config
      .get<string>('WHATSAPP_PROVIDER')
      ?.trim()
      ?.toLowerCase();

    if (activeProviderName === 'wasender') {
      this.provider = this.wasenderProvider;
      this.logger.log('Active WhatsApp Provider Strategy: WASender');
    } else {
      this.provider = this.msg91Provider;
      this.logger.log('Active WhatsApp Provider Strategy: MSG91');
    }
  }

  get providerName(): string {
    return this.provider.providerName;
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    return this.provider.sendWhatsApp(payload);
  }
}
