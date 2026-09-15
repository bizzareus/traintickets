import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Optional,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from './availability.service';
import { JourneyTaskService } from './journey-task.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { isValidIndianMobile, isValidEmail } from '../common/validation.utils';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';

type NormalizedJourneyCreate = {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  stationCodesToMonitor?: string[];
  email?: string;
  mobile?: string;
  trainStartDate?: string;
  /**
   * Caller-pinned chart times (e.g. from the chart-times page). When present
   * and valid, task scheduling uses these instead of re-probing, and they
   * are written back to the chart-time cache.
   */
  chartTimeLocal?: string;
  chartOneDayOffset?: number;
  chartTwoTimeLocal?: string;
  chartTwoDayOffset?: number;
};

/** HH:MM (24h) or undefined when absent/invalid. */
function normalizeChartClock(value: unknown): string | undefined {
  const m = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function normalizeDayOffset(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

function normalizeJourneyCreateParams(
  trainNumber: string,
  trainName: string,
  fromStationCode: string,
  toStationCode: string,
  journeyDate: string,
  classCode: string,
  stationCodesToMonitor?: string[],
  email?: string,
  mobile?: string,
  trainStartDate?: string,
  chartTimeLocal?: string,
  chartOneDayOffset?: number,
  chartTwoTimeLocal?: string,
  chartTwoDayOffset?: number,
): NormalizedJourneyCreate {
  return {
    trainNumber: String(trainNumber ?? '').trim(),
    trainName: trainName ? String(trainName).trim() : undefined,
    fromStationCode: String(fromStationCode ?? '')
      .trim()
      .toUpperCase(),
    toStationCode: String(toStationCode ?? '')
      .trim()
      .toUpperCase(),
    journeyDate: String(journeyDate ?? '').trim(),
    classCode: String(classCode ?? '3A')
      .trim()
      .toUpperCase(),
    stationCodesToMonitor:
      Array.isArray(stationCodesToMonitor) && stationCodesToMonitor.length > 0
        ? stationCodesToMonitor.map((c) => String(c).trim().toUpperCase())
        : undefined,
    email: email ? String(email).trim() : undefined,
    mobile: mobile ? String(mobile).trim() : undefined,
    trainStartDate: trainStartDate ? String(trainStartDate).trim() : undefined,
    chartTimeLocal: normalizeChartClock(chartTimeLocal),
    chartOneDayOffset: normalizeDayOffset(chartOneDayOffset),
    chartTwoTimeLocal: normalizeChartClock(chartTwoTimeLocal),
    chartTwoDayOffset: normalizeDayOffset(chartTwoDayOffset),
  };
}

@Controller('api/availability')
export class AvailabilityController {
  constructor(
    private availability: AvailabilityService,
    private journeyTask: JourneyTaskService,
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private notification?: NotificationService,
  ) {}

  /**
   * Guards the paid chart-alert rollout: when REQUIRE_JOURNEY_PAYMENT=true,
   * direct alert creation requires a PAID chart_alert_payment ref whose
   * journey matches this request. Off by default so existing free surfaces
   * (PNR rescue, home panel, shortlinks) keep working until migrated.
   * A supplied paymentRef is always verified, even when the flag is off.
   */
  private async assertJourneyPayment(
    normalized: NormalizedJourneyCreate,
    paymentRef?: string,
  ): Promise<void> {
    const ref = String(paymentRef ?? '').trim();
    const required =
      String(this.config.get<string>('REQUIRE_JOURNEY_PAYMENT') ?? '')
        .trim()
        .toLowerCase() === 'true';
    if (!ref) {
      if (required) {
        throw new HttpException(
          'This alert requires payment. Please complete payment first.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      return;
    }
    const record = await this.prisma.chartAlertPayment.findUnique({
      where: { id: ref },
    });
    const payload = (record?.journeyPayload ?? null) as {
      trainNumber?: string;
      fromStationCode?: string;
      toStationCode?: string;
      journeyDate?: string;
      classCode?: string;
    } | null;
    const matches =
      record?.status === 'PAID' &&
      !!payload &&
      String(payload.trainNumber ?? '').trim() === normalized.trainNumber &&
      String(payload.fromStationCode ?? '')
        .trim()
        .toUpperCase() === normalized.fromStationCode &&
      String(payload.toStationCode ?? '')
        .trim()
        .toUpperCase() === normalized.toStationCode &&
      String(payload.journeyDate ?? '')
        .trim()
        .slice(0, 10) === normalized.journeyDate.slice(0, 10) &&
      String(payload.classCode ?? '')
        .trim()
        .toUpperCase() === normalized.classCode;
    if (!matches) {
      throw new HttpException(
        'Payment verification failed for this alert. Please complete payment first.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  @Post('check')
  async startCheck(
    @Body('trainNumber') trainNumber: string,
    @Body('trainName') trainName: string,
    @Body('stationCode') stationCode: string,
    @Body('fromStationName') fromStationName: string,
    @Body('toStationCode') toStationCode: string,
    @Body('toStationName') toStationName: string,
    @Body('classCode') classCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('passengerDetails') passengerDetails: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? '').trim(),
      trainName: String(trainName ?? '').trim(),
      stationCode: String(stationCode ?? '')
        .trim()
        .toUpperCase(),
      fromStationName: String(fromStationName ?? '').trim(),
      toStationCode:
        String(toStationCode ?? '')
          .trim()
          .toUpperCase() || undefined,
      toStationName: String(toStationName ?? '').trim(),
      classCode: String(classCode ?? '3A')
        .trim()
        .toUpperCase(),
      journeyDate: String(journeyDate ?? '').trim(),
      passengerDetails: passengerDetails
        ? String(passengerDetails).trim()
        : undefined,
    };
    if (
      !normalized.trainNumber ||
      !normalized.stationCode ||
      !normalized.journeyDate
    ) {
      return { error: 'trainNumber, stationCode and journeyDate are required' };
    }
    try {
      return await this.availability.startCheck(normalized);
    } catch {
      throw new ServiceUnavailableException(
        'Availability check service is temporarily unavailable. Please try again later.',
      );
    }
  }

  @Get('check/:jobId')
  async getCheck(@Param('jobId') jobId: string) {
    const check = await this.availability.getByJobId(jobId);
    if (!check) return { error: 'Not found', status: null };
    return {
      id: check.id,
      jobId: check.jobId,
      status: check.status,
      trainNumber: check.trainNumber,
      stationCode: check.stationCode,
      classCode: check.classCode,
      journeyDate: check.journeyDate?.toISOString?.()?.slice(0, 10),
      resultPayload: check.resultPayload,
      completedAt: check.completedAt?.toISOString?.() ?? null,
    };
  }

  /**
   * Poll this endpoint with the jobId returned from POST /check to get status and output.
   * When status is 'success' or 'failed', polling can stop.
   */
  @Get('job/:jobId/status')
  async getJobStatus(@Param('jobId') jobId: string) {
    try {
      return await this.availability.getJobStatus(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        output: null,
        resultPayload: { error: message },
      };
    }
  }

  /**
   * Get stations between from and to that have chart times (for monitor station selection).
   * Query: trainNumber, fromStationCode, toStationCode. Optional: journeyDate.
   */
  @Get('journey/stations')
  async getJourneyStations(
    @Query('trainNumber') trainNumber: string,
    @Query('fromStationCode') fromStationCode: string,
    @Query('toStationCode') toStationCode: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? '').trim(),
      fromStationCode: String(fromStationCode ?? '')
        .trim()
        .toUpperCase(),
      toStationCode: String(toStationCode ?? '')
        .trim()
        .toUpperCase(),
    };
    if (
      !normalized.trainNumber ||
      !normalized.fromStationCode ||
      !normalized.toStationCode
    ) {
      return {
        error: 'trainNumber, fromStationCode and toStationCode are required',
        stations: [],
      };
    }
    try {
      const stations =
        await this.journeyTask.getStationsWithChartTimesForRoute(normalized);
      return { stations };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(message);
    }
  }

  /**
   * Validate a journey monitoring request (schedule, run day, route). Does not write to the DB or call composition.
   */
  @Post('journey/validate')
  async validateJourney(
    @Body('trainNumber') trainNumber: string,
    @Body('trainName') trainName: string,
    @Body('fromStationCode') fromStationCode: string,
    @Body('toStationCode') toStationCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('classCode') classCode: string,
    @Body('stationCodesToMonitor') stationCodesToMonitor?: string[],
    @Body('trainStartDate') trainStartDate?: string,
  ) {
    const normalized = normalizeJourneyCreateParams(
      trainNumber,
      trainName,
      fromStationCode,
      toStationCode,
      journeyDate,
      classCode,
      stationCodesToMonitor,
      undefined,
      undefined,
      trainStartDate,
    );
    if (
      !normalized.trainNumber ||
      !normalized.fromStationCode ||
      !normalized.toStationCode ||
      !normalized.journeyDate
    ) {
      return {
        valid: false,
        errors: [
          {
            code: 'MISSING_FIELDS',
            message:
              'trainNumber, fromStationCode, toStationCode and journeyDate are required',
          },
        ],
      };
    }
    const result = await this.journeyTask.validateJourneyForMonitoring({
      trainNumber: normalized.trainNumber,
      fromStationCode: normalized.fromStationCode,
      toStationCode: normalized.toStationCode,
      journeyDate: normalized.journeyDate,
      trainStartDate: normalized.trainStartDate,
      stationCodesToMonitor: normalized.stationCodesToMonitor,
    });
    if (!result.valid) {
      return { valid: false, errors: result.errors };
    }
    return {
      valid: true,
      trainNumber: result.context.trainNumber,
      trainName: result.context.schedule.trainName,
      fromStationCode: result.context.fromCode,
      toStationCode: result.context.toCode,
      journeyDate: normalized.journeyDate,
      stationsToMonitorCount: result.context.stationsToProcess.length,
    };
  }

  /**
   * Accepts a journey monitoring request, validates basic fields synchronously, and executes
   * external validation, DB task creation, hydration, and immediate checks asynchronously in the background.
   * Returns HTTP 202 immediately.
   */
  @Post('journey')
  @HttpCode(HttpStatus.ACCEPTED)
  async createJourney(
    @Body('trainNumber') trainNumber: string,
    @Body('trainName') trainName: string,
    @Body('fromStationCode') fromStationCode: string,
    @Body('toStationCode') toStationCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('classCode') classCode: string,
    @Body('stationCodesToMonitor') stationCodesToMonitor?: string[],
    @Body('email') email?: string,
    @Body('mobile') mobile?: string,
    @Body('trainStartDate') trainStartDate?: string,
    @Body('paymentRef') paymentRef?: string,
    @Body('chartTimeLocal') chartTimeLocal?: string,
    @Body('chartOneDayOffset') chartOneDayOffset?: number,
    @Body('chartTwoTimeLocal') chartTwoTimeLocal?: string,
    @Body('chartTwoDayOffset') chartTwoDayOffset?: number,
  ) {
    const normalized = normalizeJourneyCreateParams(
      trainNumber,
      trainName,
      fromStationCode,
      toStationCode,
      journeyDate,
      classCode,
      stationCodesToMonitor,
      email,
      mobile,
      trainStartDate,
      chartTimeLocal,
      chartOneDayOffset,
      chartTwoTimeLocal,
      chartTwoDayOffset,
    );

    const errors: Array<{ code: string; message: string }> = [];

    if (!normalized.trainNumber) {
      errors.push({
        code: 'MISSING_FIELDS',
        message: 'trainNumber is required',
      });
    }
    if (!normalized.fromStationCode) {
      errors.push({
        code: 'MISSING_FIELDS',
        message: 'fromStationCode is required',
      });
    }
    // toStationCode is optional — an empty string means the user wants the
    // "no specific destination" chart-prepared alert (no IRCTC availability
    // check, just a short-link to the search page).
    if (
      normalized.toStationCode &&
      normalized.fromStationCode &&
      normalized.fromStationCode === normalized.toStationCode
    ) {
      errors.push({
        code: 'SAME_STATION',
        message: 'fromStationCode and toStationCode must be different',
      });
    }
    if (!normalized.journeyDate) {
      errors.push({
        code: 'MISSING_FIELDS',
        message: 'journeyDate is required',
      });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.journeyDate)) {
      errors.push({
        code: 'INVALID_JOURNEY_DATE',
        message: 'journeyDate must be in YYYY-MM-DD format',
      });
    }
    if (normalized.email && !isValidEmail(normalized.email)) {
      errors.push({
        code: 'INVALID_EMAIL',
        message: 'email format is invalid',
      });
    }
    if (normalized.mobile && !isValidIndianMobile(normalized.mobile)) {
      errors.push({
        code: 'INVALID_MOBILE',
        message:
          'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9',
      });
    }
    // Pinned chart times are optional, but when supplied they must be valid —
    // a malformed time would silently schedule the alert at the wrong moment.
    if (chartTimeLocal?.trim() && !normalized.chartTimeLocal) {
      errors.push({
        code: 'INVALID_CHART_TIME',
        message: 'chartTimeLocal must be in HH:MM 24-hour format',
      });
    }
    if (chartTwoTimeLocal?.trim() && !normalized.chartTwoTimeLocal) {
      errors.push({
        code: 'INVALID_CHART_TIME',
        message: 'chartTwoTimeLocal must be in HH:MM 24-hour format',
      });
    }
    for (const [raw, name] of [
      [chartOneDayOffset, 'chartOneDayOffset'],
      [chartTwoDayOffset, 'chartTwoDayOffset'],
    ] as Array<[unknown, string]>) {
      if (
        raw !== undefined &&
        raw !== null &&
        raw !== '' &&
        !Number.isInteger(Number(raw))
      ) {
        errors.push({
          code: 'INVALID_CHART_TIME',
          message: `${name} must be an integer day offset`,
        });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        valid: false,
        errors,
      });
    }

    await this.assertJourneyPayment(normalized, paymentRef);

    const journeyRequestId = randomUUID();

    // Empty toStationCode = the "no specific destination" flow: skip the
    // route/IRCTC check and queue a lightweight chart-prepared alert task.
    const isChartPreparedOnly = !normalized.toStationCode;
    setImmediate(() => {
      if (isChartPreparedOnly) {
        void this.journeyTask.queueChartPreparedMonitoring(
          normalized,
          journeyRequestId,
        );
      } else {
        void this.journeyTask.queueJourneyMonitoring(
          normalized,
          journeyRequestId,
        );
      }
    });

    return {
      accepted: true,
      status: 'queued',
      message:
        'Journey monitoring request has been received and is being processed in the background.',
      journeyRequestId,
    };
  }

  @Get('journey/:journeyRequestId')
  async getJourneyTasks(@Param('journeyRequestId') journeyRequestId: string) {
    const tasks =
      await this.journeyTask.getTasksByJourneyRequestId(journeyRequestId);
    if (!tasks.length) return { error: 'Not found', tasks: [] };
    return {
      journeyRequestId,
      tasks: tasks.map((t) => ({
        id: t.id,
        stationCode: t.stationCode,
        chartAt: t.chartAt.toISOString(),
        status: t.status,
        resultPayload: t.resultPayload,
        completedAt: t.completedAt?.toISOString?.() ?? null,
      })),
    };
  }

  @Get('admin/alerts')
  async getAllAlerts() {
    const alerts = await this.journeyTask.getAllAlerts();
    const journeyRequestIds = [...new Set(alerts.map((a) => a.journeyRequestId))];
    const payments = journeyRequestIds.length
      ? await this.prisma.chartAlertPayment.findMany({
          where: { journeyRequestId: { in: journeyRequestIds } },
          select: {
            id: true,
            amount: true,
            status: true,
            paidAt: true,
            journeyRequestId: true,
          },
        })
      : [];
    const paymentByJourney = new Map(
      payments.map((p) => [p.journeyRequestId as string, p]),
    );
    return {
      alerts: alerts.map((a) => {
        const payment = paymentByJourney.get(a.journeyRequestId) ?? null;
        return {
          id: a.id,
          journeyRequestId: a.journeyRequestId,
          trainNumber: a.trainNumber,
          trainName: a.trainName,
          fromStationCode: a.fromStationCode,
          toStationCode: a.toStationCode,
          stationCode: a.stationCode,
          journeyDate: a.journeyDate.toISOString().slice(0, 10),
          chartAt: a.chartAt.toISOString(),
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          completedAt: a.completedAt?.toISOString?.() ?? null,
          firstRunAt: a.firstRunAt?.toISOString?.() ?? null,
          emailNotifiedAt: a.emailNotifiedAt?.toISOString?.() ?? null,
          whatsappNotifiedAt: a.whatsappNotifiedAt?.toISOString?.() ?? null,
          contact: a.contact
            ? {
                email: a.contact.email,
                mobile: a.contact.mobile,
              }
            : null,
          payment: payment
            ? {
                ref: payment.id,
                amount: payment.amount,
                status: payment.status,
                paidAt: payment.paidAt?.toISOString?.() ?? null,
              }
            : null,
        };
      }),
    };
  }

  @Get('admin/notifications-analytics')
  async getNotificationsAnalytics(
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const validGroupBy =
      groupBy === 'week' || groupBy === 'month' ? groupBy : 'day';
    return this.journeyTask.getNotificationsAnalytics(
      validGroupBy,
      startDate,
      endDate,
    );
  }

  /** Recent chart-notification cron runs (per-tick log) for the admin viewer. */
  @Get('admin/cron-runs')
  async cronRuns(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const runs = await this.journeyTask.getRecentCronRuns({
      cronName: 'chart-notification',
      limit: limit ? Number.parseInt(limit, 10) : 120,
      status: status?.trim() || undefined,
    });
    return { runs };
  }

  @Post('admin/alerts/:id/trigger')
  async triggerAlert(@Param('id') id: string) {
    try {
      await this.journeyTask.runTask(id, true);
      return { success: true, message: 'Alert triggered successfully' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `Failed to trigger alert: ${message}`,
      );
    }
  }

  @Post('admin/alerts/:id/resend-notification')
  async resendNotification(@Param('id') id: string) {
    try {
      const res = await this.journeyTask.resendTaskNotification(id);
      return {
        success: res.sent,
        message: res.sent
          ? 'Notification resent successfully'
          : `Failed to resend notification: ${res.reason ?? 'Unknown reason'}`,
        status: res,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `Failed to resend notification: ${message}`,
      );
    }
  }

  @Get('admin/resend-failed-notifications')
  @Post('admin/resend-failed-notifications')
  async resendFailedNotifications(@Query('hours') hours?: string) {
    const hoursNum = hours ? Number.parseInt(hours, 10) : 24;
    return this.journeyTask.resendFailedWhatsAppNotifications(hoursNum);
  }

  @Post('tatkal-alert')
  @HttpCode(HttpStatus.OK)
  async subscribeTatkalAlert(
    @Body('email') email?: string,
    @Body('mobile') mobile?: string,
    @Body('category') category: 'AC' | 'NON_AC' = 'AC',
    @Body('journeyDate') journeyDate?: string,
    @Body('tatkalDate') tatkalDate?: string,
    @Body('tatkalTime') tatkalTime?: string,
    @Body('trainNumber') trainNumber?: string,
    @Body('trainName') trainName?: string,
    @Body('originOffsetDays') originOffsetDays?: number,
  ) {
    const em = email ? String(email).trim() : undefined;
    const mob = mobile ? String(mobile).trim() : undefined;

    if (!em && !mob) {
      throw new BadRequestException({
        code: 'MISSING_CONTACT',
        message:
          'Please provide either an email or mobile number to receive Tatkal alerts.',
      });
    }

    if (em && !isValidEmail(em)) {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',
        message: 'email format is invalid',
      });
    }

    if (mob && !isValidIndianMobile(mob)) {
      throw new BadRequestException({
        code: 'INVALID_MOBILE',
        message: 'mobile must be a valid 10-digit Indian number',
      });
    }

    if (!journeyDate || !/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
      throw new BadRequestException({
        code: 'INVALID_JOURNEY_DATE',
        message: 'Valid journeyDate (YYYY-MM-DD) is required.',
      });
    }

    const cleanCategory = category === 'NON_AC' ? 'NON_AC' : 'AC';
    const cleanTatkalTime =
      tatkalTime ||
      (cleanCategory === 'AC' ? '10:00:00 AM IST' : '11:00:00 AM IST');

    let displayTatkalDate = tatkalDate;
    if (!displayTatkalDate) {
      const [y, m, d] = journeyDate.split('-').map(Number);
      const offset = Number(originOffsetDays) || 0;
      const targetDate = new Date(Date.UTC(y, m - 1, d - offset - 1, 12, 0, 0));
      displayTatkalDate = targetDate.toISOString().slice(0, 10);
    }

    let notificationResult = { emailSent: false, whatsappSent: false };
    if (this.notification) {
      notificationResult = await this.notification.sendTatkalAlertConfirmation({
        email: em,
        mobile: mob,
        category: cleanCategory,
        journeyDate,
        tatkalDate: displayTatkalDate,
        tatkalTime: cleanTatkalTime,
        trainNumber: trainNumber ? String(trainNumber).trim() : undefined,
        trainName: trainName ? String(trainName).trim() : undefined,
        originOffsetDays: Number(originOffsetDays) || 0,
      });
    }

    return {
      success: true,
      message: `Tatkal alert confirmed for ${cleanCategory === 'AC' ? 'AC Classes' : 'Sleeper / 2S'} on ${displayTatkalDate} at ${cleanTatkalTime}.`,
      alert: {
        category: cleanCategory,
        journeyDate,
        tatkalDate: displayTatkalDate,
        tatkalTime: cleanTatkalTime,
        email: em,
        mobile: mob,
        trainNumber,
        trainName,
      },
      ...notificationResult,
    };
  }
}
