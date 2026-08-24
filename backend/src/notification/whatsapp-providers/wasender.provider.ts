import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { normalizeE164Mobile } from '../notification.helpers';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';
import { createRetryingAxiosClient } from '../../common/retrying-axios';

const WASENDER_BASE = 'https://www.wasenderapi.com';

function toE164(phone: string): string {
  return normalizeE164Mobile(phone);
}

@Injectable()
export class WasenderProvider implements WhatsAppProvider {
  readonly providerName = 'wasender';
  private readonly logger = new Logger(WasenderProvider.name);
  private readonly wasenderKey: string | undefined;
  private readonly httpClient: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY')?.trim();
    this.httpClient = createRetryingAxiosClient({
      retries: 3,
      retryPost: true,
      serviceName: 'wasender',
      retryStatuses: [429, 500, 502, 503, 504],
      retryDelayMs: 1500,
    });
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    this.logger.log(`WASender provider send called for ${payload.mobile}`);
    if (!this.wasenderKey) {
      this.logger.warn('WASender API key is missing. Message skipped.');
      return false;
    }

    const to = toE164(payload.mobile);

    try {
      await this.httpClient.post(
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
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? `${err.message}${err.response?.data ? ` - ${JSON.stringify(err.response.data)}` : ''}`
        : err instanceof Error
          ? err.message
          : String(err);

      this.logger.error(`WASender WhatsApp send failed for ${to}: ${errorMsg}`);
      return false;
    }
  }
}
