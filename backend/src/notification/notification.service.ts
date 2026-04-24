import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import axios from 'axios';
import {
  isFilledOpenAiPlanItem,
  type OpenAiBookingPlanItem,
  type Service2CheckResult,
} from '../service2/service2.service';
import type { ChartTimeAvailabilityTask } from '@prisma/client';
import { irctcBookingRedirect } from '../common/irctc-booking-redirect';
import type { ScheduleStation } from '../irctc/irctc.service';
import {
  formatJourneyDateReadable,
  formatSegmentScheduleTimes,
  hasBookablePlanForNotification,
} from './notification.helpers';

const WASENDER_BASE = 'https://www.wasenderapi.com';
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
function toE164(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('6') === false) {
    return `91${digits}`;
  }
  if (digits.length >= 10 && digits.startsWith('91')) {
    return digits;
  }
  return digits || mobile;
}

@Injectable()
export class NotificationService {
  private readonly wasenderKey: string | undefined;
  private readonly resendKey: string | undefined;
  private readonly resend: Resend | null;
  /** Receives a one-off email when POST /api/availability/journey creates monitoring tasks. */
  private readonly monitoringAdminEmail: string;

  constructor(private config: ConfigService) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY');
    this.resendKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = this.resendKey ? new Resend(this.resendKey) : null;
    this.monitoringAdminEmail =
      this.config.get<string>('MONITORING_ADMIN_EMAIL')?.trim() ||
      DEFAULT_MONITORING_ADMIN_EMAIL;
  }

  async sendWhatsApp(mobile: string, message: string): Promise<boolean> {
    if (!this.wasenderKey?.trim()) {
      return false;
    }
    const to = toE164(mobile);
    try {
      await axios.post(
        `${WASENDER_BASE}/api/send-message`,
        { to: to.startsWith('+') ? to : `+${to}`, text: message },
        {
          headers: {
            Authorization: `Bearer ${this.wasenderKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
      return true;
    } catch (err) {
      console.error('WaSender WhatsApp send failed', err);
      return false;
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      return false;
    }
    try {
      await this.resend.emails.send({
        from: RESEND_FROM,
        to: [to],
        subject,
        html,
      });
      return true;
    } catch (err) {
      console.error('Resend email send failed', err);
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

  private firstPlannedClassCode(result: Service2CheckResult): string | null {
    const filled = result.openAiBookingPlan?.find(isFilledOpenAiPlanItem);
    const instruction = filled?.instruction ?? '';
    const parts = instruction.split(' - ').map((p) => p.trim());
    return parts[2] || null;
  }

  /** Build IRCTC URL for a segment from instruction "FROM - TO - CLASS". */
  private buildSegmentBookUrl(
    trainNumber: string,
    instruction: string,
  ): string {
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

  /** Format segment for display: "CODE - Name → CODE - Name" using station names when available. */
  private formatSegmentRoute(
    instruction: string,
    stationNameMap: Map<string, string>,
  ): string {
    const parts = instruction.split(' - ').map((p) => p.trim());
    const fromCode = parts[0] ?? '';
    const toCode = parts[1] ?? '';
    const fromName = stationNameMap.get(fromCode.toUpperCase()) ?? fromCode;
    const toName = stationNameMap.get(toCode.toUpperCase()) ?? toCode;
    return `${fromCode} - ${fromName} → ${toCode} - ${toName}`;
  }

  /** Format top-level route for email header using full station names when available. */
  private formatJourneyRoute(
    fromCode: string,
    toCode: string,
    stationNameMap: Map<string, string>,
  ): string {
    const fromName =
      stationNameMap.get(fromCode.trim().toUpperCase()) ?? fromCode;
    const toName = stationNameMap.get(toCode.trim().toUpperCase()) ?? toCode;
    return `${fromName} → ${toName}`;
  }

  /** Build HTML email body matching booking UI: train header, route with >, chart prep, ticket cards, total right-aligned. */
  private buildSeatsFoundEmailHtml(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    journeyTimesLine?: string;
    chartPreparationText?: string;
    trainNumber: string;
    plan: OpenAiBookingPlanItem[];
    totalPrice?: number;
    stationNameMap: Map<string, string>;
    stationScheduleList?: ScheduleStation[];
  }): string {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      journeyTimesLine,
      chartPreparationText,
      trainNumber,
      plan,
      totalPrice,
      stationNameMap,
      stationScheduleList,
    } = params;

    const bookable = plan.filter(isFilledOpenAiPlanItem);
    const cardRows =
      bookable.length > 0
        ? bookable
            .map((seg, i) => {
              const segUrl = this.buildSegmentBookUrl(
                trainNumber,
                seg.instruction,
              );
              const segmentRoute = this.formatSegmentRoute(
                seg.instruction,
                stationNameMap,
              );
              const parts = seg.instruction.split(' - ').map((p) => p.trim());
              const segFrom = parts[0] ?? '';
              const segTo = parts[1] ?? '';
              const segmentTimes =
                segFrom && segTo
                  ? formatSegmentScheduleTimes(
                      stationScheduleList,
                      segFrom,
                      segTo,
                    )
                  : '';
              const classTag = (seg.instruction.split(' - ')[2] ?? '3A').trim();
              const priceStr =
                seg.approx_price != null
                  ? `₹${Number(seg.approx_price).toLocaleString('en-IN')}`
                  : '';
              return `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; border:1px solid #86efac; background:#e6ffe6; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">Ticket ${i + 1}
              <span style="display:inline-block; margin-left:8px; padding:3px 10px; border-radius:8px; background:#22c55e; color:#fff; font-size:12px; font-weight:600;">${classTag}</span>
            </p>
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">${escapeHtml(segmentRoute)}</p>
            ${segmentTimes ? `<p style="margin:0 0 10px 0; font-size:13px; color:#64748b;">${escapeHtml(segmentTimes)}</p>` : ''}
            ${priceStr ? `<p style="margin:10px 0 0 0; font-size:15px; font-weight:600; color:#0f172a;"><span style="font-size:12px; font-weight:400; color:#64748b;">approx</span> ${priceStr}</p>` : ''}
            <a href="${segUrl}" style="display:inline-block; margin-top:16px; padding:12px 24px; border-radius:12px; background:#22c55e; color:#fff; font-size:15px; font-weight:600; text-decoration:none;">Book</a>
          </td>
        </tr>
      </table>
    </td></tr>`;
            })
            .join('')
        : '';

    const totalRow =
      totalPrice != null && totalPrice > 0
        ? `
    <tr><td style="padding:16px 20px 0 0; font-size:15px; font-weight:500; color:#1e293b; text-align:right;">Total approx. fare: ~ ₹${Number(totalPrice).toLocaleString('en-IN')}</td></tr>`
        : '';

    const chartPrepLine = chartPreparationText
      ? `<p style="margin:4px 0 0 0; font-size:13px; color:#64748b; font-style:italic;">${chartPreparationText}</p>`
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seats Available - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f1f5f9; color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 20px;">
              <p style="margin:0; font-size:20px; font-weight:700; color:#0f172a;">${escapeHtml(trainLabel)}</p>
              <p style="margin:8px 0 0 0; font-size:14px; color:#64748b;">${escapeHtml(routeDisplay)}</p>
              <p style="margin:8px 0 0 0; font-size:14px; color:#334155;">${escapeHtml(journeyDateReadable)}</p>
              ${journeyTimesLine ? `<p style="margin:6px 0 0 0; font-size:13px; color:#64748b;">${escapeHtml(journeyTimesLine)}</p>` : ''}
              ${chartPrepLine}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${cardRows}
              </table>
              ${totalRow}
              <p style="margin:16px 0 0 0; font-size:12px; color:#94a3b8; text-align:center;">Book quickly — seats can sell out fast.</p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /** Build WhatsApp plain text to match booking UI: train, route with >, chart prep, ticket lines, total. */
  private buildWhatsAppSeatsFoundText(params: {
    trainLabel: string;
    routeDisplay: string;
    journeyDateReadable: string;
    journeyTimesLine?: string;
    chartPreparationText?: string;
    plan: OpenAiBookingPlanItem[];
    totalPrice?: number;
    stationNameMap: Map<string, string>;
    stationScheduleList?: ScheduleStation[];
    bookUrl: string;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      journeyTimesLine,
      chartPreparationText,
      plan,
      totalPrice,
      stationNameMap,
      stationScheduleList,
      bookUrl,
    } = params;
    const lines: string[] = [
      trainLabel,
      routeDisplay,
      journeyDateReadable,
      ...(journeyTimesLine ? [journeyTimesLine] : []),
      ...(chartPreparationText ? [chartPreparationText] : []),
      '',
    ];
    const bookable = plan.filter(isFilledOpenAiPlanItem);
    bookable.forEach((seg, i) => {
      const segmentRoute = this.formatSegmentRoute(
        seg.instruction,
        stationNameMap,
      );
      const parts = seg.instruction.split(' - ').map((p) => p.trim());
      const segFrom = parts[0] ?? '';
      const segTo = parts[1] ?? '';
      const segmentTimes =
        segFrom && segTo
          ? formatSegmentScheduleTimes(stationScheduleList, segFrom, segTo)
          : '';
      const classTag = (seg.instruction.split(' - ')[2] ?? '3A').trim();
      const priceStr =
        seg.approx_price != null
          ? `approx ₹${Number(seg.approx_price).toLocaleString('en-IN')}`
          : '';
      lines.push(`Ticket ${i + 1} [${classTag}]`);
      lines.push(segmentRoute);
      if (segmentTimes) lines.push(segmentTimes);
      if (priceStr) lines.push(priceStr);
      lines.push('');
    });
    if (totalPrice != null && totalPrice > 0) {
      lines.push(
        `Total approx. fare: ~ ₹${Number(totalPrice).toLocaleString('en-IN')}`,
      );
      lines.push('');
    }
    lines.push('Book on IRCTC:', bookUrl);
    return lines.join('\n');
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
    >;
    result: Service2CheckResult;
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const { email, mobile, task, result } = params;
    const out = { emailSent: false, whatsappSent: false };
    if (!email?.trim() && !mobile?.trim()) {
      return out;
    }
    if (result.status !== 'success') {
      return out;
    }
    if (!hasBookablePlanForNotification(result)) {
      return out;
    }

    const trainLabel = [task.trainNumber, task.trainName]
      .filter(Boolean)
      .join(' ');
    const chartPreparationText = result.chartPreparationDetails
      ? `Chart preparation: ${result.chartPreparationDetails.firstChartCreationTime} at ${result.chartPreparationDetails.chartingStationCode}`
      : undefined;
    const stationScheduleList = result.trainSchedule?.stationList;
    const stationNameMap = this.getStationNameMap(stationScheduleList);
    const routeDisplay = `${task.fromStationCode} > ${task.toStationCode}`;
    const emailRouteDisplay = this.formatJourneyRoute(
      task.fromStationCode,
      task.toStationCode,
      stationNameMap,
    );
    const bookUrl = this.buildIrctcUrl({
      fromStationCode: task.fromStationCode,
      toStationCode: task.toStationCode,
      trainNumber: task.trainNumber,
      classCode: this.firstPlannedClassCode(result),
    });
    const plan = result.openAiBookingPlan ?? [];
    const totalPrice = result.openAiTotalPrice ?? undefined;

    const journeyDateStr =
      task.journeyDate instanceof Date
        ? task.journeyDate.toISOString().slice(0, 10)
        : String(task.journeyDate).slice(0, 10);
    const journeyDateReadable = formatJourneyDateReadable(journeyDateStr);
    const journeyTimesLine = formatSegmentScheduleTimes(
      stationScheduleList,
      task.fromStationCode,
      task.toStationCode,
    );

    if (mobile?.trim()) {
      const whatsAppText = this.buildWhatsAppSeatsFoundText({
        trainLabel,
        routeDisplay,
        journeyDateReadable,
        journeyTimesLine: journeyTimesLine || undefined,
        chartPreparationText,
        plan,
        totalPrice,
        stationNameMap,
        stationScheduleList,
        bookUrl,
      });
      out.whatsappSent = await this.sendWhatsApp(mobile.trim(), whatsAppText);
    }

    if (email?.trim()) {
      const subject = `Seats Available - Train ${task.trainNumber} on ${journeyDateReadable}`;
      const html = this.buildSeatsFoundEmailHtml({
        trainLabel,
        routeDisplay: emailRouteDisplay,
        journeyDateReadable,
        journeyTimesLine: journeyTimesLine || undefined,
        chartPreparationText,
        trainNumber: task.trainNumber,
        plan,
        totalPrice,
        stationNameMap,
        stationScheduleList,
      });
      out.emailSent = await this.sendEmail(email.trim(), subject, html);
    }
    return out;
  }
}
