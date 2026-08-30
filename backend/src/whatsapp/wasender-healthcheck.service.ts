import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios, { type AxiosInstance } from 'axios';
import QRCode from 'qrcode';
import { Resend } from 'resend';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { escapeHtml } from '../notification/templates/notification-email.templates';
import { renderWasenderQrEmailHtml } from './templates/wasender-qr-email.template';

const WASENDER_BASE = 'https://www.wasenderapi.com';
const RESEND_FROM = 'LastBerth Notifications <notification@lastberth.com>';
const DEFAULT_MONITORING_ADMIN_EMAIL = 'me@kartikarora.in';
const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

const CONNECTED_STATUSES = new Set([
  'connected',
  'working',
  'ready',
  'online',
  'paired',
  'authenticated',
  'active',
  'open',
]);

const CONNECTING_STATUSES = new Set(['connecting', 'starting', 'initializing']);

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
  activeProvider: string;
  isWasenderActive: boolean;
  lastCheckTime: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastQrSentAt: string | null;
  isChecking: boolean;
  sessionId: string;
  adminEmail: string;
}

interface WasenderStatusPayload {
  status?: string;
  state?: string;
  connected?: boolean;
  isConnected?: boolean;
  success?: boolean;
  error?: unknown;
  message?: string;
  data?: {
    status?: string;
    state?: string;
    connected?: boolean;
    qrCode?: string;
    message?: string;
  };
  session?: {
    status?: string;
  };
  response?: {
    status?: string;
  };
}

/**
 * Extracts and normalizes session status string from diverse Wasender response formats.
 */
export function extractWasenderStatus(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as WasenderStatusPayload;
  const raw =
    d.status ||
    d.state ||
    d.data?.status ||
    d.data?.state ||
    d.session?.status ||
    d.response?.status;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.toLowerCase().trim();
  }
  if (
    d.connected === true ||
    d.data?.connected === true ||
    d.isConnected === true
  ) {
    return 'connected';
  }
  if (d.success === true && !d.error) {
    return 'connected';
  }
  return null;
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
  private lastAlertSentAt: number | null = null;
  private lastAlertStatus: string | null = null;
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

  private isWasenderActive(): boolean {
    const explicitEnable = this.config
      .get<string>('WASENDER_HEALTHCHECK_ENABLED')
      ?.trim()
      .toLowerCase();
    if (explicitEnable === 'true') return true;
    if (explicitEnable === 'false') return false;

    const provider = this.config
      .get<string>('WHATSAPP_PROVIDER')
      ?.trim()
      .toLowerCase();
    return provider === 'wasender' || (!provider && Boolean(this.wasenderKey));
  }

  private shouldSendAlert(status: string, force = false): boolean {
    if (force) return true;
    if (!this.lastAlertSentAt || this.lastAlertStatus !== status) {
      return true;
    }
    return Date.now() - this.lastAlertSentAt >= ALERT_COOLDOWN_MS;
  }

  private recordAlertSent(status: string): void {
    this.lastAlertSentAt = Date.now();
    this.lastAlertStatus = status;
    this.lastQrSentAt = new Date().toISOString();
  }

  /**
   * Cron job running every 30 minutes to check Wasender WhatsApp connection health.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleScheduledHealthcheck(): Promise<void> {
    if (!this.isWasenderActive()) {
      const provider =
        this.config.get<string>('WHATSAPP_PROVIDER')?.trim() || 'none';
      this.logger.debug(
        `Wasender is not active (current provider: ${provider}); skipping scheduled healthcheck.`,
      );
      return;
    }

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

      let parsedStatus: string | null = null;
      try {
        const response = await this.httpClient.get<unknown>(
          `${WASENDER_BASE}/api/status`,
          {
            headers: {
              Authorization: `Bearer ${this.wasenderKey}`,
              Accept: 'application/json',
            },
            timeout: 15_000,
          },
        );

        parsedStatus = extractWasenderStatus(response.data);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const statusCode = err.response?.status;
          const resData = err.response?.data as
            | WasenderStatusPayload
            | string
            | undefined;
          const resMsg: string =
            typeof resData === 'object' && typeof resData?.message === 'string'
              ? resData.message
              : typeof resData === 'string'
                ? resData
                : err.message;

          // 401/403 indicate an invalid/mismatched API key or unauthorized token - NOT a device disconnect!
          if (statusCode === 401 || statusCode === 403) {
            const errMsg = `WASENDER_API_KEY is invalid or not found on Wasender (${resMsg}).`;
            this.logger.error(`WASender authentication failed: ${errMsg}`);
            this.lastStatus = 'INVALID_API_KEY';
            this.lastError = errMsg;

            if (source !== 'cron' || this.shouldSendAlert('INVALID_API_KEY')) {
              await this.sendAlertEmail(
                `⚠️ [WASender Error] Invalid API Key - Authentication Failed`,
                `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;line-height:1.5;">
                  <h2 style="color:#b91c1c;margin:0 0 12px 0;">WASender API Key Error</h2>
                  <p>The configured <code>WASENDER_API_KEY</code> was rejected by Wasender (HTTP ${statusCode}).</p>
                  <p style="background:#f1f5f9;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:13px;color:#334155;">${escapeHtml(resMsg)}</p>
                  <p style="margin-top:16px;"><strong>Action Required:</strong></p>
                  <ol style="padding-left:20px;color:#334155;">
                    <li>Log in to <a href="https://www.wasenderapi.com/dashboard" style="color:#0284c7;">Wasender Dashboard</a>.</li>
                    <li>Go to your WhatsApp session and click the 🔑 <strong>API Key</strong> icon.</li>
                    <li>Copy the active Session API Key and update <code>WASENDER_API_KEY</code> in your <code>backend/.env</code>.</li>
                  </ol>
                </div>`,
              );
              this.recordAlertSent('INVALID_API_KEY');
            }

            return {
              healthy: false,
              status: 'INVALID_API_KEY',
              qrSent: false,
              message: errMsg,
              sessionId: this.sessionId,
              timestamp,
              error: errMsg,
            };
          }

          parsedStatus = extractWasenderStatus(resData);
          if (!parsedStatus) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      const status = parsedStatus || 'unknown';
      this.lastStatus = status;

      if (CONNECTED_STATUSES.has(status)) {
        this.logger.log(
          `WASender WhatsApp session #${this.sessionId} is connected and healthy (status=${status}).`,
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

      if (CONNECTING_STATUSES.has(status)) {
        this.logger.log(
          `WASender WhatsApp session #${this.sessionId} is currently establishing connection (status=${status}).`,
        );
        this.lastError = null;
        return {
          healthy: true,
          status: 'connecting',
          qrSent: false,
          message: 'WhatsApp session is establishing connection.',
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
          connectRes.data?.data?.status &&
          CONNECTED_STATUSES.has(connectRes.data.data.status.toLowerCase())
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

      // 2. Fallback to /qrcode endpoint if not returned directly
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

        const shouldEmail =
          source !== 'cron' || this.shouldSendAlert(currentStatus);
        if (shouldEmail) {
          await this.sendAlertEmail(
            `⚠️ [WASender Alert] WhatsApp Disconnected - Failed to generate QR`,
            `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;line-height:1.5;">
              <h2 style="color:#b91c1c;margin:0 0 12px 0;">WhatsApp Session Disconnected</h2>
              <p>Session <strong>#${escapeHtml(sessionId)}</strong> status: <strong>${escapeHtml(currentStatus)}</strong> (Trigger: ${escapeHtml(source)}).</p>
              <p style="color:#334155;">Wasender did not return a QR code directly. Please link your device or verify your Personal Access Token in the <a href="https://www.wasenderapi.com/dashboard" style="color:#0284c7;">Wasender Dashboard</a>.</p>
            </div>`,
          );
          this.recordAlertSent(currentStatus);
        }

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

      const shouldEmail =
        source !== 'cron' || this.shouldSendAlert(currentStatus);
      if (!shouldEmail) {
        this.logger.log(
          `Skipping duplicate QR email dispatch due to alert cooldown (${currentStatus}).`,
        );
        return {
          qrSent: false,
          message: `QR code generated, but duplicate email was suppressed by cooldown.`,
        };
      }

      const sent = await this.sendQrEmail(subject, emailHtml, qrBuffer);
      if (sent) {
        this.recordAlertSent(currentStatus);
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
    const provider =
      this.config.get<string>('WHATSAPP_PROVIDER')?.trim().toLowerCase() ||
      'wasender';
    return {
      enabled: Boolean(this.wasenderKey),
      activeProvider: provider,
      isWasenderActive: this.isWasenderActive(),
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
