import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  isFilledOpenAiPlanItem,
  routeConsecutiveLegsForJourney,
  type OpenAiBookingPlanItem,
  type Service2CheckResult,
} from '../service2/service2.service';
import type { ChartTimeAvailabilityTask } from '@prisma/client';
import { irctcBookingRedirect } from '../common/irctc-booking-redirect';
import type { ScheduleStation } from '../irctc/irctc.service';
import { StationCacheService } from '../cache/station-cache.service';
import { ShortLinkService } from '../short-link/short-link.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { WasenderProvider } from './whatsapp-providers/wasender.provider';
import { WatiProvider } from './whatsapp-providers/wati.provider';
import { WhatsAppProviderFactory } from './whatsapp-providers/whatsapp.provider-factory';
import type { SendWhatsAppPayload } from './whatsapp-providers/whatsapp-provider.interface';
import {
  arrivalTimeAtStation,
  departureTimeAtStation,
  findScheduleRow,
  formatJourneyDateReadable,
  formatSegmentScheduleTimes,
  hasBookablePlanForNotification,
  normalizeE164Mobile,
  normalizeIrctcTimeDisplay,
} from './notification.helpers';
import {
  renderSeatsFoundEmailHtml,
  renderChartPreparedNoDestinationEmailHtml,
} from './templates/notification-email.templates';
import { buildChartPreparedNoDestinationWhatsAppText } from './templates/notification-whatsapp.templates';
import { renderTatkalAlertEmailHtml } from './templates/tatkal-alert-email.template';
import type { BestTrainCandidateResult } from '../booking-v2/booking-v2.service';

import { NotificationDeduplicationService } from './notification-deduplication.service';
import { NotificationUnsubscribeService } from './notification-unsubscribe.service';

const RESEND_FROM = 'LastBerth Notifications <notification@lastberth.com>';
const DEFAULT_MONITORING_ADMIN_EMAIL = 'me@kartikarora.in';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalize mobile to E.164 for WaSender (e.g. 919876543210). */
export function toE164(mobile: string): string {
  return normalizeE164Mobile(mobile);
}

export type JourneyLegCoverage =
  | {
      type: 'ticket';
      ticketIndex: number;
      instruction: string;
      approxPrice?: number;
      availability?: string;
      fromCode: string;
      toCode: string;
    }
  | {
      type: 'no_ticket';
      fromCode: string;
      toCode: string;
    };

function formatChartTimeIst(
  journeyDateYmd: string,
  timeStr: string,
  dayOffset: number = 0,
): { label: string; formattedTime: string; isReleased: boolean } | null {
  const ymd = journeyDateYmd.slice(0, 10);
  const normalizedTime = normalizeIrctcTimeDisplay(timeStr);
  const match = normalizedTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !match) return null;
  const hh = match[1].padStart(2, '0');
  const mm = match[2].padStart(2, '0');

  const [y, m, d] = ymd.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const targetYmd = dateObj.toISOString().slice(0, 10);

  const istIso = `${targetYmd}T${hh}:${mm}:00+05:30`;
  const targetMs = new Date(istIso).getTime();
  if (isNaN(targetMs)) return null;

  const isReleased = Date.now() > targetMs;

  const formatterDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formatterTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const dateParts = formatterDate.format(new Date(targetMs));
  const timeParts = formatterTime.format(new Date(targetMs));
  const formattedTime = `${dateParts} at ${timeParts}`;

  return {
    label: isReleased
      ? `Chart for station was released at ${formattedTime}`
      : `New tickets open at ${formattedTime}`,
    formattedTime,
    isReleased,
  };
}

@Injectable()
export class NotificationService {
  private readonly wasenderKey: string | undefined;
  private readonly resendKey: string | undefined;
  private readonly resend: Resend | null;
  /** Receives a one-off email when POST /api/availability/journey creates monitoring tasks. */
  private readonly monitoringAdminEmail: string;

  constructor(
    private config: ConfigService,
    private readonly stationCache: StationCacheService,
    @Optional() private readonly chartTimeService?: ChartTimeService,
    @Optional() private readonly shortLinkService?: ShortLinkService,
    @Optional()
    private readonly whatsAppProviderFactory?: WhatsAppProviderFactory,
    @Optional()
    private readonly deduplicationService?: NotificationDeduplicationService,
    @Optional()
    private readonly unsubscribeService?: NotificationUnsubscribeService,
  ) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY');
    this.resendKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = this.resendKey ? new Resend(this.resendKey) : null;
    this.monitoringAdminEmail =
      this.config.get<string>('MONITORING_ADMIN_EMAIL')?.trim() ||
      DEFAULT_MONITORING_ADMIN_EMAIL;
  }

  async sendWhatsApp(
    mobile: string,
    message: string,
    options?: {
      templateName?: string;
      broadcastName?: string;
      parameters?: Array<{ name: string; value: string }>;
      skipFailureReport?: boolean;
    },
  ): Promise<boolean> {
    console.info('whatsapp service was called');
    const provider =
      this.whatsAppProviderFactory ??
      new WhatsAppProviderFactory(
        this.config,
        new WasenderProvider(this.config),
        new WatiProvider(this.config),
      );

    const payload: SendWhatsAppPayload = {
      mobile,
      text: message,
      templateName: options?.templateName,
      broadcastName: options?.broadcastName,
      parameters: options?.parameters,
    };

    let sent = false;
    let failureError: unknown = null;
    try {
      sent = await provider.sendWhatsApp(payload);
    } catch (err) {
      failureError = err;
      console.error('WhatsApp send thrown error:', err);
    }

    if (!sent && !options?.skipFailureReport) {
      const errStr = failureError
        ? failureError instanceof Error
          ? failureError.stack || failureError.message
          : typeof failureError === 'object' && failureError !== null
            ? JSON.stringify(failureError)
            : typeof failureError === 'string'
              ? failureError
              : 'Unknown error object'
        : 'WhatsApp provider returned false (sending failed, rate limited, or unconfigured)';

      void this.sendAlertFailureReport({
        alertType: 'WhatsApp Alert',
        recipientMobile: mobile,
        failureReason: failureError
          ? 'WhatsApp provider threw an exception'
          : 'WhatsApp provider returned failure status',
        logs: errStr,
        payload,
      });
    }

    return sent;
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    options?: { skipFailureReport?: boolean },
  ): Promise<boolean> {
    console.info('email service was called');
    const isToAdmin =
      to.trim().toLowerCase() === this.monitoringAdminEmail.toLowerCase();

    if (!this.resend) {
      if (!isToAdmin && !options?.skipFailureReport) {
        void this.sendAlertFailureReport({
          alertType: 'Email Alert',
          recipientEmail: to,
          failureReason:
            'Resend API key is not configured (RESEND_API_KEY missing)',
          logs: `Attempted to send email to ${to} with subject "${subject}"`,
          payload: { to, subject },
        });
      }
      return false;
    }
    try {
      console.info('sending email message', { RESEND_FROM, to, subject });
      // BCC the owner on every outbound email (skip if they're the recipient).
      const bcc =
        this.monitoringAdminEmail &&
        this.monitoringAdminEmail.toLowerCase() !== to.trim().toLowerCase()
          ? [this.monitoringAdminEmail]
          : undefined;
      await this.resend.emails.send({
        from: RESEND_FROM,
        to: [to],
        ...(bcc ? { bcc } : {}),
        subject,
        html,
      });
      return true;
    } catch (err) {
      console.error('Resend email send failed', err);
      if (!isToAdmin && !options?.skipFailureReport) {
        const errMessage =
          err instanceof Error ? err.stack || err.message : String(err);
        void this.sendAlertFailureReport({
          alertType: 'Email Alert',
          recipientEmail: to,
          failureReason: 'Resend emails.send threw an exception',
          logs: errMessage,
          payload: { to, subject },
        });
      }
      return false;
    }
  }

  async sendTatkalAlertConfirmation(params: {
    email?: string;
    mobile?: string;
    category: 'AC' | 'NON_AC';
    journeyDate: string;
    tatkalDate: string;
    tatkalTime: string;
    trainNumber?: string;
    trainName?: string;
    originOffsetDays?: number;
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    let emailSent = false;
    let whatsappSent = false;

    const isAc = params.category === 'AC';
    const freezeWindow = isAc
      ? '09:50 AM – 10:10 AM IST'
      : '10:50 AM – 11:10 AM IST';
    const loginTime = isAc ? '09:58 AM IST' : '10:58 AM IST';

    if (params.email?.trim()) {
      const email = params.email.trim();
      const subject = `🔔 Tatkal Alert Confirmed: ${isAc ? 'AC Classes' : 'Sleeper / 2S'} Opens on ${params.tatkalDate} at ${params.tatkalTime}`;
      const html = renderTatkalAlertEmailHtml({
        category: params.category,
        journeyDateReadable: params.journeyDate,
        tatkalDateReadable: params.tatkalDate,
        tatkalTimeFormatted: params.tatkalTime,
        masterListFreezeWindow: freezeWindow,
        recommendedLoginTime: loginTime,
        trainNumber: params.trainNumber,
        trainName: params.trainName,
      });

      emailSent = await this.sendEmail(email, subject, html);
    }

    if (params.mobile?.trim()) {
      const trainText = params.trainNumber
        ? ` for train ${params.trainName ? `${params.trainName} (${params.trainNumber})` : params.trainNumber}`
        : '';
      const message = `🔔 *LastBerth Tatkal Alert Confirmed*\n\nYour Tatkal booking alert${trainText} is set!\n\n📅 *Tatkal Booking Opens:* ${params.tatkalDate} at *${params.tatkalTime}*\n🧳 *Journey Date:* ${params.journeyDate}\n🔒 *Master List Freeze:* ${freezeWindow}\n\n⚡ *Pro Tip:* Save all passenger names in IRCTC Master List before ${freezeWindow.split('–')[0].trim()} and use UPI QR for fastest checkout.\n\n🔗 https://lastberth.com/tatkal-planner`;

      whatsappSent = await this.sendWhatsApp(params.mobile.trim(), message);
    }

    return { emailSent, whatsappSent };
  }

  async sendAlertFailureReport(params: {
    alertType: string;
    recipientMobile?: string | null;
    recipientEmail?: string | null;
    trainNumber?: string | null;
    trainName?: string | null;
    fromStationCode?: string | null;
    toStationCode?: string | null;
    journeyDate?: string | Date | null;
    failureReason: string;
    logs?: string | null;
    payload?: any;
  }): Promise<boolean> {
    if (!this.resend) {
      console.error(
        '[ALERT FAILURE REPORT] Cannot send failure email: Resend API key is not configured',
        params,
      );
      return false;
    }

    const adminEmail = this.monitoringAdminEmail;
    const trainLabel = [params.trainNumber, params.trainName]
      .filter(Boolean)
      .join(' ');
    const routeLabel = [params.fromStationCode, params.toStationCode]
      .filter(Boolean)
      .join(' → ');
    const dateStr =
      params.journeyDate instanceof Date
        ? params.journeyDate.toISOString().slice(0, 10)
        : String(params.journeyDate || '').slice(0, 10);

    const subject = `[ALERT FAILURE] ${params.alertType} failed${
      params.trainNumber ? ` for Train ${params.trainNumber}` : ''
    }${routeLabel ? ` (${routeLabel})` : ''}`;

    const formattedPayload = params.payload
      ? escapeHtml(
          typeof params.payload === 'string'
            ? params.payload
            : JSON.stringify(params.payload, null, 2),
        )
      : undefined;

    const formattedLogs = params.logs
      ? escapeHtml(params.logs)
      : escapeHtml(params.failureReason);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;background-color:#f8fafc;padding:20px;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
      <h2 style="color:#991b1b;margin:0 0 4px 0;font-size:18px;">⚠️ Alert Delivery Failure Report</h2>
      <p style="color:#7f1d1d;margin:0;font-size:14px;">An alert failed to deliver. Details and failure logs are attached below.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;color:#64748b;font-weight:600;width:140px;">Alert Type</td>
        <td style="padding:8px;font-weight:600;color:#0f172a;">${escapeHtml(params.alertType)}</td>
      </tr>
      ${
        params.recipientMobile
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Recipient Mobile</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              params.recipientMobile,
            )}</td></tr>`
          : ''
      }
      ${
        params.recipientEmail
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Recipient Email</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              params.recipientEmail,
            )}</td></tr>`
          : ''
      }
      ${
        trainLabel
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Train</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              trainLabel,
            )}</td></tr>`
          : ''
      }
      ${
        routeLabel
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Route</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              routeLabel,
            )}</td></tr>`
          : ''
      }
      ${
        dateStr
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Journey Date</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              dateStr,
            )}</td></tr>`
          : ''
      }
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;color:#64748b;font-weight:600;">Failure Reason</td>
        <td style="padding:8px;color:#dc2626;font-weight:600;">${escapeHtml(params.failureReason)}</td>
      </tr>
      <tr>
        <td style="padding:8px;color:#64748b;font-weight:600;">Timestamp</td>
        <td style="padding:8px;color:#475569;">${new Date().toISOString()}</td>
      </tr>
    </table>

    <h3 style="color:#334155;margin:20px 0 8px 0;font-size:15px;">Failure Logs & Trace</h3>
    <pre style="background:#0f172a;color:#f8fafc;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;font-family:monospace;">${formattedLogs}</pre>

    ${
      formattedPayload
        ? `
    <h3 style="color:#334155;margin:20px 0 8px 0;font-size:15px;">Alert Context & Payload</h3>
    <pre style="background:#f1f5f9;color:#334155;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;font-family:monospace;border:1px solid #e2e8f0;">${formattedPayload}</pre>
    `
        : ''
    }
  </div>
</body>
</html>
`;

    try {
      await this.resend.emails.send({
        from: RESEND_FROM,
        to: [adminEmail],
        subject,
        html,
      });
      console.info(
        `[ALERT FAILURE REPORT] Sent failure report email to ${adminEmail} for ${params.alertType}`,
      );
      return true;
    } catch (err) {
      console.error(
        '[ALERT FAILURE REPORT] Exception while sending alert failure report email',
        err,
      );
      return false;
    }
  }

  /**
   * Notify the product owner that someone started chart monitoring (journey tasks).
   * Intended to be called without awaiting so the API response is not delayed.
   */
  async sendAdminMonitoringRequestEmail(params: {
    journeyRequestId: string;
    taskCount: number;
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode: string;
    stationCodesToMonitor?: string[];
    userEmail?: string;
    userMobile?: string;
  }): Promise<boolean> {
    if (!this.resend) {
      return false;
    }
    const to = this.monitoringAdminEmail;
    if (!to) {
      return false;
    }
    const trainLabel = [params.trainNumber, params.trainName]
      .filter(Boolean)
      .join(' ');
    const stationsLine =
      params.stationCodesToMonitor?.length &&
      params.stationCodesToMonitor.length > 0
        ? escapeHtml(params.stationCodesToMonitor.join(', '))
        : 'All stations with chart times on route';
    const contactLines: string[] = [];
    if (params.userEmail?.trim()) {
      contactLines.push(`Email: ${escapeHtml(params.userEmail.trim())}`);
    }
    if (params.userMobile?.trim()) {
      contactLines.push(`Mobile: ${escapeHtml(params.userMobile.trim())}`);
    }
    const contactBlock =
      contactLines.length > 0
        ? `<p style="margin:12px 0 0 0;"><strong>Contact</strong><br/>${contactLines.join('<br/>')}</p>`
        : '<p style="margin:12px 0 0 0;color:#64748b;">No email or mobile on the request.</p>';

    const subject = `[LastBerth] Monitoring requested — ${params.trainNumber} (${params.journeyDate})`;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
  <p><strong>Someone requested journey monitoring</strong> via <code>POST /api/availability/journey</code>.</p>
  <table style="border-collapse:collapse;margin-top:8px;font-size:14px;">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Journey request ID</td><td><code>${escapeHtml(params.journeyRequestId)}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Tasks created</td><td>${params.taskCount}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Train</td><td>${escapeHtml(trainLabel)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Route</td><td>${escapeHtml(params.fromStationCode)} → ${escapeHtml(params.toStationCode)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Journey date</td><td>${escapeHtml(params.journeyDate)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Class</td><td>${escapeHtml(params.classCode)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#64748b;">Stations</td><td>${stationsLine}</td></tr>
  </table>
  ${contactBlock}
</body>
</html>`;
    return this.sendEmail(to, subject, html);
  }

  /** Build a short booking summary from the result for notifications. */
  private buildBookingSummary(result: Service2CheckResult): string {
    if (result.openAiSummary?.trim()) {
      return result.openAiSummary.trim();
    }
    const plan = result.openAiBookingPlan;
    const filled = plan?.filter(isFilledOpenAiPlanItem) ?? [];
    if (filled.length > 0) {
      return filled.map((s) => s.instruction).join(' | ');
    }
    return 'Seats available. Check details on LastBerth.';
  }

  /** Build IRCTC redirect URL for from/to/train/class. */
  private buildIrctcUrl(task: {
    fromStationCode: string;
    toStationCode: string;
    trainNumber: string;
    classCode?: string | null;
  }): string {
    return irctcBookingRedirect({
      from: task.fromStationCode,
      to: task.toStationCode,
      trainNo: task.trainNumber,
      classCode: task.classCode,
    });
  }

  private firstPlannedClassCode(
    result?: Service2CheckResult,
  ): string | undefined {
    if (!result) return undefined;
    const filled = result.openAiBookingPlan?.find(isFilledOpenAiPlanItem);
    const instruction = filled?.instruction ?? '';
    const parts = instruction.split(' - ').map((p) => p.trim());
    return parts[2] || undefined;
  }

  /** Build IRCTC URL for a segment from instruction "FROM - TO - CLASS". */
  private buildSegmentBookUrl(
    trainNumber: string,
    instruction: string | undefined | null,
  ): string {
    if (!instruction?.trim()) {
      return 'https://www.irctc.co.in/eticketing/login';
    }
    const parts = instruction.split(' - ').map((p) => p.trim());
    const origin = parts[0] ?? '';
    const destination = parts[1] ?? '';
    const classCode = parts[2] ?? '3A';
    if (!origin || !destination) {
      return 'https://www.irctc.co.in/eticketing/login';
    }
    return irctcBookingRedirect({
      from: origin,
      to: destination,
      trainNo: trainNumber,
      classCode,
    });
  }

  /** Format segment for display: "CODE - Name (hh:mm) → CODE - Name (hh:mm)" using station names and times when available. */
  private formatSegmentRoute(
    instruction: string | undefined | null,
    stationNameMap: Map<string, string>,
    stationScheduleList?: ScheduleStation[],
  ): string {
    if (!instruction?.trim()) {
      return '';
    }
    const parts = instruction.split(' - ').map((p) => p.trim());
    const fromCode = parts[0] ?? '';
    const toCode = parts[1] ?? '';
    const fromName = stationNameMap.get(fromCode.toUpperCase()) ?? fromCode;
    const toName = stationNameMap.get(toCode.toUpperCase()) ?? toCode;

    const fromRow = findScheduleRow(stationScheduleList, fromCode);
    const toRow = findScheduleRow(stationScheduleList, toCode);
    const depTime = departureTimeAtStation(fromRow);
    const arrTime = arrivalTimeAtStation(toRow);

    const fromDisplay = depTime
      ? `${fromCode} - ${fromName} (${depTime})`
      : `${fromCode} - ${fromName}`;
    const toDisplay = arrTime
      ? `${toCode} - ${toName} (${arrTime})`
      : `${toCode} - ${toName}`;

    return `${fromDisplay} → ${toDisplay}`;
  }

  /** Format top-level route for email header using full station names and schedule times in brackets when available. */
  private formatJourneyRoute(
    fromCode: string,
    toCode: string,
    stationNameMap: Map<string, string>,
    stationScheduleList?: ScheduleStation[],
  ): string {
    const fromName =
      stationNameMap.get(fromCode.trim().toUpperCase()) ?? fromCode;
    const toName = stationNameMap.get(toCode.trim().toUpperCase()) ?? toCode;

    const fromRow = findScheduleRow(stationScheduleList, fromCode);
    const toRow = findScheduleRow(stationScheduleList, toCode);
    const depTime = departureTimeAtStation(fromRow);
    const arrTime = arrivalTimeAtStation(toRow);

    const fromDisplay = depTime ? `${fromName} (${depTime})` : fromName;
    const toDisplay = arrTime ? `${toName} (${arrTime})` : toName;

    return `${fromDisplay} → ${toDisplay}`;
  }

  private async getStationChartOpenTimeLabel(params: {
    trainNumber: string;
    stationCode: string;
    stationName?: string;
    journeyDateStr: string;
    result?: Service2CheckResult;
  }): Promise<{ label?: string; isReleased: boolean }> {
    const { trainNumber, stationCode, stationName, journeyDateStr, result } =
      params;
    const displayName = stationName || stationCode;

    if (this.chartTimeService) {
      try {
        const meta = await this.chartTimeService.getChartMetaForTrainStation(
          trainNumber,
          stationCode,
        );
        if (meta?.chartOne?.time) {
          const formatted = formatChartTimeIst(
            journeyDateStr,
            meta.chartOne.time,
            meta.chartOne.dayOffset ?? 0,
          );
          if (formatted) {
            return {
              label: formatted.isReleased
                ? `Chart for ${displayName} was released at ${formatted.formattedTime}`
                : `New tickets open at ${formatted.formattedTime}`,
              isReleased: formatted.isReleased,
            };
          }
        }
      } catch {
        // ignore & fallback
      }
    }

    if (result?.chartPreparationDetails?.firstChartCreationTime) {
      const formatted = formatChartTimeIst(
        journeyDateStr,
        result.chartPreparationDetails.firstChartCreationTime,
        0,
      );
      if (formatted) {
        return {
          label: formatted.isReleased
            ? `Chart for ${displayName} was released at ${formatted.formattedTime}`
            : `New tickets open at ${formatted.formattedTime}`,
          isReleased: formatted.isReleased,
        };
      }
    }

    if (result?.chartRefreshNotice?.indicativeChartTime) {
      const formatted = formatChartTimeIst(
        journeyDateStr,
        result.chartRefreshNotice.indicativeChartTime,
        0,
      );
      if (formatted) {
        return {
          label: formatted.isReleased
            ? `Chart for ${displayName} was released at ${formatted.formattedTime}`
            : `New tickets open at ${formatted.formattedTime}`,
          isReleased: formatted.isReleased,
        };
      }
    }

    return {
      isReleased: false,
    };
  }

  public extractJourneyLegCoverage(params: {
    fromStationCode: string;
    toStationCode: string;
    plan: OpenAiBookingPlanItem[];
    stationScheduleList?: ScheduleStation[];
  }): JourneyLegCoverage[] {
    const { fromStationCode, toStationCode, plan, stationScheduleList } =
      params;
    const fromU = fromStationCode.trim().toUpperCase();
    const toU = toStationCode.trim().toUpperCase();
    const filledPlan = plan.filter(isFilledOpenAiPlanItem);

    if (filledPlan.length === 0) {
      return [{ type: 'no_ticket', fromCode: fromU, toCode: toU }];
    }

    const routeLegs = routeConsecutiveLegsForJourney(
      stationScheduleList
        ? {
            trainNumber: '',
            trainName: '',
            stationFrom: '',
            stationTo: '',
            stationList: stationScheduleList,
          }
        : null,
      fromU,
      toU,
    );

    if (routeLegs.length > 0) {
      const routeStations = [routeLegs[0].from, ...routeLegs.map((l) => l.to)];
      const stationIndex = new Map(routeStations.map((c, i) => [c, i]));

      const legCoveredByTicket: (
        | {
            ticketIndex: number;
            item: {
              instruction: string;
              approx_price: number;
              availability?: string;
            };
          }
        | undefined
      )[] = Array.from({ length: routeLegs.length });

      filledPlan.forEach((item, idx) => {
        const parts = item.instruction
          .split(' - ')
          .map((p) => p.trim().toUpperCase());
        const segFrom = parts[0] ?? '';
        const segTo = parts[1] ?? '';
        const startIdx = stationIndex.get(segFrom);
        const endIdx = stationIndex.get(segTo);
        if (startIdx != null && endIdx != null && startIdx < endIdx) {
          for (let k = startIdx; k < endIdx; k++) {
            if (k < routeLegs.length) {
              legCoveredByTicket[k] = { ticketIndex: idx + 1, item };
            }
          }
        }
      });

      const result: JourneyLegCoverage[] = [];
      let i = 0;
      while (i < routeLegs.length) {
        const cov = legCoveredByTicket[i];
        if (cov) {
          const ticketIndex = cov.ticketIndex;
          const instruction = cov.item.instruction;
          const approxPrice = cov.item.approx_price;
          const availability = cov.item.availability;
          const startFrom = routeLegs[i].from;
          let endTo = routeLegs[i].to;
          while (
            i + 1 < routeLegs.length &&
            legCoveredByTicket[i + 1]?.ticketIndex === ticketIndex
          ) {
            i++;
            endTo = routeLegs[i].to;
          }
          result.push({
            type: 'ticket',
            ticketIndex,
            instruction,
            approxPrice,
            availability,
            fromCode: startFrom,
            toCode: endTo,
          });
        } else {
          const startFrom = routeLegs[i].from;
          let endTo = routeLegs[i].to;
          while (i + 1 < routeLegs.length && !legCoveredByTicket[i + 1]) {
            i++;
            endTo = routeLegs[i].to;
          }
          result.push({
            type: 'no_ticket',
            fromCode: startFrom,
            toCode: endTo,
          });
        }
        i++;
      }
      return result;
    }

    const result: JourneyLegCoverage[] = [];
    let currentStation = fromU;

    filledPlan.forEach((item, idx) => {
      const parts = item.instruction
        .split(' - ')
        .map((p) => p.trim().toUpperCase());
      const segFrom = parts[0] ?? '';
      const segTo = parts[1] ?? '';

      if (segFrom && segFrom !== currentStation) {
        result.push({
          type: 'no_ticket',
          fromCode: currentStation,
          toCode: segFrom,
        });
      }

      result.push({
        type: 'ticket',
        ticketIndex: idx + 1,
        instruction: item.instruction,
        approxPrice: item.approx_price,
        availability: item.availability,
        fromCode: segFrom || currentStation,
        toCode: segTo || toU,
      });

      if (segTo) {
        currentStation = segTo;
      }
    });

    if (currentStation !== toU) {
      result.push({
        type: 'no_ticket',
        fromCode: currentStation,
        toCode: toU,
      });
    }

    return result;
  }

  /**
   * Build a tracked short link to /unsubscribe?r=<recipient>. Reuses the
   * same shortlink across all notifications to the same recipient (so we
   * don't mint a new code per email/WhatsApp) and only mints a new one
   * for unseen recipients. Best-effort — returns undefined if the
   * short-link service is unavailable or recipient is empty.
   */
  private async createUnsubscribeShortLink(
    recipient: string,
    channel: 'email' | 'whatsapp',
  ): Promise<string | undefined> {
    if (!this.shortLinkService) return undefined;
    const trimmed = recipient?.trim();
    if (!trimmed) return undefined;
    try {
      const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
      return await this.shortLinkService.findOrCreateShortLink({
        url: `${baseUrl}/unsubscribe?r=${encodeURIComponent(trimmed)}`,
        payload: {
          type: 'unsubscribe_link',
          recipient: trimmed,
          channel,
        },
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Build a tracked short-link to the search page pre-filled with the train
   * + journey date. Used by the "no destination" chart-prepared alert.
   */
  private async createCheckTicketsShortLink(params: {
    trainNumber: string;
    journeyDateStr: string;
    channel: 'email' | 'whatsapp';
  }): Promise<string | undefined> {
    if (!this.shortLinkService) return undefined;
    try {
      const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
      const query = new URLSearchParams({ trainNo: params.trainNumber });
      if (params.journeyDateStr) query.set('date', params.journeyDateStr);
      const url = `${baseUrl}/search?${query.toString()}`;
      return await this.shortLinkService.createShortLink({
        url,
        payload: {
          type: 'chart_prepared_check_tickets',
          trainNumber: params.trainNumber,
          journeyDate: params.journeyDateStr,
          channel: params.channel,
        },
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Send a lightweight "chart prepared — go check tickets on our platform"
   * email + WhatsApp. No availability check is run for this path; the
   * notification is informational only and points the user at a short-link
   * that opens the search page pre-filled with the train + journey date.
   *
   * Same unsubscribe guard as `notifyUser` / `notifyUserAlternativeTrains`.
   */
  async notifyChartPrepared(params: {
    email?: string | null;
    mobile?: string | null;
    trainNumber: string;
    trainName?: string | null;
    journeyDate: Date | string;
    chartPreparationText: string;
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const { email, mobile, trainNumber, trainName, journeyDate } = params;
    const out = { emailSent: false, whatsappSent: false };

    try {
      if (!email?.trim() && !mobile?.trim()) return out;
      if (this.unsubscribeService) {
        if (email && (await this.unsubscribeService.isUnsubscribed(email))) {
          return out;
        }
        if (mobile && (await this.unsubscribeService.isUnsubscribed(mobile))) {
          return out;
        }
      }

      const journeyDateStr =
        journeyDate instanceof Date
          ? journeyDate.toISOString().slice(0, 10)
          : String(journeyDate).slice(0, 10);
      const journeyDateReadable = formatJourneyDateReadable(journeyDateStr);
      const trainLabel = [trainNumber, trainName].filter(Boolean).join(' ');

      const [emailCheckUrl, whatsappCheckUrl, emailUnsubUrl, whatsappUnsubUrl] =
        await Promise.all([
          email?.trim()
            ? this.createCheckTicketsShortLink({
                trainNumber: trainNumber.trim(),
                journeyDateStr,
                channel: 'email',
              })
            : Promise.resolve(undefined),
          mobile?.trim()
            ? this.createCheckTicketsShortLink({
                trainNumber: trainNumber.trim(),
                journeyDateStr,
                channel: 'whatsapp',
              })
            : Promise.resolve(undefined),
          email?.trim()
            ? this.createUnsubscribeShortLink(email.trim(), 'email')
            : Promise.resolve(undefined),
          mobile?.trim()
            ? this.createUnsubscribeShortLink(
                normalizeE164Mobile(mobile.trim()),
                'whatsapp',
              )
            : Promise.resolve(undefined),
        ]);
      const checkTicketsUrl = emailCheckUrl || whatsappCheckUrl;
      if (!checkTicketsUrl) {
        console.warn('notifyChartPrepared: no ShortLinkService; skipping send');
        return out;
      }

      const subject = `Chart prepared for ${trainLabel} on ${journeyDateReadable} — check tickets now`;

      if (email?.trim()) {
        const html = renderChartPreparedNoDestinationEmailHtml({
          trainNumber,
          trainName,
          formattedDateTime: params.chartPreparationText,
          checkTicketsUrl,
          unsubscribeUrl: emailUnsubUrl,
        });
        out.emailSent = await this.sendEmail(email.trim(), subject, html, {
          skipFailureReport: true,
        });
        if (out.emailSent && this.deduplicationService) {
          void this.deduplicationService.recordNotificationSent({
            recipient: email.trim(),
            channel: 'email',
            trainNumber: trainNumber.trim(),
            journeyDate: journeyDateStr,
            notificationType: 'chart_prepared_only',
          });
        }
        if (!out.emailSent) {
          void this.sendAlertFailureReport({
            alertType: 'Chart Prepared Email',
            recipientEmail: email,
            trainNumber,
            trainName: trainName ?? undefined,
            fromStationCode: undefined,
            toStationCode: undefined,
            journeyDate,
            failureReason:
              'Chart prepared email send returned false (provider failure or missing key)',
            payload: { type: 'chart_prepared_only' },
          });
        }
      }

      if (mobile?.trim()) {
        const text = buildChartPreparedNoDestinationWhatsAppText({
          trainNumber,
          trainName,
          formattedDateTime: params.chartPreparationText,
          checkTicketsUrl: whatsappCheckUrl || checkTicketsUrl,
          unsubscribeUrl: whatsappUnsubUrl,
        });
        out.whatsappSent = await this.sendWhatsApp(mobile.trim(), text, {
          templateName:
            this.config.get<string>('WATI_TEMPLATE_CHART_ALERT') ||
            'subscription_alert',
          broadcastName: 'lastberth_chart_prepared_only',
          skipFailureReport: true,
        });
        if (out.whatsappSent && this.deduplicationService) {
          void this.deduplicationService.recordNotificationSent({
            recipient: mobile.trim(),
            channel: 'whatsapp',
            trainNumber: trainNumber.trim(),
            journeyDate: journeyDateStr,
            notificationType: 'chart_prepared_only',
          });
        }
        if (!out.whatsappSent) {
          void this.sendAlertFailureReport({
            alertType: 'Chart Prepared WhatsApp',
            recipientMobile: mobile,
            trainNumber,
            trainName: trainName ?? undefined,
            fromStationCode: undefined,
            toStationCode: undefined,
            journeyDate,
            failureReason:
              'Chart prepared WhatsApp send returned false (provider failure or missing key)',
            payload: { type: 'chart_prepared_only' },
          });
        }
      }

      return out;
    } catch (err) {
      console.error('notifyChartPrepared failed', err);
      const errMessage =
        err instanceof Error ? err.stack || err.message : String(err);
      void this.sendAlertFailureReport({
        alertType: 'notifyChartPrepared Processing Exception',
        recipientEmail: email ?? undefined,
        recipientMobile: mobile ?? undefined,
        trainNumber,
        trainName: trainName ?? undefined,
        fromStationCode: undefined,
        toStationCode: undefined,
        journeyDate,
        failureReason: 'Unhandled exception inside notifyChartPrepared',
        logs: errMessage,
        payload: { type: 'chart_prepared_only' },
      });
      return out;
    }
  }

  /** Build HTML email body matching booking UI: train header, route with >, chart prep, ticket cards, total right-aligned. */
  private async buildSeatsFoundEmailHtml(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    journeyDateStr: string;
    fromStationCode: string;
    toStationCode: string;
    journeyTimesLine?: string;
    chartPreparationText?: string;
    trainNumber: string;
    plan: OpenAiBookingPlanItem[];
    totalPrice?: number;
    stationNameMap: Map<string, string>;
    stationScheduleList?: ScheduleStation[];
    result?: Service2CheckResult;
    email?: string;
    mobile?: string;
    unsubscribeUrl?: string;
  }): Promise<string> {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      journeyDateStr,
      fromStationCode,
      toStationCode,
      journeyTimesLine,
      chartPreparationText,
      trainNumber,
      plan,
      totalPrice,
      stationNameMap,
      stationScheduleList,
      result,
      unsubscribeUrl,
    } = params;

    const coverage = this.extractJourneyLegCoverage({
      fromStationCode,
      toStationCode,
      plan,
      stationScheduleList,
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';

    const cardRowPromises = coverage.map(async (item) => {
      if (item.type === 'ticket') {
        const segUrl = this.buildSegmentBookUrl(trainNumber, item.instruction);
        const segmentRoute = this.formatSegmentRoute(
          item.instruction,
          stationNameMap,
          stationScheduleList,
        );
        const classTag = (item.instruction.split(' - ')[2] ?? '3A').trim();
        const priceStr =
          item.approxPrice != null
            ? `₹${Number(item.approxPrice).toLocaleString('en-IN')}`
            : '';
        const availStr = item.availability?.trim() || '';
        return `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; border:1px solid #86efac; background:#e6ffe6; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">Ticket ${item.ticketIndex}
              <span style="display:inline-block; margin-left:8px; padding:3px 10px; border-radius:8px; background:#22c55e; color:#fff; font-size:12px; font-weight:600;">${classTag}</span>
            </p>
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">${escapeHtml(segmentRoute)}</p>
            ${availStr ? `<p style="margin:10px 0 0 0; font-size:13px; font-weight:600; color:#15803d;">${escapeHtml(availStr)}</p>` : ''}
            ${priceStr ? `<p style="margin:${availStr ? '4px' : '10px'} 0 0 0; font-size:15px; font-weight:600; color:#0f172a;"><span style="font-size:12px; font-weight:400; color:#64748b;">approx</span> ${priceStr}</p>` : ''}
            <a href="${segUrl}" style="display:inline-block; margin-top:16px; padding:12px 24px; border-radius:12px; background:#22c55e; color:#fff; font-size:15px; font-weight:600; text-decoration:none;">Book</a>
          </td>
        </tr>
      </table>
    </td></tr>`;
      } else {
        const fromName =
          stationNameMap.get(item.fromCode.trim().toUpperCase()) ??
          item.fromCode;
        const toName =
          stationNameMap.get(item.toCode.trim().toUpperCase()) ?? item.toCode;
        const fromRow = findScheduleRow(stationScheduleList, item.fromCode);
        const toRow = findScheduleRow(stationScheduleList, item.toCode);
        const depTime = departureTimeAtStation(fromRow);
        const arrTime = arrivalTimeAtStation(toRow);
        const fromDisplay = depTime
          ? `${item.fromCode} - ${fromName} (${depTime})`
          : `${item.fromCode} - ${fromName}`;
        const toDisplay = arrTime
          ? `${item.toCode} - ${toName} (${arrTime})`
          : `${item.toCode} - ${toName}`;
        const segDisplay = `${fromDisplay} → ${toDisplay}`;

        const chartOpenInfo = await this.getStationChartOpenTimeLabel({
          trainNumber,
          stationCode: item.fromCode,
          stationName: fromName,
          journeyDateStr,
          result,
        });

        let actionButtonHtml = '';
        if (chartOpenInfo.isReleased) {
          const alternateClassUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}&trainNo=${encodeURIComponent(trainNumber)}`;
          actionButtonHtml = `<a href="${alternateClassUrl}" style="display:inline-block; padding:10px 20px; border-radius:8px; background:#2563eb; color:#fff; font-size:13px; font-weight:600; text-decoration:none;">Check Alternate Class Tickets</a>`;
        } else {
          let alertUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}`;
          if (this.shortLinkService) {
            try {
              alertUrl = await this.shortLinkService.createAlertShortLink({
                trainNumber,
                trainName: result?.trainSchedule?.trainName,
                fromStationCode: item.fromCode,
                toStationCode: item.toCode,
                journeyDate: journeyDateStr,
                classCode: this.firstPlannedClassCode(result),
                email: params.email,
                mobile: params.mobile,
              });
            } catch {
              // fallback
            }
          }
          actionButtonHtml = `<a href="${alertUrl}" style="display:inline-block; padding:10px 20px; border-radius:8px; background:#f59e0b; color:#fff; font-size:13px; font-weight:600; text-decoration:none;">Get Ticket Alert</a>`;
        }

        return `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; border:1px solid #fde68a; background:#fffbeb; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#b45309;">No tickets available | Buy ticket from TTE in train</p>
            <p style="margin:0 0 8px 0; font-size:14px; font-weight:500; color:#1e293b;">${escapeHtml(segDisplay)}</p>
            ${chartOpenInfo.label ? `<p style="margin:0 0 12px 0; font-size:13px; font-weight:600; color:#4338ca;">${escapeHtml(chartOpenInfo.label)}</p>` : ''}
            ${actionButtonHtml}
          </td>
        </tr>
      </table>
    </td></tr>`;
      }
    });

    const cardRows = (await Promise.all(cardRowPromises)).join('');

    const isPartialJourney =
      coverage.some((c) => c.type === 'ticket') &&
      coverage.some((c) => c.type === 'no_ticket');
    const partialJourneyNotice = isPartialJourney
      ? 'You can purchase multiple tickets and for journey ticket not available you can buy it on board from TTE based on realtime availability in the train'
      : undefined;

    return renderSeatsFoundEmailHtml({
      cardRowsHtml: cardRows,
      totalPrice,
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      journeyTimesLine,
      chartPreparationText,
      partialJourneyNotice,
      unsubscribeUrl,
    });
  }

  /** Build WhatsApp plain text for follow-up leg updates (delta-only, concise). */
  private buildFollowUpLegWhatsAppText(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    plan: OpenAiBookingPlanItem[];
    stationNameMap: Map<string, string>;
    stationScheduleList?: ScheduleStation[];
    trainNumber: string;
    chartPreparationText?: string;
    unsubscribeUrl?: string;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      plan,
      stationNameMap,
      stationScheduleList,
      trainNumber,
      chartPreparationText,
    } = params;

    const lines: string[] = [
      '*LastBerth Leg Update* 🔔',
      'New tickets found for your journey!',
      '',
      `Train: ${trainLabel}`,
      `Leg: ${routeDisplay}`,
      `Date: ${journeyDateReadable}`,
      ...(chartPreparationText ? [chartPreparationText] : []),
      '',
    ];

    const filledPlan = plan.filter(isFilledOpenAiPlanItem);

    for (let idx = 0; idx < filledPlan.length; idx++) {
      const item = filledPlan[idx];
      const segmentRoute = this.formatSegmentRoute(
        item.instruction,
        stationNameMap,
        stationScheduleList,
      );
      const classTag = (
        (item.instruction || '').split(' - ')[2] ?? '3A'
      ).trim();
      const priceStr =
        item.approx_price != null && item.approx_price > 0
          ? `approx ₹${Number(item.approx_price).toLocaleString('en-IN')}`
          : '';
      const segBookUrl = this.buildSegmentBookUrl(
        trainNumber,
        item.instruction,
      );
      const availabilityTag = item.availability
        ? ` | ${item.availability}`
        : '';

      lines.push(`Ticket Found [${classTag}]${availabilityTag}`);
      lines.push(segmentRoute);
      if (priceStr) lines.push(priceStr);
      lines.push(`Book on IRCTC: ${segBookUrl}`);
      lines.push('');
    }

    lines.push('Track live seat updates anytime on LastBerth! 🚄');
    if (params.unsubscribeUrl) {
      lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
    }
    return lines.join('\n').trim();
  }

  /** Build Email HTML for follow-up leg updates (delta-only, concise). */
  private buildFollowUpLegEmailHtml(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    plan: OpenAiBookingPlanItem[];
    stationNameMap: Map<string, string>;
    stationScheduleList?: ScheduleStation[];
    trainNumber: string;
    chartPreparationText?: string;
    unsubscribeUrl?: string;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      plan,
      stationNameMap,
      stationScheduleList,
      trainNumber,
      chartPreparationText,
    } = params;

    const filledPlan = plan.filter(isFilledOpenAiPlanItem);
    const cardsHtml = filledPlan
      .map((item, idx) => {
        const segUrl = this.buildSegmentBookUrl(trainNumber, item.instruction);
        const segmentRoute = this.formatSegmentRoute(
          item.instruction,
          stationNameMap,
          stationScheduleList,
        );
        const classTag = (
          (item.instruction || '').split(' - ')[2] ?? '3A'
        ).trim();
        const priceStr =
          item.approx_price != null && item.approx_price > 0
            ? `₹${Number(item.approx_price).toLocaleString('en-IN')}`
            : '';
        const availStr = item.availability?.trim() || '';

        return `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; border:1px solid #86efac; background:#e6ffe6; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">Ticket ${idx + 1}
              <span style="display:inline-block; margin-left:8px; padding:3px 10px; border-radius:8px; background:#22c55e; color:#fff; font-size:12px; font-weight:600;">${classTag}</span>
            </p>
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">${escapeHtml(segmentRoute)}</p>
            ${availStr ? `<p style="margin:10px 0 0 0; font-size:13px; font-weight:600; color:#15803d;">${escapeHtml(availStr)}</p>` : ''}
            ${priceStr ? `<p style="margin:${availStr ? '4px' : '10px'} 0 0 0; font-size:15px; font-weight:600; color:#0f172a;"><span style="font-size:12px; font-weight:400; color:#64748b;">approx</span> ${priceStr}</p>` : ''}
            <a href="${segUrl}" style="display:inline-block; margin-top:16px; padding:12px 24px; border-radius:12px; background:#22c55e; color:#fff; font-size:15px; font-weight:600; text-decoration:none;">Book</a>
          </td>
        </tr>
      </table>
    </td></tr>`;
      })
      .join('');

    return renderSeatsFoundEmailHtml({
      cardRowsHtml: cardsHtml,
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      chartPreparationText,
      unsubscribeUrl: params.unsubscribeUrl,
    });
  }

  /** Build WhatsApp plain text to match booking UI: train, route with >, chart prep, ticket lines, total. */
  private async buildWhatsAppSeatsFoundText(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    journeyDateStr: string;
    trainNumber: string;
    fromStationCode: string;
    toStationCode: string;
    journeyTimesLine?: string;
    chartPreparationText?: string;
    plan: OpenAiBookingPlanItem[];
    totalPrice?: number;
    stationNameMap: Map<string, string>;
    stationScheduleList?: ScheduleStation[];
    result?: Service2CheckResult;
    email?: string;
    mobile?: string;
    unsubscribeUrl?: string;
  }): Promise<string> {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      journeyDateStr,
      trainNumber,
      fromStationCode,
      toStationCode,
      journeyTimesLine,
      chartPreparationText,
      plan,
      stationNameMap,
      stationScheduleList,
      result,
    } = params;
    const lines: string[] = [
      '*LastBerth Chart Alert* 🔔',
      'You subscribed to an alert when chart is prepared:',
      '',
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      ...(journeyTimesLine ? [journeyTimesLine] : []),
      ...(chartPreparationText ? [chartPreparationText] : []),
      '',
    ];

    const coverage = this.extractJourneyLegCoverage({
      fromStationCode,
      toStationCode,
      plan,
      stationScheduleList,
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';

    for (const item of coverage) {
      if (item.type === 'ticket') {
        const segmentRoute = this.formatSegmentRoute(
          item.instruction,
          stationNameMap,
          stationScheduleList,
        );
        const classTag = (item.instruction.split(' - ')[2] ?? '3A').trim();
        const priceStr =
          item.approxPrice != null
            ? `approx ₹${Number(item.approxPrice).toLocaleString('en-IN')}`
            : '';
        const segBookUrl = this.buildSegmentBookUrl(
          trainNumber,
          item.instruction,
        );
        const availabilityTag = item.availability
          ? ` | ${item.availability}`
          : '';
        lines.push(
          `Ticket ${item.ticketIndex} [${classTag}]${availabilityTag}`,
        );
        lines.push(segmentRoute);
        if (priceStr) lines.push(priceStr);
        lines.push(`Book on IRCTC: ${segBookUrl}`);
        lines.push('');
      } else {
        const fromName =
          stationNameMap.get(item.fromCode.trim().toUpperCase()) ??
          item.fromCode;
        const toName =
          stationNameMap.get(item.toCode.trim().toUpperCase()) ?? item.toCode;
        const fromRow = findScheduleRow(stationScheduleList, item.fromCode);
        const toRow = findScheduleRow(stationScheduleList, item.toCode);
        const depTime = departureTimeAtStation(fromRow);
        const arrTime = arrivalTimeAtStation(toRow);
        const fromDisplay = depTime
          ? `${item.fromCode} - ${fromName} (${depTime})`
          : `${item.fromCode} - ${fromName}`;
        const toDisplay = arrTime
          ? `${item.toCode} - ${toName} (${arrTime})`
          : `${item.toCode} - ${toName}`;
        const segDisplay = `${fromDisplay} → ${toDisplay}`;

        const chartOpenInfo = await this.getStationChartOpenTimeLabel({
          trainNumber,
          stationCode: item.fromCode,
          stationName: fromName,
          journeyDateStr,
          result,
        });

        lines.push(`No tickets available:`);
        lines.push(segDisplay);
        if (chartOpenInfo.label) {
          lines.push(chartOpenInfo.label);
        }

        if (chartOpenInfo.isReleased) {
          const alternateClassUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}&trainNo=${encodeURIComponent(trainNumber)}`;
          lines.push(`Check Alternate Class Tickets: ${alternateClassUrl}`);
        } else {
          let alertUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}`;
          if (this.shortLinkService) {
            try {
              alertUrl = await this.shortLinkService.createAlertShortLink({
                trainNumber,
                trainName: result?.trainSchedule?.trainName,
                fromStationCode: item.fromCode,
                toStationCode: item.toCode,
                journeyDate: journeyDateStr,
                classCode: this.firstPlannedClassCode(result),
                email: params.email,
                mobile: params.mobile,
              });
            } catch {
              // fallback
            }
          }
          lines.push(`Get alert for this leg: ${alertUrl}`);
        }
        lines.push('');
      }
    }

    lines.push('Track live seat updates anytime on LastBerth! 🚄');
    if (params.unsubscribeUrl) {
      lines.push('');
      lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
    }

    return lines.join('\n').trim();
  }

  private buildNoSeatsEmailHtml(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    openAiSummary?: string | null;
    alternativeTrains?: BestTrainCandidateResult[];
    fromCode: string;
    toCode: string;
    date: string;
    searchUrl?: string;
    unsubscribeUrl?: string;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      openAiSummary,
      alternativeTrains,
      fromCode,
      toCode,
      date,
    } = params;

    const hasAlternatives = Boolean(
      alternativeTrains && alternativeTrains.length > 0,
    );
    const title = hasAlternatives
      ? 'Alternate Trains Available 🚆'
      : 'No Tickets Found 😔';
    const mainNote = hasAlternatives
      ? `We didn't find any tickets in <strong>${escapeHtml(trainLabel)}</strong> for <strong>${escapeHtml(routeDisplay)}</strong> on <strong>${escapeHtml(journeyDateReadable)}</strong>.`
      : `We tried our best to find tickets for your journey:`;

    let alternativesHtml = '';
    if (hasAlternatives) {
      const trainCards = (alternativeTrains ?? [])
        .slice(0, 5)
        .map((alt) => {
          const train = alt.train;
          const trainNameStr = [train.trainNumber, train.trainName]
            .filter(Boolean)
            .join(' - ');

          const confirmedLegs = alt.alternatePath.legs.filter(
            (l) => l.segmentKind === 'confirmed',
          );
          let bestLegStr = '';
          if (confirmedLegs.length > 0) {
            const firstLeg = confirmedLegs[0];
            const classStr = firstLeg.travelClass
              ? ` [Class ${firstLeg.travelClass}]`
              : '';
            const statusStr =
              firstLeg.availabilityDisplayName ||
              firstLeg.railDataStatus ||
              'Available';
            bestLegStr = `<p style="margin:4px 0 0 0;font-size:13px;font-weight:600;color:#059669;">${statusStr}${classStr}</p>`;
          }

          let timingsStr = '';
          if (train.departureTime || train.arrivalTime || train.duration) {
            const depStr = train.departureTime
              ? `Dep: ${train.departureTime}`
              : '';
            const arrStr = train.arrivalTime ? `Arr: ${train.arrivalTime}` : '';
            const durMinutes = train.duration;
            const durStr = durMinutes
              ? `Duration: ${Math.floor(durMinutes / 60)}h ${durMinutes % 60}m`
              : '';
            const parts = [depStr, arrStr, durStr].filter(Boolean).join(' | ');
            timingsStr = `<p style="margin:4px 0 0 0;font-size:13px;color:#475569;">${escapeHtml(parts)}</p>`;
          }

          return `
        <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
          <p style="margin:0;font-weight:600;font-size:15px;color:#1e293b;">${escapeHtml(trainNameStr)}</p>
          ${timingsStr}
          ${bestLegStr}
        </div>`;
        })
        .join('');

      alternativesHtml = `
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
        <h3 style="margin:0 0 12px 0;font-size:16px;color:#059669;font-weight:700;">FOUND TICKETS IN ALTERNATE TRAINS - BOOK NOW</h3>
        ${trainCards}
      </div>`;
    }

    const primaryDetailsBlock = hasAlternatives
      ? ''
      : `
    <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;">
      <p style="margin:0;font-weight:600;">${escapeHtml(trainLabel)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(routeDisplay)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(journeyDateReadable)}</p>
    </div>
    <p style="margin:0 0 16px 0;color:#b91c1c;">${escapeHtml(openAiSummary || "Unfortunately, we couldn't find any available tickets at this time.")}</p>`;

    const searchHref =
      params.searchUrl ||
      `https://lastberth.com/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`;

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">${title}</h2>
    <p style="margin:0 0 12px 0;">${mainNote}</p>
    ${primaryDetailsBlock}
    ${alternativesHtml}
    <p style="margin:16px 0 16px 0;">Look for alternate trains available for your journey:</p>
    <a href="${searchHref}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">Find Alternate Trains</a>
  </div>
  <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.${
    params.unsubscribeUrl
      ? ` <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
      : ''
  }</p>
</body>
</html>`;
  }

  private buildNoSeatsWhatsAppText(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    openAiSummary?: string | null;
    alternativeTrains?: BestTrainCandidateResult[];
    fromCode: string;
    toCode: string;
    date: string;
    searchUrl?: string;
    unsubscribeUrl?: string;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      openAiSummary,
      alternativeTrains,
      fromCode,
      toCode,
      date,
      searchUrl,
    } = params;

    const targetSearchUrl =
      searchUrl ||
      `https://lastberth.com/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`;

    const hasAlternatives = Boolean(
      alternativeTrains && alternativeTrains.length > 0,
    );
    let alternativesText = '';
    if (hasAlternatives) {
      const trainLines = (alternativeTrains ?? [])
        .slice(0, 5)
        .map((alt, i) => {
          const train = alt.train;
          const trainNameStr = [train.trainNumber, train.trainName]
            .filter(Boolean)
            .join(' - ');

          const confirmedLegs = alt.alternatePath.legs.filter(
            (l) => l.segmentKind === 'confirmed',
          );
          let bestLegStr = '';
          if (confirmedLegs.length > 0) {
            const firstLeg = confirmedLegs[0];
            const classStr = firstLeg.travelClass
              ? ` [Class ${firstLeg.travelClass}]`
              : '';
            const statusStr =
              firstLeg.availabilityDisplayName ||
              firstLeg.railDataStatus ||
              'Available';
            bestLegStr = `\n  ↳ ${statusStr}${classStr}`;
          }

          const depStr = train.departureTime
            ? `Dep: ${train.departureTime}`
            : '';
          const arrStr = train.arrivalTime ? `Arr: ${train.arrivalTime}` : '';
          const durMinutes = train.duration;
          const durStr = durMinutes
            ? `Duration: ${Math.floor(durMinutes / 60)}h ${durMinutes % 60}m`
            : '';
          const timingLine = [depStr, arrStr, durStr]
            .filter(Boolean)
            .join(' | ');

          return `${i + 1}. *${trainNameStr}*\n   ${timingLine}${bestLegStr}`;
        })
        .join('\n\n');

      alternativesText = `\n\n*FOUND TICKETS IN ALTERNATE TRAINS - BOOK NOW* 🔥\n\n${trainLines}`;
    }

    const unsubscribeLine = params.unsubscribeUrl
      ? `\n\nUnsubscribe: ${params.unsubscribeUrl}`
      : '';

    if (hasAlternatives) {
      return `*LastBerth Chart Alert* 🔔

We didn't find any tickets in *${trainLabel}* for *${routeDisplay}* on *${journeyDateReadable}*.${alternativesText}

Look for alternate trains available for your journey:
${targetSearchUrl}${unsubscribeLine}`;
    }

    return `*LastBerth Chart Alert* 🔔
You subscribed to an alert when chart is prepared:

No Tickets Found 😔

Train: ${trainLabel}
Route: ${routeDisplay}
Date: ${journeyDateReadable}

${openAiSummary || "We tried our best but couldn't find any available tickets at this time."}

Look for alternate trains available for your journey:
${targetSearchUrl}${unsubscribeLine}`;
  }

  /** Build station code -> name map from train schedule (for UI-style segment labels). */
  private getStationNameMap(
    stationList?: Array<{ stationCode?: string; stationName?: string }>,
  ): Map<string, string> {
    const map = new Map<string, string>();
    if (!Array.isArray(stationList)) return map;
    for (const s of stationList) {
      const code = String(s.stationCode ?? '')
        .trim()
        .toUpperCase();
      const name = String(s.stationName ?? '').trim();
      if (code && name) map.set(code, name);
    }
    return map;
  }

  /**
   * Fill in full station names for any `codes` the map is missing, from the
   * seeded station cache. Best-effort — on error (or an unknown code) the label
   * simply falls back to the bare code.
   */
  private async enrichStationNames(
    map: Map<string, string>,
    codes: string[],
  ): Promise<void> {
    const missing = codes
      .map((c) =>
        String(c ?? '')
          .trim()
          .toUpperCase(),
      )
      .filter((c) => c && !map.has(c));
    if (missing.length === 0) return;
    try {
      const names = await this.stationCache.namesForCodes(missing);
      for (const [code, name] of names) {
        if (name?.trim()) map.set(code, name.trim());
      }
    } catch (err) {
      console.warn(
        'station name enrichment failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async notifyUser(params: {
    email?: string | null;
    mobile?: string | null;
    task: Pick<
      ChartTimeAvailabilityTask,
      | 'trainNumber'
      | 'trainName'
      | 'fromStationCode'
      | 'toStationCode'
      | 'journeyDate'
    > & { id?: string };
    result: Service2CheckResult;
    alternativeTrains?: BestTrainCandidateResult[];
    isFollowUpLeg?: boolean;
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const { email, mobile, task, result, isFollowUpLeg } = params;
    const alternativeTrains = params.alternativeTrains?.slice(0, 5);
    const out = { emailSent: false, whatsappSent: false };

    try {
      if (!email?.trim() && !mobile?.trim()) {
        return out;
      }
      // Defence-in-depth: skip if recipient has unsubscribed
      if (this.unsubscribeService) {
        if (email && (await this.unsubscribeService.isUnsubscribed(email))) {
          return out;
        }
        if (mobile && (await this.unsubscribeService.isUnsubscribed(mobile))) {
          return out;
        }
      }
      if (result.status !== 'success') {
        return out;
      }
      if (isFollowUpLeg) {
        console.log(
          `[notification] Leg update notifications disabled; skipping for train ${task.trainNumber}`,
        );
        return out;
      }
      const hasTickets = hasBookablePlanForNotification(result);

      // Build a tracked unsubscribe short-link for the recipient we will
      // notify (best-effort; falls back to no link if ShortLinkService is
      // unavailable).
      const [emailUnsubscribeUrl, whatsappUnsubscribeUrl] = await Promise.all([
        email?.trim()
          ? this.createUnsubscribeShortLink(email.trim(), 'email')
          : Promise.resolve(undefined),
        mobile?.trim()
          ? this.createUnsubscribeShortLink(
              normalizeE164Mobile(mobile.trim()),
              'whatsapp',
            )
          : Promise.resolve(undefined),
      ]);
      const emailFooterUrl = emailUnsubscribeUrl;
      const whatsappFooterUrl =
        whatsappUnsubscribeUrl || (email ? emailUnsubscribeUrl : undefined);

      const trainLabel = [task.trainNumber, task.trainName]
        .filter(Boolean)
        .join(' ');
      const stationScheduleList = result.trainSchedule?.stationList;
      const stationNameMap = this.getStationNameMap(stationScheduleList);
      const plan = (result.openAiBookingPlan ?? []).filter(
        isFilledOpenAiPlanItem,
      );
      const journeyDateStr =
        task.journeyDate instanceof Date
          ? task.journeyDate.toISOString().slice(0, 10)
          : String(task.journeyDate).slice(0, 10);

      const coverage = this.extractJourneyLegCoverage({
        fromStationCode: task.fromStationCode,
        toStationCode: task.toStationCode,
        plan,
        stationScheduleList,
      });

      await this.enrichStationNames(stationNameMap, [
        task.fromStationCode,
        task.toStationCode,
        ...(result.chartPreparationDetails?.chartingStationCode
          ? [result.chartPreparationDetails.chartingStationCode]
          : []),
        ...coverage.flatMap((c) => [c.fromCode, c.toCode]),
        ...plan.flatMap((p) =>
          String(p?.instruction ?? '')
            .split(' - ')
            .slice(0, 2),
        ),
      ]);

      let chartPreparationText: string | undefined;
      if (result.chartPreparationDetails) {
        const chartingCode = result.chartPreparationDetails.chartingStationCode;
        const chartingName =
          stationNameMap.get(chartingCode.toUpperCase()) ?? chartingCode;
        const rawTime = result.chartPreparationDetails.firstChartCreationTime;
        const formatted = formatChartTimeIst(journeyDateStr, rawTime, 0);
        const timeDisplay = formatted ? formatted.formattedTime : rawTime;
        chartPreparationText = `Chart was prepared for ${chartingName} on ${timeDisplay} and we found some tickets.`;
      }
      const routeDisplay = `${task.fromStationCode} > ${task.toStationCode}`;
      const emailRouteDisplay = this.formatJourneyRoute(
        task.fromStationCode,
        task.toStationCode,
        stationNameMap,
        stationScheduleList,
      );
      const totalPrice = result.openAiTotalPrice ?? undefined;

      const journeyDateReadable = formatJourneyDateReadable(journeyDateStr);
      const journeyTimesLine = formatSegmentScheduleTimes(
        stationScheduleList,
        task.fromStationCode,
        task.toStationCode,
      );

      const hasAltTrains = Boolean(
        !hasTickets && alternativeTrains && alternativeTrains.length > 0,
      );
      const notificationType = hasTickets
        ? 'seats_found'
        : hasAltTrains
          ? 'alt_trains'
          : 'no_seats';
      const windowHours = notificationType === 'seats_found' ? 1 : 4;

      if (mobile?.trim()) {
        let shouldSendWhatsApp = true;
        if (this.deduplicationService) {
          shouldSendWhatsApp =
            await this.deduplicationService.shouldSendNotification({
              recipient: mobile.trim(),
              channel: 'whatsapp',
              trainNumber: task.trainNumber,
              journeyDate: task.journeyDate,
              notificationType,
              windowHours,
            });
        }

        if (shouldSendWhatsApp) {
          let whatsappSearchUrl = `https://lastberth.com/search?from=${encodeURIComponent(task.fromStationCode)}&to=${encodeURIComponent(task.toStationCode)}&date=${encodeURIComponent(journeyDateStr)}&trainNo=${encodeURIComponent(task.trainNumber)}`;
          if (this.shortLinkService && mobile?.trim()) {
            try {
              whatsappSearchUrl =
                await this.shortLinkService.createSearchShortLink({
                  from: task.fromStationCode,
                  to: task.toStationCode,
                  date: journeyDateStr,
                  trainNo: task.trainNumber,
                  channel: 'whatsapp',
                  recipient: mobile.trim(),
                  metadata: {
                    journeyTaskId: task.id,
                    trainNumber: task.trainNumber,
                    notificationType,
                  },
                });
            } catch {
              // fallback
            }
          }

          const whatsAppText =
            isFollowUpLeg && hasTickets
              ? this.buildFollowUpLegWhatsAppText({
                  trainLabel,
                  routeDisplay,
                  journeyDateReadable,
                  plan,
                  stationNameMap,
                  stationScheduleList,
                  trainNumber: task.trainNumber,
                  chartPreparationText,
                  unsubscribeUrl: whatsappFooterUrl,
                })
              : hasTickets
                ? await this.buildWhatsAppSeatsFoundText({
                    trainLabel,
                    routeDisplay,
                    journeyDateReadable,
                    journeyDateStr,
                    trainNumber: task.trainNumber,
                    fromStationCode: task.fromStationCode,
                    toStationCode: task.toStationCode,
                    journeyTimesLine: journeyTimesLine || undefined,
                    chartPreparationText,
                    plan,
                    stationNameMap,
                    stationScheduleList,
                    result,
                    email: email || undefined,
                    mobile: mobile || undefined,
                    unsubscribeUrl: whatsappFooterUrl,
                  })
                : this.buildNoSeatsWhatsAppText({
                    trainLabel,
                    routeDisplay,
                    journeyDateReadable,
                    openAiSummary: result.openAiSummary,
                    alternativeTrains,
                    fromCode: task.fromStationCode,
                    toCode: task.toStationCode,
                    date: journeyDateStr,
                    searchUrl: whatsappSearchUrl,
                    unsubscribeUrl: whatsappFooterUrl,
                  });

          const templateName = hasTickets
            ? this.config.get<string>('WATI_TEMPLATE_CHART_ALERT') ||
              'subscription_alert'
            : this.config.get<string>('WATI_TEMPLATE_UNCOVERED_LEG') ||
              'uncovered_leg__shortlink_alert';

          const classCodeExtracted =
            plan?.[0]?.instruction
              ?.match?.(/\b([123]A|3E|SL|2S|CC|EC)\b/i)?.[1]
              ?.toUpperCase() || 'SL';
          const statusExtracted =
            plan?.[0]?.instruction ||
            (hasTickets ? 'Available' : 'Waitlisted (Not Available)');
          const searchUrl = whatsappSearchUrl;

          let parameters: Array<{ name: string; value: string }>;

          if (templateName === 'subscription_alert') {
            parameters = [
              { name: 'name', value: 'Passenger' },
              { name: 'train_number', value: task.trainNumber },
              { name: 'train_name', value: task.trainName || 'Express' },
              { name: 'from_code', value: task.fromStationCode },
              { name: 'to_code', value: task.toStationCode },
              { name: 'journey_date', value: journeyDateReadable },
              {
                name: 'journey_times',
                value: journeyTimesLine?.trim() || 'Not Available',
              },
              { name: 'ticket_number', value: '1' },
              { name: 'class_code', value: classCodeExtracted },
              { name: 'availability_status', value: statusExtracted },
              {
                name: 'segment_route',
                value: `${task.fromStationCode} → ${task.toStationCode}`,
              },
              {
                name: 'approx_price',
                value: totalPrice ? String(totalPrice) : '0',
              },
              {
                name: 'irctc_booking_url',
                value: 'https://www.irctc.co.in/nget/redirect',
              },
            ];
          } else if (
            templateName === 'uncovered_leg__shortlink_alert' ||
            templateName === 'uncovered_leg_alert'
          ) {
            parameters = [
              { name: 'name', value: 'Passenger' },
              { name: 'train_number', value: task.trainNumber },
              { name: 'train_name', value: task.trainName || 'Express' },
              { name: 'from_code', value: task.fromStationCode },
              { name: 'to_code', value: task.toStationCode },
              { name: 'journey_date', value: journeyDateReadable },
              {
                name: 'uncovered_segment_route',
                value: `${task.fromStationCode} → ${task.toStationCode}`,
              },
              {
                name: 'chart_release_time_label',
                value: chartPreparationText || 'Chart prepared',
              },
              { name: 'action_button_text', value: 'Check Seat Availability' },
              { name: 'action_url', value: searchUrl },
            ];
          } else {
            parameters = [
              { name: 'name', value: 'Passenger' },
              { name: 'train_number', value: task.trainNumber },
              { name: 'train_name', value: task.trainName || 'Express' },
              { name: 'from_code', value: task.fromStationCode },
              { name: 'to_code', value: task.toStationCode },
              { name: 'journey_date', value: journeyDateReadable },
              {
                name: 'journey_times',
                value: journeyTimesLine?.trim() || 'Not Available',
              },
            ];
          }

          out.whatsappSent = await this.sendWhatsApp(
            mobile.trim(),
            whatsAppText,
            {
              templateName,
              broadcastName: 'lastberth_alert',
              parameters,
              skipFailureReport: true,
            },
          );

          if (out.whatsappSent && this.deduplicationService) {
            void this.deduplicationService.recordNotificationSent({
              recipient: mobile.trim(),
              channel: 'whatsapp',
              trainNumber: task.trainNumber,
              journeyDate: task.journeyDate,
              notificationType,
            });
          }

          if (!out.whatsappSent) {
            void this.sendAlertFailureReport({
              alertType: 'WhatsApp Seat Availability Alert',
              recipientMobile: mobile.trim(),
              recipientEmail: email?.trim() || undefined,
              trainNumber: task.trainNumber,
              trainName: task.trainName,
              fromStationCode: task.fromStationCode,
              toStationCode: task.toStationCode,
              journeyDate: task.journeyDate,
              failureReason:
                'WhatsApp alert sending failed or provider returned failure',
              logs: `Template: ${templateName}\nRoute: ${task.fromStationCode} -> ${task.toStationCode}\nStatus: ${result.status}`,
              payload: {
                task,
                openAiSummary: result.openAiSummary,
                bookingPlan: plan,
                alternativeTrains: alternativeTrains?.map(
                  (a) => a.train?.trainNumber,
                ),
                whatsAppText,
              },
            });
          }
        }
      }

      if (email?.trim()) {
        let shouldSendEmail = true;
        if (this.deduplicationService) {
          shouldSendEmail =
            await this.deduplicationService.shouldSendNotification({
              recipient: email.trim(),
              channel: 'email',
              trainNumber: task.trainNumber,
              journeyDate: task.journeyDate,
              notificationType,
              windowHours,
            });
        }

        if (shouldSendEmail) {
          const subject =
            isFollowUpLeg && hasTickets
              ? `Leg Update: Seats Available - ${task.trainNumber} (${task.fromStationCode} → ${task.toStationCode}) on ${journeyDateReadable}`
              : hasTickets
                ? `Seats Available - Train ${task.trainNumber} on ${journeyDateReadable}`
                : hasAltTrains
                  ? `Alternate Trains Available - Train ${task.trainNumber} (${task.fromStationCode} → ${task.toStationCode}) on ${journeyDateReadable}`
                  : `No Tickets Found - Train ${task.trainNumber} on ${journeyDateReadable}`;
          let emailSearchUrl = `https://lastberth.com/search?from=${encodeURIComponent(task.fromStationCode)}&to=${encodeURIComponent(task.toStationCode)}&date=${encodeURIComponent(journeyDateStr)}&trainNo=${encodeURIComponent(task.trainNumber)}`;
          if (this.shortLinkService && email?.trim()) {
            try {
              emailSearchUrl =
                await this.shortLinkService.createSearchShortLink({
                  from: task.fromStationCode,
                  to: task.toStationCode,
                  date: journeyDateStr,
                  trainNo: task.trainNumber,
                  channel: 'email',
                  recipient: email.trim(),
                  metadata: {
                    journeyTaskId: task.id,
                    trainNumber: task.trainNumber,
                    notificationType,
                  },
                });
            } catch {
              // fallback
            }
          }

          const html =
            isFollowUpLeg && hasTickets
              ? this.buildFollowUpLegEmailHtml({
                  trainLabel,
                  routeDisplay: emailRouteDisplay,
                  journeyDateReadable,
                  plan,
                  stationNameMap,
                  stationScheduleList,
                  trainNumber: task.trainNumber,
                  chartPreparationText,
                  unsubscribeUrl: emailFooterUrl,
                })
              : hasTickets
                ? await this.buildSeatsFoundEmailHtml({
                    trainLabel,
                    routeDisplay: emailRouteDisplay,
                    journeyDateReadable,
                    journeyDateStr,
                    fromStationCode: task.fromStationCode,
                    toStationCode: task.toStationCode,
                    journeyTimesLine: journeyTimesLine || undefined,
                    chartPreparationText,
                    trainNumber: task.trainNumber,
                    plan,
                    totalPrice,
                    stationNameMap,
                    stationScheduleList,
                    result,
                    unsubscribeUrl: emailFooterUrl,
                  })
                : this.buildNoSeatsEmailHtml({
                    trainLabel,
                    routeDisplay: emailRouteDisplay,
                    journeyDateReadable,
                    openAiSummary: result.openAiSummary,
                    alternativeTrains,
                    fromCode: task.fromStationCode,
                    toCode: task.toStationCode,
                    date: journeyDateStr,
                    searchUrl: emailSearchUrl,
                    unsubscribeUrl: emailFooterUrl,
                  });

          out.emailSent = await this.sendEmail(email.trim(), subject, html, {
            skipFailureReport: true,
          });

          if (out.emailSent && this.deduplicationService) {
            void this.deduplicationService.recordNotificationSent({
              recipient: email.trim(),
              channel: 'email',
              trainNumber: task.trainNumber,
              journeyDate: task.journeyDate,
              notificationType,
            });
          }

          if (!out.emailSent) {
            void this.sendAlertFailureReport({
              alertType: 'Email Seat Availability Alert',
              recipientEmail: email.trim(),
              recipientMobile: mobile?.trim() || undefined,
              trainNumber: task.trainNumber,
              trainName: task.trainName,
              fromStationCode: task.fromStationCode,
              toStationCode: task.toStationCode,
              journeyDate: task.journeyDate,
              failureReason:
                'Email alert sending failed (Resend API key missing or error)',
              logs: `Subject: ${subject}\nRoute: ${task.fromStationCode} -> ${task.toStationCode}\nStatus: ${result.status}`,
              payload: {
                task,
                subject,
                openAiSummary: result.openAiSummary,
                bookingPlan: plan,
              },
            });
          }
        }
      }
      return out;
    } catch (err) {
      const errMessage =
        err instanceof Error ? err.stack || err.message : String(err);
      void this.sendAlertFailureReport({
        alertType: 'notifyUser Processing Exception',
        recipientMobile: mobile || undefined,
        recipientEmail: email || undefined,
        trainNumber: task.trainNumber,
        trainName: task.trainName,
        fromStationCode: task.fromStationCode,
        toStationCode: task.toStationCode,
        journeyDate: task.journeyDate,
        failureReason: 'Unhandled exception inside notifyUser',
        logs: errMessage,
        payload: { task, result },
      });
      return out;
    }
  }

  async notifyUserAlternativeTrains(params: {
    email?: string | null;
    mobile?: string | null;
    originalTrainNumber: string;
    originalTrainName?: string | null;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: Date | string;
    alternativeTrains: BestTrainCandidateResult[];
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const {
      email,
      mobile,
      originalTrainNumber,
      originalTrainName,
      fromStationCode,
      toStationCode,
      journeyDate,
    } = params;
    const alternativeTrains = params.alternativeTrains?.slice(0, 5);
    const out = { emailSent: false, whatsappSent: false };

    try {
      if (!email?.trim() && !mobile?.trim()) return out;
      if (!alternativeTrains || alternativeTrains.length === 0) return out;
      // Defence-in-depth: skip if recipient has unsubscribed
      if (this.unsubscribeService) {
        if (email && (await this.unsubscribeService.isUnsubscribed(email))) {
          return out;
        }
        if (mobile && (await this.unsubscribeService.isUnsubscribed(mobile))) {
          return out;
        }
      }

      // Build a tracked unsubscribe short-link for the recipient.
      const [emailUnsubscribeUrl, whatsappUnsubscribeUrl] = await Promise.all([
        email?.trim()
          ? this.createUnsubscribeShortLink(email.trim(), 'email')
          : Promise.resolve(undefined),
        mobile?.trim()
          ? this.createUnsubscribeShortLink(
              normalizeE164Mobile(mobile.trim()),
              'whatsapp',
            )
          : Promise.resolve(undefined),
      ]);
      const emailFooterUrl = emailUnsubscribeUrl;
      const whatsappFooterUrl =
        whatsappUnsubscribeUrl || (email ? emailUnsubscribeUrl : undefined);

      const journeyDateStr =
        journeyDate instanceof Date
          ? journeyDate.toISOString().slice(0, 10)
          : String(journeyDate).slice(0, 10);
      const journeyDateReadable = formatJourneyDateReadable(journeyDateStr);

      const stationNameMap = new Map<string, string>();
      await this.enrichStationNames(stationNameMap, [
        fromStationCode,
        toStationCode,
        ...alternativeTrains.flatMap((a) =>
          a.alternatePath.legs.flatMap((l) => [l.from, l.to]),
        ),
      ]);

      const fromName =
        stationNameMap.get(fromStationCode.toUpperCase()) ?? fromStationCode;
      const toName =
        stationNameMap.get(toStationCode.toUpperCase()) ?? toStationCode;
      const routeDisplay = `${fromStationCode} - ${fromName} → ${toStationCode} - ${toName}`;
      const originalTrainLabel = [originalTrainNumber, originalTrainName]
        .filter(Boolean)
        .join(' ');

      if (mobile?.trim()) {
        let shouldSendWhatsApp = true;
        if (this.deduplicationService) {
          shouldSendWhatsApp =
            await this.deduplicationService.shouldSendNotification({
              recipient: mobile.trim(),
              channel: 'whatsapp',
              trainNumber: originalTrainNumber,
              journeyDate,
              notificationType: 'alt_trains',
              windowHours: 2,
            });
        }

        if (shouldSendWhatsApp) {
          const whatsAppText = this.buildAlternativeTrainsWhatsAppText({
            originalTrainLabel,
            routeDisplay,
            journeyDateReadable,
            journeyDateStr,
            fromStationCode,
            toStationCode,
            alternativeTrains,
            stationNameMap,
            unsubscribeUrl: whatsappFooterUrl,
          });
          const altTemplateName =
            this.config.get<string>('WATI_TEMPLATE_ALT_TRAIN') ||
            'alternative_train_alert';
          const altParameters = [
            { name: 'name', value: 'Passenger' },
            { name: 'original_train_number', value: originalTrainNumber || '' },
            { name: 'original_train_name', value: originalTrainName || '' },
            { name: 'from_code', value: fromStationCode || '' },
            { name: 'to_code', value: toStationCode || '' },
            { name: 'journey_date', value: journeyDateReadable || '' },
          ];

          out.whatsappSent = await this.sendWhatsApp(
            mobile.trim(),
            whatsAppText,
            {
              templateName: altTemplateName,
              broadcastName: 'lastberth_alt_alert',
              parameters: altParameters,
              skipFailureReport: true,
            },
          );

          if (out.whatsappSent && this.deduplicationService) {
            void this.deduplicationService.recordNotificationSent({
              recipient: mobile.trim(),
              channel: 'whatsapp',
              trainNumber: originalTrainNumber,
              journeyDate,
              notificationType: 'alt_trains',
            });
          }

          if (!out.whatsappSent) {
            void this.sendAlertFailureReport({
              alertType: 'WhatsApp Alternative Trains Alert',
              recipientMobile: mobile.trim(),
              recipientEmail: email?.trim() || undefined,
              trainNumber: originalTrainNumber,
              trainName: originalTrainName,
              fromStationCode,
              toStationCode,
              journeyDate,
              failureReason:
                'WhatsApp alternative trains alert failed to dispatch',
              logs: `Template: ${altTemplateName}`,
              payload: {
                originalTrainNumber,
                originalTrainName,
                fromStationCode,
                toStationCode,
                journeyDate,
                alternativeCount: alternativeTrains.length,
                whatsAppText,
              },
            });
          }
        }
      }

      if (email?.trim()) {
        let shouldSendEmail = true;
        if (this.deduplicationService) {
          shouldSendEmail =
            await this.deduplicationService.shouldSendNotification({
              recipient: email.trim(),
              channel: 'email',
              trainNumber: originalTrainNumber,
              journeyDate,
              notificationType: 'alt_trains',
              windowHours: 2,
            });
        }

        if (shouldSendEmail) {
          const subject = `Alternative Trains Available - ${fromStationCode} to ${toStationCode} on ${journeyDateReadable}`;
          const html = this.buildAlternativeTrainsEmailHtml({
            originalTrainLabel,
            routeDisplay,
            journeyDateReadable,
            journeyDateStr,
            fromStationCode,
            toStationCode,
            alternativeTrains,
            stationNameMap,
            unsubscribeUrl: emailFooterUrl,
          });
          out.emailSent = await this.sendEmail(email.trim(), subject, html, {
            skipFailureReport: true,
          });

          if (out.emailSent && this.deduplicationService) {
            void this.deduplicationService.recordNotificationSent({
              recipient: email.trim(),
              channel: 'email',
              trainNumber: originalTrainNumber,
              journeyDate,
              notificationType: 'alt_trains',
            });
          }

          if (!out.emailSent) {
            void this.sendAlertFailureReport({
              alertType: 'Email Alternative Trains Alert',
              recipientEmail: email.trim(),
              recipientMobile: mobile?.trim() || undefined,
              trainNumber: originalTrainNumber,
              trainName: originalTrainName,
              fromStationCode,
              toStationCode,
              journeyDate,
              failureReason: 'Email alternative trains alert failed to send',
              logs: `Subject: ${subject}`,
              payload: {
                originalTrainNumber,
                fromStationCode,
                toStationCode,
                journeyDate,
                subject,
              },
            });
          }
        }
      }

      return out;
    } catch (err) {
      const errMessage =
        err instanceof Error ? err.stack || err.message : String(err);
      void this.sendAlertFailureReport({
        alertType: 'notifyUserAlternativeTrains Exception',
        recipientMobile: mobile || undefined,
        recipientEmail: email || undefined,
        trainNumber: originalTrainNumber,
        trainName: originalTrainName,
        fromStationCode,
        toStationCode,
        journeyDate,
        failureReason: 'Unhandled exception inside notifyUserAlternativeTrains',
        logs: errMessage,
        payload: {
          originalTrainNumber,
          fromStationCode,
          toStationCode,
          journeyDate,
        },
      });
      return out;
    }
  }

  private buildAlternativeTrainsWhatsAppText(params: {
    originalTrainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    journeyDateStr: string;
    fromStationCode: string;
    toStationCode: string;
    alternativeTrains: BestTrainCandidateResult[];
    stationNameMap: Map<string, string>;
    unsubscribeUrl?: string;
  }): string {
    const {
      originalTrainLabel,
      routeDisplay,
      journeyDateReadable,
      alternativeTrains,
      stationNameMap,
    } = params;

    const lines: string[] = [
      '*LastBerth Alternative Train Alert* 🔔',
      `Full-journey confirmed tickets are available on another train for your route:`,
      '',
      `Requested Train: ${originalTrainLabel}`,
      `Route: ${routeDisplay}`,
      `Date: ${journeyDateReadable}`,
      '',
    ];

    alternativeTrains.slice(0, 5).forEach((alt, idx) => {
      const train = alt.train;
      const trainLabel = [train.trainNumber, train.trainName]
        .filter(Boolean)
        .join(' ');
      lines.push(`Option ${idx + 1}: ${trainLabel}`);

      const confirmedLegs = alt.alternatePath.legs.filter(
        (l) => l.segmentKind === 'confirmed',
      );
      for (const leg of confirmedLegs) {
        const segFrom = leg.from;
        const segTo = leg.to;
        const fromName = stationNameMap.get(segFrom.toUpperCase()) ?? segFrom;
        const toName = stationNameMap.get(segTo.toUpperCase()) ?? segTo;
        const legRoute = `${segFrom} - ${fromName} → ${leg.to} - ${toName}`;
        const classTag = leg.travelClass ?? '3A';
        const availTag =
          leg.availabilityDisplayName || leg.railDataStatus || 'Available';
        const priceStr = leg.fare != null ? `approx ₹${leg.fare}` : '';
        const segBookUrl = this.buildIrctcUrl({
          fromStationCode: segFrom,
          toStationCode: segTo,
          trainNumber: train.trainNumber,
          classCode: classTag,
        });

        lines.push(`Ticket [${classTag}] | ${availTag}`);
        lines.push(legRoute);
        if (priceStr) lines.push(priceStr);
        lines.push(`Book on IRCTC: ${segBookUrl}`);
      }
      lines.push('');
    });

    lines.push('Track live seat updates anytime on LastBerth! 🚄');
    if (params.unsubscribeUrl) {
      lines.push('');
      lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
    }

    return lines.join('\n').trim();
  }

  private buildAlternativeTrainsEmailHtml(params: {
    originalTrainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    journeyDateStr: string;
    fromStationCode: string;
    toStationCode: string;
    alternativeTrains: BestTrainCandidateResult[];
    stationNameMap: Map<string, string>;
    unsubscribeUrl?: string;
  }): string {
    const {
      originalTrainLabel,
      routeDisplay,
      journeyDateReadable,
      alternativeTrains,
      stationNameMap,
    } = params;

    const cardsHtml = alternativeTrains
      .slice(0, 5)
      .map((alt, idx) => {
        const train = alt.train;
        const trainLabel = [train.trainNumber, train.trainName]
          .filter(Boolean)
          .join(' ');
        const confirmedLegs = alt.alternatePath.legs.filter(
          (l) => l.segmentKind === 'confirmed',
        );

        const legsHtml = confirmedLegs
          .map((leg) => {
            const segFrom = leg.from;
            const segTo = leg.to;
            const fromName =
              stationNameMap.get(segFrom.toUpperCase()) ?? segFrom;
            const toName = stationNameMap.get(segTo.toUpperCase()) ?? segTo;
            const legRoute = `${segFrom} - ${fromName} → ${leg.to} - ${toName}`;
            const classTag = leg.travelClass ?? '3A';
            const availTag =
              leg.availabilityDisplayName || leg.railDataStatus || 'Available';
            const priceStr = leg.fare != null ? `₹${leg.fare}` : '';
            const segBookUrl = this.buildIrctcUrl({
              fromStationCode: segFrom,
              toStationCode: segTo,
              trainNumber: train.trainNumber,
              classCode: classTag,
            });

            return `
        <div style="margin-top:8px; padding:12px; border-radius:8px; border:1px solid #86efac; background:#e6ffe6;">
          <p style="margin:0; font-size:14px; font-weight:600; color:#166534;">Option ${idx + 1}: ${escapeHtml(trainLabel)}</p>
          <p style="margin:4px 0 0 0; font-size:13px; color:#1e293b;">${escapeHtml(legRoute)}</p>
          <p style="margin:4px 0 0 0; font-size:13px; font-weight:600; color:#059669;">Class ${classTag} | ${escapeHtml(availTag)} ${priceStr ? `(${priceStr})` : ''}</p>
          <a href="${segBookUrl}" style="display:inline-block; margin-top:8px; padding:6px 14px; border-radius:6px; background:#16a34a; color:#fff; font-size:12px; font-weight:600; text-decoration:none;">Book on IRCTC</a>
        </div>`;
          })
          .join('');

        return legsHtml;
      })
      .join('');

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">Alternative Trains Available 🔔</h2>
    <p style="margin:0 0 12px 0;">We found full-journey confirmed seats on another train for your route:</p>
    <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;">
      <p style="margin:0;font-weight:600;">Requested: ${escapeHtml(originalTrainLabel)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(routeDisplay)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(journeyDateReadable)}</p>
    </div>
    ${cardsHtml}
  </div>
  <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.${
    params.unsubscribeUrl
      ? ` <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
      : ''
  }</p>
</body>
</html>`;
  }
}
