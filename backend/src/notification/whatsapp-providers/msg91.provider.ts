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
 * MSG91 template catalogue, mirroring the approved WhatsApp templates in the
 * MSG91 dashboard (WABA Lastberth). `slots` is the number of `body_N`
 * components the approved template expects. Bodies are filled positionally
 * from the payload parameters (parameters[i] -> body_{i+1}); extras are
 * dropped, missing slots are sent as `N/A`.
 *
 * Dashboard bodies (en):
 * - chart_alert_tickets_found (4): {{1}} train line, {{2}} route + date,
 *   {{3}} availability block, {{4}} ticket/booking block.
 * - chart_alert_no_ticket_found (5): {{1}} train, {{2}} route, {{3}} date,
 *   {{4}} alt-trains short code, {{5}} unsubscribe short code.
 * - chart_prepare (4): {{1}} train, {{2}} chart time, {{3}} check-tickets
 *   short code, {{4}} unsubscribe short code.
 * - ticket_not_found_alternate (10): {{1}} class, {{2}} route, {{3}} top alt
 *   train, {{4}} dep, {{5}} arr, {{6}} duration, {{7}} availability,
 *   {{8}} class, {{9}} alert short code, {{10}} date.
 */
const MSG91_TEMPLATES: Record<string, { name: string; slots: number }> = {
  chart_alert_tickets_found: { name: 'chart_alert_tickets_found', slots: 4 },
  chart_alert_no_ticket_found: {
    name: 'chart_alert_no_ticket_found',
    slots: 5,
  },
  chart_prepare: { name: 'chart_prepare', slots: 4 },
  ticket_not_found_alternate: { name: 'ticket_not_found_alternate', slots: 10 },
  // Transactional templates (Utility). Bodies:
  // - tatkal_alert_confirmed (6): {{1}} train, {{2}} tatkal date,
  //   {{3}} tatkal time, {{4}} journey date, {{5}} class, {{6}} freeze time.
  tatkal_alert_confirmed: { name: 'tatkal_alert_confirmed', slots: 6 },
  // - chart_alert_confirmed (5): {{1}} train, {{2}} route, {{3}} date,
  //   {{4}} class, {{5}} payment/schedule block.
  chart_alert_confirmed: { name: 'chart_alert_confirmed', slots: 5 },
  // - check_failed_notice (4): {{1}} train, {{2}} route, {{3}} time,
  //   {{4}} search short code.
  check_failed_notice: { name: 'check_failed_notice', slots: 4 },
  // - manual_booking_admin (7): {{1}} ref, {{2}} train, {{3}} route,
  //   {{4}} date, {{5}} class/quota, {{6}} amount, {{7}} customer contact.
  manual_booking_admin: { name: 'manual_booking_admin', slots: 7 },
  // - split_booking_confirmed (7): {{1}} train no, {{2}} route, {{3}} date,
  //   {{4}} ref, {{5}} PNR block, {{6}} passenger block, {{7}} PDF block.
  split_booking_confirmed: { name: 'split_booking_confirmed', slots: 7 },
  // - split_booking_payment_received (6): {{1}} amount, {{2}} ref,
  //   {{3}} train no, {{4}} route, {{5}} date, {{6}} ref for cancel link.
  split_booking_payment_received: {
    name: 'split_booking_payment_received',
    slots: 6,
  },
  // - split_booking_cancellation_admin (10): {{1}} ref, {{2}} train no,
  //   {{3}} route, {{4}} date, {{5}} amount, {{6}} customer, {{7}} mobile,
  //   {{8}} PNRs, {{9}} status, {{10}} reason.
  split_booking_cancellation_admin: {
    name: 'split_booking_cancellation_admin',
    slots: 10,
  },
};

/**
 * Legacy template names previously sent by NotificationService, kept as
 * aliases so older payloads still resolve to the matching dashboard template.
 */
const MSG91_TEMPLATE_ALIASES: Record<string, string> = {
  subscription_alert: 'chart_alert_tickets_found',
  chart_preparation_alert: 'chart_prepare',
  alternative_train_alert: 'ticket_not_found_alternate',
  uncovered_leg__shortlink_alert: 'chart_alert_no_ticket_found',
  uncovered_leg_alert: 'chart_alert_no_ticket_found',
};

function resolveMsg91Template(templateName: string | undefined): {
  name: string;
  slots: number;
} {
  const normalized = String(templateName ?? '')
    .trim()
    .toLowerCase();
  if (MSG91_TEMPLATES[normalized]) return MSG91_TEMPLATES[normalized];
  const aliased = MSG91_TEMPLATE_ALIASES[normalized];
  if (aliased && MSG91_TEMPLATES[aliased]) return MSG91_TEMPLATES[aliased];
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
      retries: 0,
      retryPost: false,
      serviceName: 'msg91',
      timeoutMs: 15_000,
      maxResponseBytes: 1024 * 1024,
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
    const template = resolveMsg91Template(payload.templateName);
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
