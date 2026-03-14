import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import axios from 'axios';
import type { Service2CheckResult } from '../service2/service2.service';
import type { ChartTimeAvailabilityTask } from '@prisma/client';

const WASENDER_BASE = 'https://www.wasenderapi.com';
const RESEND_FROM = 'LastBerth Notifications <notification@lastberth.com>';

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

  constructor(private config: ConfigService) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY');
    this.resendKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = this.resendKey ? new Resend(this.resendKey) : null;
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

  /** Build a short booking summary from the result for notifications. */
  private buildBookingSummary(result: Service2CheckResult): string {
    if (result.openAiSummary?.trim()) {
      return result.openAiSummary.trim();
    }
    const plan = result.openAiBookingPlan;
    if (plan?.length) {
      return plan.map((s) => s.instruction).join(' | ');
    }
    return 'Seats available. Check details on LastBerth.';
  }

  /** Build IRCTC redirect URL for from/to/train/class. */
  private buildIrctcUrl(task: {
    fromStationCode: string;
    toStationCode: string;
    trainNumber: string;
    classCode: string;
  }): string {
    const irctcClass = task.classCode.replace(/AC$/i, 'A');
    return `https://www.irctc.co.in/nget/redirect?${new URLSearchParams({
      origin: task.fromStationCode,
      destination: task.toStationCode,
      trainNo: task.trainNumber,
      class: irctcClass,
      quota: 'GN',
    }).toString()}`;
  }

  /** Build IRCTC URL for a segment from instruction "FROM - TO - CLASS". */
  private buildSegmentBookUrl(
    trainNumber: string,
    instruction: string,
  ): string {
    const parts = instruction.split(' - ').map((p) => p.trim());
    const origin = parts[0] ?? '';
    const destination = parts[1] ?? '';
    const classCode = (parts[2] ?? '3A').replace(/AC$/i, 'A');
    if (!origin || !destination) {
      return 'https://www.irctc.co.in/eticketing/login';
    }
    return `https://www.irctc.co.in/nget/redirect?${new URLSearchParams({
      origin,
      destination,
      trainNo: trainNumber,
      class: classCode,
      quota: 'GN',
    }).toString()}`;
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

  /** Build HTML email body matching booking UI: train header, route with >, chart prep, ticket cards, total right-aligned. */
  private buildSeatsFoundEmailHtml(params: {
    trainLabel: string;
    routeDisplay: string;
    chartPreparationText?: string;
    bookUrl: string;
    trainNumber: string;
    plan: { instruction: string; approx_price: number }[];
    totalPrice?: number;
    stationNameMap: Map<string, string>;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      chartPreparationText,
      bookUrl,
      trainNumber,
      plan,
      totalPrice,
      stationNameMap,
    } = params;

    const cardRows =
      plan.length > 0
        ? plan
            .map((seg, i) => {
              const segUrl = this.buildSegmentBookUrl(
                trainNumber,
                seg.instruction,
              );
              const segmentRoute = this.formatSegmentRoute(
                seg.instruction,
                stationNameMap,
              );
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
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">${segmentRoute}</p>
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
              <p style="margin:0; font-size:20px; font-weight:700; color:#0f172a;">${trainLabel}</p>
              <p style="margin:8px 0 0 0; font-size:14px; color:#64748b;">${routeDisplay}</p>
              ${chartPrepLine}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${cardRows}
              </table>
              ${totalRow}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${bookUrl}" style="display:inline-block; padding:14px 28px; border-radius:12px; background:#22c55e; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none;">Book on IRCTC</a>
                  </td>
                </tr>
              </table>
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
    chartPreparationText?: string;
    plan: { instruction: string; approx_price: number }[];
    totalPrice?: number;
    stationNameMap: Map<string, string>;
    bookUrl: string;
  }): string {
    const {
      trainLabel,
      routeDisplay,
      chartPreparationText,
      plan,
      totalPrice,
      stationNameMap,
      bookUrl,
    } = params;
    const lines: string[] = [
      trainLabel,
      routeDisplay,
      ...(chartPreparationText ? [chartPreparationText] : []),
      '',
    ];
    plan.forEach((seg, i) => {
      const segmentRoute = this.formatSegmentRoute(
        seg.instruction,
        stationNameMap,
      );
      const classTag = (seg.instruction.split(' - ')[2] ?? '3A').trim();
      const priceStr =
        seg.approx_price != null
          ? `approx ₹${Number(seg.approx_price).toLocaleString('en-IN')}`
          : '';
      lines.push(`Ticket ${i + 1} [${classTag}]`);
      lines.push(segmentRoute);
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
      | 'classCode'
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

    const trainLabel = [task.trainNumber, task.trainName]
      .filter(Boolean)
      .join(' ');
    const routeDisplay = `${task.fromStationCode} > ${task.toStationCode}`;
    const chartPreparationText = result.chartPreparationDetails
      ? `Chart preparation: ${result.chartPreparationDetails.firstChartCreationTime} at ${result.chartPreparationDetails.chartingStationCode}`
      : undefined;
    const stationNameMap = this.getStationNameMap(
      result.trainSchedule?.stationList as
        | Array<{ stationCode?: string; stationName?: string }>
        | undefined,
    );
    const bookUrl = this.buildIrctcUrl({
      fromStationCode: task.fromStationCode,
      toStationCode: task.toStationCode,
      trainNumber: task.trainNumber,
      classCode: task.classCode,
    });
    const plan = result.openAiBookingPlan ?? [];
    const totalPrice = result.openAiTotalPrice ?? undefined;

    if (mobile?.trim()) {
      const whatsAppText = this.buildWhatsAppSeatsFoundText({
        trainLabel,
        routeDisplay,
        chartPreparationText,
        plan,
        totalPrice,
        stationNameMap,
        bookUrl,
      });
      out.whatsappSent = await this.sendWhatsApp(mobile.trim(), whatsAppText);
    }

    if (email?.trim()) {
      const journeyDate =
        task.journeyDate instanceof Date
          ? task.journeyDate.toISOString().slice(0, 10)
          : String(task.journeyDate).slice(0, 10);
      const subject = `Seats Available - Train ${task.trainNumber} on ${journeyDate}`;
      const html = this.buildSeatsFoundEmailHtml({
        trainLabel,
        routeDisplay,
        chartPreparationText,
        bookUrl,
        trainNumber: task.trainNumber,
        plan,
        totalPrice,
        stationNameMap,
      });
      out.emailSent = await this.sendEmail(email.trim(), subject, html);
    }
    return out;
  }
}
