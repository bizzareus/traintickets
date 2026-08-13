import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';

function normalizeWatiNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

@Injectable()
export class WatiProvider implements WhatsAppProvider {
  readonly providerName = 'wati';
  private readonly logger = new Logger(WatiProvider.name);
  private readonly apiEndpoint: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly channelNumber: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.apiEndpoint = this.config
      .get<string>('WATI_API_ENDPOINT')
      ?.trim()
      ?.replace(/\/+$/, '');
    this.accessToken = this.config.get<string>('WATI_ACCESS_TOKEN')?.trim();
    this.channelNumber = this.config.get<string>('WATI_CHANNEL_NUMBER')?.trim();
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    this.logger.log(`Wati provider send called for ${payload.mobile}`);

    if (!this.apiEndpoint || !this.accessToken) {
      this.logger.warn(
        'WATI_API_ENDPOINT or WATI_ACCESS_TOKEN missing in configuration.',
      );
      return false;
    }

    const templateName = payload.templateName;
    if (!templateName) {
      this.logger.warn(
        'No templateName specified for WATI send. Skipping WATI template message.',
      );
      return false;
    }

    const whatsappNumber = normalizeWatiNumber(payload.mobile);
    const v1Url = `${this.apiEndpoint}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(whatsappNumber)}`;
    const v2Url = `${this.apiEndpoint}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(whatsappNumber)}`;

    const body: Record<string, unknown> = {
      template_name: templateName,
      broadcast_name: payload.broadcastName || 'lastberth_alert',
      parameters: (payload.parameters || []).map((p) => ({
        name: p.name,
        value: String(p.value ?? '').trim() || 'N/A',
      })),
    };
    if (this.channelNumber) {
      body.channel_number = this.channelNumber;
    }

    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    for (const url of [v1Url, v2Url]) {
      try {
        const response = await axios.post(url, body, {
          headers,
          timeout: 15_000,
        });

        const resData = response.data as {
          result?: boolean;
          validWhatsAppNumber?: boolean;
        };
        if (resData?.result === true) {
          this.logger.log(
            `WATI template '${templateName}' sent successfully to ${whatsappNumber}`,
          );
          return true;
        }

        this.logger.warn(`WATI response result indicated failure`, resData);
        return false;
      } catch (err) {
        if (
          axios.isAxiosError(err) &&
          err.response?.status === 404 &&
          url === v1Url
        ) {
          this.logger.warn(
            `WATI v1 endpoint returned 404, attempting fallback to v2 endpoint...`,
          );
          continue;
        }
        this.logger.error(
          `WATI WhatsApp send failed for template '${templateName}'`,
          err,
        );
        return false;
      }
    }
    return false;
  }
}
