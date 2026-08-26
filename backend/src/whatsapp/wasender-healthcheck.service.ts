import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios, { type AxiosInstance } from 'axios';
import QRCode from 'qrcode';
import { Resend } from 'resend';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { renderWasenderQrEmailHtml } from './templates/wasender-qr-email.template';

const WASENDER_BASE = 'https://www.wasenderapi.com';
const RESEND_FROM = 'LastBerth Notifications <notification@lastberth.com>';
const DEFAULT_MONITORING_ADMIN_EMAIL = 'me@kartikarora.in';

export interface WasenderHealthcheckResult {
  healthy: boolean;
  status: string;
  qrSent: boolean;
  message: string;
  sessionId?: string;
  timestamp: string;
  error?: string | null;
}

export interface WasenderHealthState {
  enabled: boolean;
  lastCheckTime: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastQrSentAt: string | null;
  isChecking: boolean;
  sessionId: string;
  adminEmail: string;
}

@Injectable()
export class WasenderHealthcheckService {
  private readonly logger = new Logger(WasenderHealthcheckService.name);
  private readonly httpClient: AxiosInstance;
  private readonly resend: Resend | null;
  private readonly adminEmail: string;

  private lastCheckTime: string | null = null;
  private lastStatus: string | null = null;
  private lastError: string | null = null;
  private lastQrSentAt: string | null = null;
  private isChecking = false;

  constructor(private readonly config: ConfigService) {
    const resendKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.resend = resendKey ? new Resend(resendKey) : null;
    this.adminEmail =
      this.config.get<string>('MONITORING_ADMIN_EMAIL')?.trim() ||
      DEFAULT_MONITORING_ADMIN_EMAIL;

    this.httpClient = createRetryingAxiosClient({
      retries: 2,
      retryPost: true,
      serviceName: 'wasender-healthcheck',
      retryStatuses: [429, 500, 502, 503, 504],
      retryDelayMs: 1500,
    });
  }

  private get wasenderKey(): string | undefined {
    return this.config.get<string>('WASENDER_API_KEY')?.trim();
  }

  private get wasenderPat(): string | undefined {
    return (
      this.config.get<string>('WASENDER_PERSONAL_ACCESS_TOKEN')?.trim() ||
      this.wasenderKey
    );
  }

  private get sessionId(): string {
    return (
      this.config.get<string>('WASENDER_SESSION_ID')?.trim() ||
      this.config.get<string>('WASENDER_INSTANCE_ID')?.trim() ||
      '1'
    );
  }

  /**
   * Cron job running every 30 minutes to check Wasender WhatsApp connection health.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleScheduledHealthcheck(): Promise<void> {
    this.logger.log('Executing scheduled 30-minute WASender healthcheck...');
    try {
      await this.checkHealth('cron');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Scheduled WASender healthcheck failed: ${msg}`);
    }
  }

  /**
   * Inspects WhatsApp session status and initiates reconnection if logged out / disconnected.
   */
  async checkHealth(source = 'manual'): Promise<WasenderHealthcheckResult> {
    const timestamp = new Date().toISOString();
    this.lastCheckTime = timestamp;

    if (!this.wasenderKey) {
      const msg = 'WASENDER_API_KEY is not set; skipping healthcheck.';
      this.logger.warn(msg);
      this.lastStatus = 'NOT_CONFIGURED';
      this.lastError = msg;
      return {
        healthy: false,
        status: 'NOT_CONFIGURED',
        qrSent: false,
        message: msg,
        timestamp,
        error: msg,
      };
    }

    if (this.isChecking) {
      return {
        healthy: this.lastStatus === 'connected',
        status: this.lastStatus || 'CHECK_IN_PROGRESS',
        qrSent: false,
        message: 'A healthcheck is already running in background.',
        timestamp,
      };
    }

    this.isChecking = true;
    try {
      this.logger.log(
        `Checking WASender session status (source=${source}, session=${this.sessionId})...`,
      );

      let status = 'unknown';
      try {
        const response = await this.httpClient.get<{
          status?: string;
          success?: boolean;
          message?: string;
        }>(`${WASENDER_BASE}/api/status`, {
          headers: {
            Authorization: `Bearer ${this.wasenderKey}`,
            Accept: 'application/json',
          },
          timeout: 15_000,
        });

        status = (
          response.data?.status ||
          (response.data?.success ? 'connected' : 'unknown')
        ).toLowerCase();
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const resData = err.response?.data as
            | { status?: string; message?: string; success?: boolean }
            | undefined;
          if (resData?.status) {
            status = resData.status.toLowerCase();
          } else if (
            err.response?.status === 401 ||
            err.response?.status === 404
          ) {
            // Session not found or unauthenticated for API key -> requires reconnect/link
            status = 'logged_out';
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      this.lastStatus = status;

      if (status === 'connected') {
        this.logger.log(
          `WASender WhatsApp session #${this.sessionId} is connected and healthy.`,
        );
        this.lastError = null;
        return {
          healthy: true,
          status: 'connected',
          qrSent: false,
          message: 'WhatsApp session is active and connected.',
          sessionId: this.sessionId,
          timestamp,
        };
      }

      this.logger.warn(
        `WASender WhatsApp session #${this.sessionId} is not connected (status=${status}). Requesting QR code for reconnection...`,
      );

      const reconnectResult = await this.reconnectAndSendQr(
        this.sessionId,
        status,
        source,
      );
      this.lastError = reconnectResult.error || null;

      return {
        healthy: false,
        status,
        qrSent: reconnectResult.qrSent,
        message: reconnectResult.message,
        sessionId: this.sessionId,
        timestamp,
        error: reconnectResult.error,
      };
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status ?? 'ERR'}: ${err.message}${
            err.response?.data ? ` (${JSON.stringify(err.response.data)})` : ''
          }`
        : err instanceof Error
          ? err.message
          : String(err);

      this.logger.error(`WASender healthcheck error: ${errorMsg}`);
      this.lastError = errorMsg;
      this.lastStatus = 'ERROR';

      return {
        healthy: false,
        status: 'ERROR',
        qrSent: false,
        message: `Healthcheck failed: ${errorMsg}`,
        sessionId: this.sessionId,
        timestamp,
        error: errorMsg,
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Calls Wasender session connect API, generates QR image, and sends it via email.
   */
  async reconnectAndSendQr(
    sessionId: string,
    currentStatus: string,
    source = 'manual',
  ): Promise<{ qrSent: boolean; message: string; error?: string }> {
    const token = this.wasenderPat || this.wasenderKey;
    if (!token) {
      const err = 'No WASender token available to initiate session connect.';
      this.logger.error(err);
      return { qrSent: false, message: err, error: err };
    }

    try {
      this.logger.log(
        `Calling WASender connect API for session ${sessionId}...`,
      );

      let qrCodeString: string | undefined;

      // 1. Call connect endpoint
      try {
        const connectRes = await this.httpClient.post<{
          success?: boolean;
          data?: {
            status?: string;
            qrCode?: string;
            message?: string;
          };
          error?: string;
          message?: string;
        }>(
          `${WASENDER_BASE}/api/whatsapp-sessions/${sessionId}/connect`,
          { linkMethod: 'qr' },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 20_000,
          },
        );

        if (connectRes.data?.data?.qrCode) {
          qrCodeString = connectRes.data.data.qrCode;
        } else if (
          connectRes.data?.data?.status?.toLowerCase() === 'connected'
        ) {
          this.lastStatus = 'connected';
          return {
            qrSent: false,
            message: 'Session is already connected according to connect API.',
          };
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Connect endpoint returned an error, attempting fallback QR fetch: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      // 2. If QR code string was not directly returned, fallback to /qrcode endpoint
      if (!qrCodeString) {
        try {
          const qrRes = await this.httpClient.get<{
            success?: boolean;
            data?: { qrCode?: string };
            error?: string;
          }>(`${WASENDER_BASE}/api/whatsapp-sessions/${sessionId}/qrcode`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            timeout: 15_000,
          });
          qrCodeString = qrRes.data?.data?.qrCode;
        } catch (err: unknown) {
          this.logger.warn(
            `Fallback QR endpoint also failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (!qrCodeString) {
        const errMsg = `Could not retrieve QR code string from WASender connect/qrcode endpoints for session #${sessionId}.`;
        this.logger.error(errMsg);
        await this.sendAlertEmail(
          `⚠️ [WASender Alert] WhatsApp Disconnected - Failed to generate QR`,
          `<div style="font-family:sans-serif;padding:16px;">
            <h2>WhatsApp Session Logged Out</h2>
            <p>Session <strong>#${sessionId}</strong> status: <strong>${currentStatus}</strong> (Trigger: ${source}).</p>
            <p style="color:#b91c1c;">Wasender did not return a valid QR code string. Please check Wasender dashboard directly: <a href="https://wasenderapi.com/dashboard">wasenderapi.com</a>.</p>
          </div>`,
        );
        return { qrSent: false, message: errMsg, error: errMsg };
      }

      // 3. Generate QR code PNG and Data URL
      const qrDataUrl = await QRCode.toDataURL(qrCodeString, {
        width: 360,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      const qrBuffer = await QRCode.toBuffer(qrCodeString, {
        width: 400,
        margin: 2,
        type: 'png',
      });

      // 4. Render HTML Email
      const emailHtml = renderWasenderQrEmailHtml({
        sessionId,
        status: currentStatus,
        qrDataUrl,
        qrRawString: qrCodeString,
        timestamp: new Date().toISOString(),
      });

      const subject = `🚨 Action Required: WhatsApp Disconnected - Scan QR Code (Session #${sessionId})`;

      const sent = await this.sendQrEmail(subject, emailHtml, qrBuffer);
      if (sent) {
        this.lastQrSentAt = new Date().toISOString();
        this.logger.log(
          `Successfully generated and emailed WhatsApp reconnection QR code to ${this.adminEmail}`,
        );
        return {
          qrSent: true,
          message: `Reconnection initiated. QR code sent to ${this.adminEmail}.`,
        };
      } else {
        return {
          qrSent: false,
          message: 'Failed to send QR code email via Resend.',
          error: 'Email delivery failed',
        };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to reconnect and send QR code: ${errMsg}`);
      return { qrSent: false, message: errMsg, error: errMsg };
    }
  }

  private async sendQrEmail(
    subject: string,
    html: string,
    qrBuffer: Buffer,
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY is not configured; unable to email QR code to ${this.adminEmail}`,
      );
      return false;
    }

    try {
      await this.resend.emails.send({
        from: RESEND_FROM,
        to: [this.adminEmail],
        subject,
        html,
        attachments: [
          {
            filename: 'whatsapp-reconnect-qr.png',
            content: qrBuffer,
          },
        ],
      });
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Resend failed to send QR code email to ${this.adminEmail}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  private async sendAlertEmail(
    subject: string,
    html: string,
  ): Promise<boolean> {
    if (!this.resend) return false;
    try {
      await this.resend.emails.send({
        from: RESEND_FROM,
        to: [this.adminEmail],
        subject,
        html,
      });
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Resend alert email failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * Returns current health state metadata for diagnostics and admin views.
   */
  getState(): WasenderHealthState {
    return {
      enabled: Boolean(this.wasenderKey),
      lastCheckTime: this.lastCheckTime,
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      lastQrSentAt: this.lastQrSentAt,
      isChecking: this.isChecking,
      sessionId: this.sessionId,
      adminEmail: this.adminEmail,
    };
  }
}
