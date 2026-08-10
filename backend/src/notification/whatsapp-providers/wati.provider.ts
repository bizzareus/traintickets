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
    const url = `${this.apiEndpoint}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(whatsappNumber)}`;

    const body = {
      template_name: templateName,
      broadcast_name: payload.broadcastName || 'lastberth_alert',
      channel_number: this.channelNumber || '',
      parameters: (payload.parameters || []).map((p) => ({
        name: p.name,
        value: String(p.value ?? ''),
      })),
    };

    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
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
      this.logger.error(
        `WATI WhatsApp send failed for template '${templateName}'`,
        err,
      );
      return false;
    }
  }
}
