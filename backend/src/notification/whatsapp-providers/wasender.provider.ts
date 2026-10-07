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
      retries: 0,
      retryPost: false,
      serviceName: 'wasender',
      timeoutMs: 15_000,
      maxResponseBytes: 1024 * 1024,
    });
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    this.logger.log(`WASender provider send called for ${payload.mobile}`);
    const to = toE164(payload.mobile);

    if (!this.wasenderKey) {
      this.logger.warn(
        'WASender API key is missing in configuration (WASENDER_API_KEY is not set).',
      );
      return false;
    }

    try {
      const response = await this.httpClient.post<{
        success?: boolean;
        message?: string;
      }>(
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
      if (response.data?.success !== true) {
        throw new Error(
          response.data?.message || 'WASender did not accept the message',
        );
      }
      this.logger.log(`WASender message sent successfully to ${to}`);
      return true;
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status ?? 'ERR'}: ${err.message}${
            err.response?.data
              ? `\nWASender Response Data: ${typeof err.response.data === 'object' ? JSON.stringify(err.response.data, null, 2) : String(err.response.data)}`
              : ''
          }`
        : err instanceof Error
          ? err.stack || err.message
          : String(err);

      const isUnregisteredJid =
        axios.isAxiosError(err) &&
        typeof err.response?.data === 'object' &&
        JSON.stringify(err.response?.data).includes(
          'does not exist on WhatsApp',
        );

      if (isUnregisteredJid) {
        this.logger.warn(
          `WASender WhatsApp recipient ${to} does not exist on WhatsApp: ${errorMsg}`,
        );
      } else {
        this.logger.error(
          `WASender WhatsApp send failed for ${to}: ${errorMsg}`,
        );
      }
      return false;
    }
  }
}
