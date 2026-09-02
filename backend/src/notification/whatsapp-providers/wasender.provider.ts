import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { Resend } from 'resend';
import { normalizeE164Mobile } from '../notification.helpers';
import { escapeHtml } from '../templates/notification-email.templates';
import {
  WhatsAppProvider,
  SendWhatsAppPayload,
} from './whatsapp-provider.interface';
import { createRetryingAxiosClient } from '../../common/retrying-axios';

const WASENDER_BASE = 'https://www.wasenderapi.com';
const RESEND_FROM = 'LastBerth Notifications <notification@lastberth.com>';
const DEFAULT_MONITORING_ADMIN_EMAIL = 'me@kartikarora.in';

function toE164(phone: string): string {
  return normalizeE164Mobile(phone);
}

@Injectable()
export class WasenderProvider implements WhatsAppProvider {
  readonly providerName = 'wasender';
  private readonly logger = new Logger(WasenderProvider.name);
  private readonly wasenderKey: string | undefined;
  private readonly httpClient: AxiosInstance;
  private readonly resend: Resend | null;
  private readonly adminEmail: string;

  constructor(private readonly config: ConfigService) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY')?.trim();
    const resendKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.resend = resendKey ? new Resend(resendKey) : null;
    this.adminEmail =
      this.config.get<string>('MONITORING_ADMIN_EMAIL')?.trim() ||
      DEFAULT_MONITORING_ADMIN_EMAIL;
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
    const to = toE164(payload.mobile);

    if (!this.wasenderKey) {
      const errorMsg =
        'WASender API key is missing in configuration (WASENDER_API_KEY is not set).';
      this.logger.warn(errorMsg);
      await this.sendErrorEmail(to, errorMsg, payload);
      return false;
    }

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
        await this.sendErrorEmail(to, errorMsg, payload);
      }
      return false;
    }
  }

  private async sendErrorEmail(
    toPhone: string,
    errorMsg: string,
    payload: SendWhatsAppPayload,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not configured; cannot send WASender failure email to ${this.adminEmail}`,
      );
      return;
    }

    const subject = `[WASender Failure] WhatsApp delivery failed for ${toPhone}`;
    const formattedError = escapeHtml(errorMsg);
    const formattedPayload = escapeHtml(JSON.stringify(payload, null, 2));

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;background-color:#f8fafc;padding:20px;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
      <h2 style="color:#991b1b;margin:0 0 4px 0;font-size:18px;">⚠️ WASender API Failure</h2>
      <p style="color:#7f1d1d;margin:0;font-size:14px;">An error occurred while attempting to send a WhatsApp message via WASender.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;color:#64748b;font-weight:600;width:140px;">Recipient Mobile</td>
        <td style="padding:8px;font-weight:600;color:#0f172a;">${escapeHtml(toPhone)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;color:#64748b;font-weight:600;">Timestamp</td>
        <td style="padding:8px;color:#475569;">${new Date().toISOString()}</td>
      </tr>
    </table>

    <h3 style="color:#334155;margin:20px 0 8px 0;font-size:15px;">Error Reported from WASender</h3>
    <pre style="background:#0f172a;color:#f8fafc;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;font-family:monospace;">${formattedError}</pre>

    <h3 style="color:#334155;margin:20px 0 8px 0;font-size:15px;">Message Payload</h3>
    <pre style="background:#f1f5f9;color:#334155;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;font-family:monospace;border:1px solid #e2e8f0;">${formattedPayload}</pre>
  </div>
</body>
</html>
`;

    try {
      await this.resend.emails.send({
        from: RESEND_FROM,
        to: [this.adminEmail],
        subject,
        html,
      });
      this.logger.log(
        `Sent WASender error notification email to ${this.adminEmail}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send WASender failure email to ${this.adminEmail}`,
        err,
      );
    }
  }
}
