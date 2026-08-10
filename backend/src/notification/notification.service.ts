import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import axios from 'axios';
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
import {
  formatJourneyDateReadable,
  formatSegmentScheduleTimes,
  hasBookablePlanForNotification,
} from './notification.helpers';
import type { BestTrainCandidateResult } from '../booking-v2/booking-v2.service';

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
export function toE164(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('6') === false) {
    return `91${digits}`;
  }
  if (digits.length >= 10 && digits.startsWith('91')) {
    return digits;
  }
  return digits || mobile;
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
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
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
  ) {
    this.wasenderKey = this.config.get<string>('WASENDER_API_KEY');
    this.resendKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = this.resendKey ? new Resend(this.resendKey) : null;
    this.monitoringAdminEmail =
      this.config.get<string>('MONITORING_ADMIN_EMAIL')?.trim() ||
      DEFAULT_MONITORING_ADMIN_EMAIL;
  }

  async sendWhatsApp(mobile: string, message: string): Promise<boolean> {
    console.info('whatsapp service was called');
    if (!this.wasenderKey?.trim()) {
      return false;
    }
    const to = toE164(mobile);
    try {
      console.info('sending whatsapp message', { message, to });
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
    console.info('email service was called');
    if (!this.resend) {
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

  private async getStationChartOpenTimeLabel(params: {
    trainNumber: string;
    stationCode: string;
    stationName?: string;
    journeyDateStr: string;
    result?: Service2CheckResult;
  }): Promise<{ label: string; isReleased: boolean }> {
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
      label: 'New tickets open around chart preparation time',
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
        );
        const parts = item.instruction.split(' - ').map((p) => p.trim());
        const segFrom = parts[0] ?? '';
        const segTo = parts[1] ?? '';
        const segmentTimes =
          segFrom && segTo
            ? formatSegmentScheduleTimes(stationScheduleList, segFrom, segTo)
            : '';
        const classTag = (item.instruction.split(' - ')[2] ?? '3A').trim();
        const priceStr =
          item.approxPrice != null
            ? `₹${Number(item.approxPrice).toLocaleString('en-IN')}`
            : '';
        return `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; border:1px solid #86efac; background:#e6ffe6; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">Ticket ${item.ticketIndex}
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
      } else {
        const fromName =
          stationNameMap.get(item.fromCode.trim().toUpperCase()) ??
          item.fromCode;
        const toName =
          stationNameMap.get(item.toCode.trim().toUpperCase()) ?? item.toCode;
        const segDisplay = `${item.fromCode} - ${fromName} → ${item.toCode} - ${toName}`;

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
            <p style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#b45309;">No tickets available</p>
            <p style="margin:0 0 8px 0; font-size:14px; font-weight:500; color:#1e293b;">${escapeHtml(segDisplay)}</p>
            <p style="margin:0 0 12px 0; font-size:13px; font-weight:600; color:#4338ca;">${escapeHtml(chartOpenInfo.label)}</p>
            ${actionButtonHtml}
          </td>
        </tr>
      </table>
    </td></tr>`;
      }
    });

    const cardRows = (await Promise.all(cardRowPromises)).join('');

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
              <div style="margin-top:20px; padding:12px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; text-align:center;">
                <p style="margin:0; font-size:13px; color:#475569;">
                  💡 <strong>Tip:</strong> Look for the realtime seat status on LastBerth to track vacant seats around you.
                </p>
              </div>
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
        );
        const parts = item.instruction.split(' - ').map((p) => p.trim());
        const segFrom = parts[0] ?? '';
        const segTo = parts[1] ?? '';
        const segmentTimes =
          segFrom && segTo
            ? formatSegmentScheduleTimes(stationScheduleList, segFrom, segTo)
            : '';
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
        if (segmentTimes) lines.push(segmentTimes);
        if (priceStr) lines.push(priceStr);
        lines.push(`Book on IRCTC: ${segBookUrl}`);
        lines.push('');
      } else {
        const fromName =
          stationNameMap.get(item.fromCode.trim().toUpperCase()) ??
          item.fromCode;
        const toName =
          stationNameMap.get(item.toCode.trim().toUpperCase()) ?? item.toCode;
        const segDisplay = `${item.fromCode} - ${fromName} → ${item.toCode} - ${toName}`;

        const chartOpenInfo = await this.getStationChartOpenTimeLabel({
          trainNumber,
          stationCode: item.fromCode,
          stationName: fromName,
          journeyDateStr,
          result,
        });

        lines.push(`No tickets available:`);
        lines.push(segDisplay);
        lines.push(chartOpenInfo.label);

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

    let alternativesHtml = '';
    if (alternativeTrains && alternativeTrains.length > 0) {
      const trainCards = alternativeTrains
        .map((alt) => {
          const train = alt.train;
          const trainNameStr = [train.trainNumber, train.trainName]
            .filter(Boolean)
            .join(' - ');

          // Find best segment from alternatePath
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

          return `
        <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
          <p style="margin:0;font-weight:600;font-size:15px;color:#1e293b;">${escapeHtml(trainNameStr)}</p>
          ${bestLegStr}
        </div>`;
        })
        .join('');

      alternativesHtml = `
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
        <h3 style="margin:0 0 12px 0;font-size:16px;color:#0f172a;">Alternative Trains Available:</h3>
        ${trainCards}
      </div>`;
    }

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">No Tickets Found 😔</h2>
    <p style="margin:0 0 12px 0;">We tried our best to find tickets for your journey:</p>
    <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;">
      <p style="margin:0;font-weight:600;">${escapeHtml(trainLabel)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(routeDisplay)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(journeyDateReadable)}</p>
    </div>
    <p style="margin:0 0 16px 0;color:#b91c1c;">${escapeHtml(openAiSummary || "Unfortunately, we couldn't find any available tickets at this time.")}</p>
    ${alternativesHtml}
    <p style="margin:16px 0 16px 0;">You can try checking on LastBerth for other trains:</p>
    <a href="https://lastberth.com/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">Search on LastBerth</a>
    <div style="margin-top:20px; padding:12px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; text-align:center;">
      <p style="margin:0; font-size:13px; color:#475569;">
        💡 <strong>Tip:</strong> Look for the realtime seat status on LastBerth to track vacant seats around you.
      </p>
    </div>
  </div>
  <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.</p>
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

    let alternativesText = '';
    if (alternativeTrains && alternativeTrains.length > 0) {
      const trainLines = alternativeTrains
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
          return `${i + 1}. ${trainNameStr}${bestLegStr}`;
        })
        .join('\n\n');

      alternativesText = `\n\nAlternative Trains Available:\n${trainLines}`;
    }

    return `*LastBerth Chart Alert* 🔔
You subscribed to an alert when chart is prepared:

No Tickets Found 😔

Train: ${trainLabel}
Route: ${routeDisplay}
Date: ${journeyDateReadable}

${openAiSummary || "We tried our best but couldn't find any available tickets at this time."}${alternativesText}

You can try checking on LastBerth for other trains:
https://lastberth.com/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`;
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
    >;
    result: Service2CheckResult;
    alternativeTrains?: BestTrainCandidateResult[];
  }): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const { email, mobile, task, result, alternativeTrains } = params;
    const out = { emailSent: false, whatsappSent: false };
    if (!email?.trim() && !mobile?.trim()) {
      return out;
    }
    if (result.status !== 'success') {
      return out;
    }
    const hasTickets = hasBookablePlanForNotification(result);

    const trainLabel = [task.trainNumber, task.trainName]
      .filter(Boolean)
      .join(' ');
    const chartPreparationText = result.chartPreparationDetails
      ? `Chart preparation: ${result.chartPreparationDetails.firstChartCreationTime} at ${result.chartPreparationDetails.chartingStationCode}`
      : undefined;
    const stationScheduleList = result.trainSchedule?.stationList;
    const stationNameMap = this.getStationNameMap(stationScheduleList);
    const plan = result.openAiBookingPlan ?? [];
    // This alert path often has no train schedule, leaving the name map empty so
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

    // This alert path often has no train schedule, leaving the name map empty so
    // labels render as bare codes ("YA - YA"). Enrich it with full station names
    // from the seeded station cache for the OD and every planned segment endpoint.
    await this.enrichStationNames(stationNameMap, [
      task.fromStationCode,
      task.toStationCode,
      ...coverage.flatMap((c) => [c.fromCode, c.toCode]),
      ...plan.flatMap((p) =>
        String(p?.instruction ?? '')
          .split(' - ')
          .slice(0, 2),
      ),
    ]);
    const routeDisplay = `${task.fromStationCode} > ${task.toStationCode}`;
    const emailRouteDisplay = this.formatJourneyRoute(
      task.fromStationCode,
      task.toStationCode,
      stationNameMap,
    );
    const totalPrice = result.openAiTotalPrice ?? undefined;

    const journeyDateReadable = formatJourneyDateReadable(journeyDateStr);
    const journeyTimesLine = formatSegmentScheduleTimes(
      stationScheduleList,
      task.fromStationCode,
      task.toStationCode,
    );

    if (mobile?.trim()) {
      const whatsAppText = hasTickets
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
          });

      out.whatsappSent = await this.sendWhatsApp(mobile.trim(), whatsAppText);
    }

    if (email?.trim()) {
      const subject = hasTickets
        ? `Seats Available - Train ${task.trainNumber} on ${journeyDateReadable}`
        : `No Tickets Found - Train ${task.trainNumber} on ${journeyDateReadable}`;
      const html = hasTickets
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
          });
      out.emailSent = await this.sendEmail(email.trim(), subject, html);
    }
    return out;
  }
}
