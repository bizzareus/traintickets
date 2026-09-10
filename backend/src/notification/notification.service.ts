import { Injectable, Optional, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  isFilledOpenAiPlanItem,
  type Service2CheckResult,
} from '../service2/service2.service';
import type { ChartTimeAvailabilityTask } from '@prisma/client';
import { StationCacheService } from '../cache/station-cache.service';
import { ShortLinkService } from '../short-link/short-link.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { WasenderProvider } from './whatsapp-providers/wasender.provider';
import { WatiProvider } from './whatsapp-providers/wati.provider';
import { WhatsAppProviderFactory } from './whatsapp-providers/whatsapp.provider-factory';
import type { SendWhatsAppPayload } from './whatsapp-providers/whatsapp-provider.interface';
import {
  escapeHtml,
  formatChartTimeIst,
  firstPlannedClassCode,
  formatJourneyRoute,
  getStationNameMap,
  extractJourneyLegCoverage,
  hasBookablePlanForNotification,
  normalizeE164Mobile,
  formatJourneyDateReadable,
  formatSegmentScheduleTimes,
  type JourneyLegCoverage,
} from './notification.helpers';
import {
  renderSeatsFoundEmailHtml,
  renderFollowUpLegEmailHtml,
  renderNoSeatsEmailHtml,
  renderAlternativeTrainsEmailHtml,
  renderChartPreparedNoDestinationEmailHtml,
  renderAlertFailureEmailHtml,
  renderAdminMonitoringEmailHtml,
  renderTatkalAlertEmailHtml,
  buildTatkalAlertWhatsAppText,
  buildChartPreparedNoDestinationWhatsAppText,
  buildWhatsAppSeatsFoundText,
  buildFollowUpLegWhatsAppText,
  buildNoSeatsWhatsAppText,
  buildAlternativeTrainsWhatsAppText,
} from './templates';
import type { BestTrainCandidateResult } from '../booking-v2/booking-v2.service';

import { NotificationDeduplicationService } from './notification-deduplication.service';
import { NotificationUnsubscribeService } from './notification-unsubscribe.service';

const RESEND_FROM = 'LastBerth Notifications <notification@lastberth.com>';
const DEFAULT_MONITORING_ADMIN_EMAIL = 'me@kartikarora.in';

/** Normalize mobile to E.164 for WaSender (e.g. 919876543210). */
export function toE164(mobile: string): string {
  return normalizeE164Mobile(mobile);
}

export type { JourneyLegCoverage };

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
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
      const message = buildTatkalAlertWhatsAppText({
        trainNumber: params.trainNumber,
        trainName: params.trainName,
        tatkalDate: params.tatkalDate,
        tatkalTime: params.tatkalTime,
        journeyDate: params.journeyDate,
        freezeWindow,
      });

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
    const routeLabel = [params.fromStationCode, params.toStationCode]
      .filter(Boolean)
      .join(' → ');

    const subject = `[ALERT FAILURE] ${params.alertType} failed${
      params.trainNumber ? ` for Train ${params.trainNumber}` : ''
    }${routeLabel ? ` (${routeLabel})` : ''}`;

    const html = renderAlertFailureEmailHtml(params);

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

    const subject = `[LastBerth] Monitoring requested — ${params.trainNumber} (${params.journeyDate})`;
    const html = renderAdminMonitoringEmailHtml(params);
    return this.sendEmail(to, subject, html);
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
                : `Chart prepares at ${formatted.formattedTime}`,
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
            : `Chart prepares at ${formatted.formattedTime}`,
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
            : `Chart prepares at ${formatted.formattedTime}`,
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
    plan: Array<{ instruction: string; approx_price?: number; availability?: string }>;
    stationScheduleList?: any[];
  }): JourneyLegCoverage[] {
    return extractJourneyLegCoverage(params as any);
  }

  /**
   * Build a tracked short link to /unsubscribe?r=<recipient>.
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
   * Build a tracked short-link to the search page pre-filled with the train + journey date.
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

  /**
   * Fill in full station names for any `codes` the map is missing, from the
   * seeded station cache. Best-effort.
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
        this.logger.log(
          `[notification] Leg update notifications disabled; skipping for train ${task.trainNumber}`,
        );
        return out;
      }
      const hasTickets = hasBookablePlanForNotification(result);

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
      const stationNameMap = getStationNameMap(stationScheduleList);
      const plan = (result.openAiBookingPlan ?? []).filter(
        isFilledOpenAiPlanItem,
      );
      const journeyDateStr =
        task.journeyDate instanceof Date
          ? task.journeyDate.toISOString().slice(0, 10)
          : String(task.journeyDate).slice(0, 10);

      const coverage = extractJourneyLegCoverage({
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
      const emailRouteDisplay = formatJourneyRoute(
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
              ? buildFollowUpLegWhatsAppText({
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
                ? await buildWhatsAppSeatsFoundText({
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
                    getChartOpenInfoFn: (item) =>
                      this.getStationChartOpenTimeLabel({
                        trainNumber: task.trainNumber,
                        stationCode: item.fromCode,
                        stationName: item.fromName,
                        journeyDateStr,
                        result,
                      }),
                    createAlertShortLinkFn: (p) =>
                      this.shortLinkService
                        ? this.shortLinkService.createAlertShortLink(p)
                        : Promise.reject(),
                  })
                : buildNoSeatsWhatsAppText({
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

          let html: string;
          if (isFollowUpLeg && hasTickets) {
            html = renderFollowUpLegEmailHtml({
              trainLabel,
              routeDisplay: emailRouteDisplay,
              journeyDateReadable,
              plan,
              stationNameMap,
              stationScheduleList,
              trainNumber: task.trainNumber,
              chartPreparationText,
              unsubscribeUrl: emailFooterUrl,
            });
          } else if (hasTickets) {
            const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
            const cardRowPromises = coverage.map(async (item) => {
              if (item.type === 'ticket') {
                const segUrl = buildSegmentBookUrl(
                  task.trainNumber,
                  item.instruction,
                );
                const segmentRoute = formatSegmentRoute(
                  item.instruction,
                  stationNameMap,
                  stationScheduleList,
                );
                const classTag = (
                  item.instruction.split(' - ')[2] ?? '3A'
                ).trim();
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
                  stationNameMap.get(item.toCode.trim().toUpperCase()) ??
                  item.toCode;
                const fromRow = findScheduleRow(
                  stationScheduleList,
                  item.fromCode,
                );
                const toRow = findScheduleRow(
                  stationScheduleList,
                  item.toCode,
                );
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
                  trainNumber: task.trainNumber,
                  stationCode: item.fromCode,
                  stationName: fromName,
                  journeyDateStr,
                  result,
                });

                let actionButtonHtml = '';
                if (chartOpenInfo.isReleased) {
                  const alternateClassUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}&trainNo=${encodeURIComponent(task.trainNumber)}`;
                  actionButtonHtml = `<a href="${alternateClassUrl}" style="display:inline-block; padding:10px 20px; border-radius:8px; background:#2563eb; color:#fff; font-size:13px; font-weight:600; text-decoration:none;">Check Alternate Class Tickets</a>`;
                } else {
                  let alertUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}`;
                  if (this.shortLinkService) {
                    try {
                      alertUrl = await this.shortLinkService.createAlertShortLink({
                        trainNumber: task.trainNumber,
                        trainName: result?.trainSchedule?.trainName,
                        fromStationCode: item.fromCode,
                        toStationCode: item.toCode,
                        journeyDate: journeyDateStr,
                        classCode: firstPlannedClassCode(result),
                        email: email || undefined,
                        mobile: mobile || undefined,
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

            html = renderSeatsFoundEmailHtml({
              cardRowsHtml: cardRows,
              totalPrice,
              trainLabel,
              routeDisplay: emailRouteDisplay,
              journeyDateReadable,
              journeyTimesLine,
              chartPreparationText,
              partialJourneyNotice,
              unsubscribeUrl: emailFooterUrl,
            });
          } else {
            html = renderNoSeatsEmailHtml({
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
          }

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
      if (this.unsubscribeService) {
        if (email && (await this.unsubscribeService.isUnsubscribed(email))) {
          return out;
        }
        if (mobile && (await this.unsubscribeService.isUnsubscribed(mobile))) {
          return out;
        }
      }

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
          const whatsAppText = buildAlternativeTrainsWhatsAppText({
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
          const html = renderAlternativeTrainsEmailHtml({
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
}
