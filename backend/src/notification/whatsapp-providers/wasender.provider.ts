import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { normalizeE164Mobile } from '../notification.helpers';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';

const WASENDER_BASE = 'https://www.wasenderapi.com';

function toE164(phone: string): string {
  return normalizeE164Mobile(phone);
}

@Injectable()
export class WasenderProvider implements WhatsAppProvider {
  readonly providerName = 'wasender';
  private readonly logger = new Logger(WasenderProvider.name);
  private readonly wasenderKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY')?.trim();
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    this.logger.log(`WASender provider send called for ${payload.mobile}`);
    if (!this.wasenderKey) {
      this.logger.warn('WASender API key is missing. Message skipped.');
      return false;
    }

    const to = toE164(payload.mobile);
    try {
      await axios.post(
        `${WASENDER_BASE}/api/send-message`,
        {
          to: to.startsWith('+') ? to : `+${to}`,
          text: payload.text,
        },
        {
          headers: {
            Authorization: `Bearer ${this.wasenderKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
      this.logger.log(`WASender message sent successfully to ${to}`);
      return true;
    } catch (err) {
      this.logger.error('WASender WhatsApp send failed', err);
      return false;
    }
  }
}
