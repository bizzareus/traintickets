import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { normalizeE164Mobile } from '../notification.helpers';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';
import { createRetryingAxiosClient } from '../../common/retrying-axios';

const MSG91_DEFAULT_API_URL =
  'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
const MSG91_DEFAULT_INTEGRATED_NUMBER = '15554731911';
const MSG91_DEFAULT_NAMESPACE = '6d56ff76_c549_4ce8_a6b5_280c2377d64b';
const MSG91_LANGUAGE_CODE = 'en';

/**
 * MSG91 template catalogue. `slots` is the number of `body_N` components the
 * approved template expects. Bodies are filled positionally from the payload
 * parameters (parameters[i] -> body_{i+1}); extras are dropped, missing slots
 * are sent as `N/A`.
 */
const MSG91_TEMPLATES: Record<string, { name: string; slots: number }> = {
  chart_alert_tickets_found: { name: 'chart_alert_tickets_found', slots: 4 },
  chart_alert_no_ticket_found: {
    name: 'chart_alert_no_ticket_found',
    slots: 5,
  },
  chart_prepare: { name: 'chart_prepare', slots: 4 },
  ticket_not_found_alternate: { name: 'ticket_not_found_alternate', slots: 10 },
};

/**
 * Legacy template names used by NotificationService mapped to
 * their MSG91 equivalent. `subscription_alert` / `chart_preparation_alert`
 * are shared by the seats-found flow (many parameters) and the
 * chart-prepared-only flow (few parameters) — disambiguated by count.
 */
function resolveMsg91Template(
  templateName: string | undefined,
  paramCount: number,
): { name: string; slots: number } {
  const normalized = String(templateName ?? '')
    .trim()
    .toLowerCase();
  if (MSG91_TEMPLATES[normalized]) return MSG91_TEMPLATES[normalized];
  if (normalized === 'alternative_train_alert')
    return MSG91_TEMPLATES.ticket_not_found_alternate;
  if (
    normalized === 'uncovered_leg__shortlink_alert' ||
    normalized === 'uncovered_leg_alert'
  )
    return MSG91_TEMPLATES.chart_alert_no_ticket_found;
  if (
    normalized === 'subscription_alert' ||
    normalized === 'chart_preparation_alert' ||
    !normalized
  ) {
    return paramCount <= 5
      ? MSG91_TEMPLATES.chart_prepare
      : MSG91_TEMPLATES.chart_alert_tickets_found;
  }
  // Unknown template: pass the name through, sending up to 10 bodies.
  return { name: String(templateName).trim(), slots: 10 };
}

function toMsg91Number(phone: string): string {
  return normalizeE164Mobile(phone).replace(/^\+/, '');
}

@Injectable()
export class Msg91Provider implements WhatsAppProvider {
  readonly providerName = 'msg91';
  private readonly logger = new Logger(Msg91Provider.name);
  private readonly authKey: string | undefined;
  private readonly integratedNumber: string;
  private readonly namespace: string;
  private readonly apiUrl: string;
  private readonly httpClient: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.authKey = this.config.get<string>('MSG91_AUTH_KEY')?.trim();
    this.integratedNumber =
      this.config.get<string>('MSG91_INTEGRATED_NUMBER')?.trim() ||
      MSG91_DEFAULT_INTEGRATED_NUMBER;
    this.namespace =
      this.config.get<string>('MSG91_NAMESPACE')?.trim() ||
      MSG91_DEFAULT_NAMESPACE;
    this.apiUrl =
      this.config.get<string>('MSG91_API_URL')?.trim() || MSG91_DEFAULT_API_URL;
    this.httpClient = createRetryingAxiosClient({
      retries: 3,
      retryPost: true,
      serviceName: 'msg91',
      retryStatuses: [429, 500, 502, 503, 504],
      retryDelayMs: 1500,
    });
  }

  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean> {
    this.logger.log(`MSG91 provider send called for ${payload.mobile}`);

    if (!this.authKey) {
      this.logger.warn(
        'MSG91_AUTH_KEY is missing in configuration; skipping WhatsApp send.',
      );
      return false;
    }

    const to = toMsg91Number(payload.mobile);
    if (!to) {
      this.logger.warn(
        `MSG91 send skipped: could not normalize mobile '${payload.mobile}'.`,
      );
      return false;
    }

    const params = payload.parameters ?? [];
    const template = resolveMsg91Template(payload.templateName, params.length);
    const values = params.map((p) => String(p.value ?? '').trim() || 'N/A');
    if (values.length > template.slots) {
      this.logger.warn(
        `MSG91 template '${template.name}' takes ${template.slots} bodies but got ${values.length} parameters; extras dropped.`,
      );
    }
    const components: Record<string, { type: string; value: string }> = {};
    for (let i = 0; i < template.slots; i++) {
      components[`body_${i + 1}`] = {
        type: 'text',
        value: values[i] ?? 'N/A',
      };
    }

    const body = {
      integrated_number: this.integratedNumber,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: template.name,
          language: { code: MSG91_LANGUAGE_CODE, policy: 'deterministic' },
          namespace: this.namespace,
          to_and_components: [{ to: [to], components }],
        },
      },
    };

    try {
      await this.httpClient.post(this.apiUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          authkey: this.authKey,
        },
        timeout: 15_000,
      });
      this.logger.log(
        `MSG91 template '${template.name}' sent successfully to ${to}`,
      );
      return true;
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status ?? 'ERR'}: ${err.message}${
            err.response?.data
              ? `\nMSG91 Response Data: ${typeof err.response.data === 'object' ? JSON.stringify(err.response.data, null, 2) : String(err.response.data)}`
              : ''
          }`
        : err instanceof Error
          ? err.stack || err.message
          : String(err);
      this.logger.error(`MSG91 WhatsApp send failed for ${to}: ${errorMsg}`);
      return false;
    }
  }
}
