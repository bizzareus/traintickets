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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      } catch (err: unknown) {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        const errorMsg = axios.isAxiosError(err)
          ? `${err.message}${err.response?.data ? ` - ${JSON.stringify(err.response.data)}` : ''}`
          : err instanceof Error
            ? err.message
            : String(err);

        const isRetryable =
          status === 429 || (status !== undefined && status >= 500) || !status;

        if (isRetryable && attempt < maxAttempts) {
          const delayMs = attempt * 1500;
          this.logger.warn(
            `WASender WhatsApp send attempt ${attempt} failed for ${to} (${errorMsg}), retrying in ${delayMs}ms...`,
          );
          await sleep(delayMs);
          continue;
        }

        this.logger.error(
          `WASender WhatsApp send failed for ${to}: ${errorMsg}`,
        );
        return false;
      }
    }

    return false;
  }
}
