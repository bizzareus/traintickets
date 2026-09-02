import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ChartTimeAvailabilityTask } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import {
  IrctcService,
  to5DigitTrainNo,
  type TrainScheduleResponse,
} from '../irctc/irctc.service';
import { TrainCompositionService } from '../train-composition/train-composition.service';
import {
  Service2Service,
  type Service2CheckResult,
  type OpenAiBookingPlanItem,
  type OpenAIStructuredSeat,
} from '../service2/service2.service';
import {
  NotificationService,
  toE164,
  type JourneyLegCoverage,
} from '../notification/notification.service';
import { toIstYmd } from '../common/date.utils';
import { isPrismaUniqueViolation } from '../common/prisma-errors';
import { AlternativeSearchTaskService } from './alternative-search-task.service';
import {
  BookingV2Service,
  type FindAlternatePathsResult,
} from '../booking-v2/booking-v2.service';
import { DateTime } from 'luxon';
import {
  getTrainDoesNotRunOnDateError,
  parseJourneyYmdForValidation,
} from '../common/train-run-day.validation';
import { hasBookablePlanForNotification } from '../notification/notification.helpers';
import type { BestTrainCandidateResult } from '../booking-v2/booking-v2.service';

const MAX_CHART_TASK_ATTEMPTS = 3;

export type JourneyValidationError = {
  code: string;
  message: string;
  runningDayNames?: string[];
  nextRunDate?: string | null;
  nextRunDayAndDate?: string | null;
  requestedJourneyDate?: string;
};

export type JourneyValidContext = {
  schedule: TrainScheduleResponse;
  fromCode: string;
  toCode: string;
  trainNumber: string;
  stationsToProcess: string[];
  jYmd: string;
  trainStartDate: string;
};

export type JourneyValidationResult =
  | { valid: true; context: JourneyValidContext }
  | { valid: false; errors: JourneyValidationError[] };

/**
 * Builds chartAt for journeyDate + dayOffset days + HH:MM (for chart two).
 * Aligns with Asia/Kolkata (IST).
 */
function buildChartAtWithDayOffset(
  journeyDate: Date,
  chartTimeLocal: string,
  dayOffset: number,
): Date {
  const jStr = DateTime.fromJSDate(journeyDate)
    .setZone('Asia/Kolkata')
    .plus({ days: dayOffset })
    .toFormat('yyyy-MM-dd');
  const [h, min] = chartTimeLocal.split(':').map(Number);
  return DateTime.fromFormat(`${jStr} ${h}:${min}`, 'yyyy-MM-dd H:m', {
    zone: 'Asia/Kolkata',
  }).toJSDate();
}

function stationDayCount(station: unknown): number {
  if (station == null || typeof station !== 'object') return 1;
  const dayCount = (station as { dayCount?: unknown }).dayCount;
  if (typeof dayCount === 'number' && Number.isFinite(dayCount)) {
    return dayCount;
  }
  if (typeof dayCount === 'string') {
    const parsed = parseInt(dayCount.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  }
  return 1;
}

function isRetryableRailFailureText(text: string): boolean {
  return /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|network|temporarily unavailable|unable to contact rail systems|IRCTC schedule service unavailable|Availability request fail/i.test(
    text,
  );
}

function retryDelayMsForAttempt(attemptNumber: number): number {
  return attemptNumber <= 1 ? 5 * 60_000 : 15 * 60_000;
}

function chartTaskFailureText(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (payload instanceof Error) return payload.message;
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable failure payload]';
  }
}

function isRetryableChartTaskFailure(payload: unknown): boolean {
  return isRetryableRailFailureText(chartTaskFailureText(payload));
}

function isTaskChartTimePassed(task: ChartTimeAvailabilityTask): boolean {
  const now = new Date();

  if (task.chartAt && now.getTime() >= task.chartAt.getTime()) {
    return true;
  }

  if (task.nextRunAt && now.getTime() >= task.nextRunAt.getTime()) {
    return true;
  }

  const todayIstStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(now);
  const journeyDateStr = toIstYmd(task.journeyDate);

  return journeyDateStr < todayIstStr;
}

/**
 * Map a Search-Route alternate-paths result onto the Service2CheckResult shape the
 * alert task and notification already consume, so the seat alert can run on the
 * same engine the homepage uses (ConfirmTkt availability + IRCTC schedule) instead
 * of an OpenAI call. Confirmed legs become the booking plan (one filled slot per
 * route leg, `{}` for a non-bookable hop).
 */
function alternatePathsToCheckResult(
  alt: FindAlternatePathsResult,
  options?: {
    isChartTimePassed?: boolean;
  },
): Service2CheckResult {
  const confirmedLegs = alt.legs.filter((l) => l.segmentKind === 'confirmed');

  if (confirmedLegs.length === 0) {
    const hasProbeFailures = alt.debugLog?.some((line) =>
      /Availability request fail/i.test(line),
    );

    if (hasProbeFailures) {
      return {
        status: 'failed',
        vacantBerth: { vbd: [], error: null },
        chartStatus: {
          kind: 'chart_error',
          error: 'Availability API request failed for route probes',
        },
        debugLog: alt.debugLog,
      };
    }

    if (options?.isChartTimePassed) {
      return {
        status: 'success',
        vacantBerth: { vbd: [], error: null },
        chartStatus: {
          kind: 'chart_prepared_no_vacant_berths',
          message: 'Chart is prepared, but no confirmed seats are available.',
        },
        debugLog: alt.debugLog,
      };
    }

    return {
      status: 'failed',
      vacantBerth: { vbd: [], error: null },
      chartStatus: ((alt as Record<string, unknown>).chartStatus as
        | Service2CheckResult['chartStatus']
        | undefined) ?? {
        kind: 'not_prepared_yet' as const,
        message: 'Confirmed seats not available yet',
      },
      debugLog: alt.debugLog,
    };
  }

  const plan: OpenAiBookingPlanItem[] = alt.legs.map((l) =>
    l.segmentKind === 'confirmed'
      ? {
          instruction: `${l.from} - ${l.to} - ${l.travelClass ?? ''}`.trim(),
          approx_price: l.fare ?? 0,
          availability:
            l.availabilityDisplayName ||
            l.railDataStatus ||
            l.availablityStatus ||
            undefined,
        }
      : ({} as OpenAiBookingPlanItem),
  );

  const seats: OpenAIStructuredSeat[] = confirmedLegs.map((l) => ({
    coach: '',
    berth: '',
    class: l.travelClass ?? '',
    seat: '',
    from: l.from,
    to: l.to,
  }));

  const fullyConfirmed =
    alt.isComplete && alt.legs.every((l) => l.segmentKind === 'confirmed');
  const summary = fullyConfirmed
    ? 'Confirmed seats are available for your full journey. Book now.'
    : 'Confirmed seats are available for part of your journey. Book the confirmed legs below.';

  return {
    status: 'success',
    vacantBerth: { vbd: [], error: null },
    openAiSummary: summary,
    openAiStructuredSeats: seats,
    openAiBookingPlan: plan,
    openAiTotalPrice: alt.totalFare ?? undefined,
    debugLog: alt.debugLog,
  };
}

/** Per-task outcome captured after a cron run, for CronRunLog output. */
export type RunDueTaskResult = {
  taskId: string;
  trainNumber: string;
  from: string;
  to: string;
  journeyDate: string | null;
  status: string;
  retryCount: number;
  lastError: string | null;
};

/** What one `runDueTasks()` invocation processed — the run's input + output. */
export type RunDueTasksResult = {
  istNow: string;
  claimedTaskIds: string[];
  tasksRun: number;
  results: RunDueTaskResult[];
};

@Injectable()
export class JourneyTaskService {
  private readonly logger = new Logger(JourneyTaskService.name);

  constructor(
    private prisma: PrismaService,
    private chartTime: ChartTimeService,
    private irctc: IrctcService,
    private trainComposition: TrainCompositionService,
    private service2: Service2Service,
    private notificationService: NotificationService,
    private bookingV2Service: BookingV2Service,
    @Optional()
    private alternativeSearchTaskService?: AlternativeSearchTaskService,
  ) {}

  /**
   * Validates journey monitoring request (schedule, run day, route, optional station filter).
   * On success returns schedule + resolved route segment so callers avoid a second schedule fetch.
   */
  async validateJourneyForMonitoring(params: {
    trainNumber: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    trainStartDate?: string;
    stationCodesToMonitor?: string[];
  }): Promise<JourneyValidationResult> {
    const jYmd = parseJourneyYmdForValidation(params.journeyDate);
    const startYmd = params.trainStartDate
      ? parseJourneyYmdForValidation(params.trainStartDate)
      : null;

    console.log('jYmd', jYmd, 'trainStartDate', startYmd);
    if (!jYmd) {
      return {
        valid: false,
        errors: [
          {
            code: 'INVALID_JOURNEY_DATE',
            message: 'Journey date must be a valid YYYY-MM-DD.',
          },
        ],
      };
    }

    const fromCode = params.fromStationCode.trim().toUpperCase();
    const toCode = params.toStationCode.trim().toUpperCase();
    const trainNumber = params.trainNumber.trim();

    const scheduleResult = await this.irctc.getTrainSchedule(trainNumber, {
      fillRunsOnFromComposition: {
        jDate: jYmd,
        boardingStation: fromCode,
      },
    });
    if (!scheduleResult.ok) {
      if (scheduleResult.reason === 'maintenance') {
        return {
          valid: false,
          errors: [
            {
              code: 'IRCTC_MAINTENANCE',
              message:
                'IRCTC is temporarily unavailable (maintenance or downtime). Please try again later.',
            },
          ],
        };
      }
      return {
        valid: false,
        errors: [
          {
            code: 'SCHEDULE_UNAVAILABLE',
            message:
              'Train schedule not found. Please try again after the route is loaded.',
          },
        ],
      };
    }

    const schedule = scheduleResult.schedule;
    if (!schedule.stationList?.length) {
      return {
        valid: false,
        errors: [
          {
            code: 'SCHEDULE_UNAVAILABLE',
            message:
              'Train schedule not found. Please try again after the route is loaded.',
          },
        ],
      };
    }

    const boardingStn = schedule.stationList.find(
      (s) => s.stationCode === fromCode,
    );
    const dayCount = stationDayCount(boardingStn);
    let resolvedTrainStartDate = startYmd;
    let resolvedBoardingDate = jYmd;

    if (resolvedTrainStartDate && dayCount > 1) {
      if (jYmd === resolvedTrainStartDate) {
        const computedBoardingDate = DateTime.fromISO(resolvedTrainStartDate)
          .plus({ days: dayCount - 1 })
          .toISODate();
        if (computedBoardingDate) {
          resolvedBoardingDate = computedBoardingDate;
        }
      }
    } else if (!resolvedTrainStartDate && jYmd) {
      if (dayCount > 1) {
        const boardDate = DateTime.fromISO(jYmd);
        resolvedTrainStartDate = boardDate
          .minus({ days: dayCount - 1 })
          .toISODate();
      } else {
        resolvedTrainStartDate = jYmd;
      }
    }

    const validationDate = resolvedTrainStartDate || resolvedBoardingDate;
    const runDayErr = getTrainDoesNotRunOnDateError(
      validationDate,
      schedule.trainRunsOn,
    );
    if (runDayErr) {
      // If we inferred or used a trainStartDate that is different from boarding date
      if (
        resolvedTrainStartDate &&
        resolvedTrainStartDate !== resolvedBoardingDate
      ) {
        runDayErr.message = `This train does not start its journey on ${resolvedTrainStartDate} (the date it would have to start to reach your boarding station ${fromCode} on ${resolvedBoardingDate}).`;
      }
      return { valid: false, errors: [runDayErr] };
    }

    const list = schedule.stationList as Array<{
      stationCode?: string;
      stationName?: string;
    }>;
    const codes = list
      .map((s) => String(s.stationCode ?? '').trim())
      .filter(Boolean);
    const fromIdx = codes.findIndex((c) => c === fromCode);
    const toIdx = codes.findIndex((c) => c === toCode);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) {
      return {
        valid: false,
        errors: [
          {
            code: 'ROUTE_INVALID',
            message:
              'From/to stations not found on this train route or invalid order.',
          },
        ],
      };
    }

    return {
      valid: true,
      context: {
        schedule,
        fromCode,
        toCode,
        trainNumber,
        stationsToProcess: [fromCode],
        jYmd: resolvedBoardingDate,
        trainStartDate: resolvedTrainStartDate || resolvedBoardingDate,
      },
    };
  }

  private throwIfInvalidJourney(v: JourneyValidationResult): asserts v is {
    valid: true;
    context: JourneyValidContext;
  } {
    if (v.valid) return;
    const e = v.errors[0];
    if (e.code === 'TRAIN_DOES_NOT_RUN_ON_DATE') {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: e.code,
        message: e.message,
        runningDayNames: e.runningDayNames ?? [],
        nextRunDate: e.nextRunDate ?? null,
        nextRunDayAndDate: e.nextRunDayAndDate ?? null,
        requestedJourneyDate: e.requestedJourneyDate,
      });
    }
    throw new Error(e.message);
  }

  /**
   * Create one task per chart event for the boarding station.
   * If chart time is already past, run the check immediately and mark task completed.
   * Returns journeyRequestId and list of tasks.
   */
  async createJourneyTasks(
    params: {
      trainNumber: string;
      trainName?: string;
      fromStationCode: string;
      toStationCode: string;
      journeyDate: string;
      classCode: string;
      stationCodesToMonitor?: string[];
      email?: string;
      mobile?: string;
    },
    /** When set (e.g. after POST journey/validate), skips a duplicate schedule fetch. */
    opts?: {
      validatedContext?: JourneyValidContext;
      journeyRequestId?: string;
    },
  ): Promise<{
    journeyRequestId: string;
    tasks: Array<{
      id: string;
      stationCode: string;
      chartAt: string;
      status: string;
    }>;
  }> {
    const validation: JourneyValidationResult = opts?.validatedContext
      ? { valid: true, context: opts.validatedContext }
      : await this.validateJourneyForMonitoring(params);
    this.throwIfInvalidJourney(validation);
    const { schedule, fromCode, toCode, trainNumber } = validation.context;

    const journeyDate = new Date(params.journeyDate.trim());
    const classCode = (params.classCode || '3A').trim().toUpperCase();
    const email = params.email?.trim().toLowerCase() || undefined;
    // Normalize to E.164 (add 91 prefix for 10-digit Indian numbers) so the
    // DB always stores a consistent format regardless of what the client sent.
    const rawMobile = params.mobile?.trim() || undefined;
    const mobile = rawMobile ? toE164(rawMobile) : undefined;
    const trainStartDate = new Date(validation.context.trainStartDate);

    const [chartTimesWithSecond, existingContact] = await Promise.all([
      this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        [fromCode],
        trainStartDate,
      ),
      email || mobile
        ? this.prisma.monitoringContact.findFirst({
            where: {
              OR: [
                ...(email ? [{ email }] : []),
                ...(mobile ? [{ mobile }] : []),
              ].filter((o) => Object.keys(o).length > 0),
            },
          })
        : Promise.resolve(null),
    ]);

    let monitoringContactId: string | undefined;
    if (existingContact) {
      monitoringContactId = existingContact.id;
      if (email && existingContact.email !== email) {
        try {
          await this.prisma.monitoringContact.update({
            where: { id: existingContact.id },
            data: { email },
          });
        } catch (err: unknown) {
          if (!isPrismaUniqueViolation(err)) throw err;
        }
      }
      if (mobile && existingContact.mobile !== mobile) {
        try {
          await this.prisma.monitoringContact.update({
            where: { id: existingContact.id },
            data: { mobile },
          });
        } catch (err: unknown) {
          if (!isPrismaUniqueViolation(err)) throw err;
        }
      }
    } else if (email || mobile) {
      try {
        const created = await this.prisma.monitoringContact.create({
          data: { email: email || null, mobile: mobile || null },
        });
        monitoringContactId = created.id;
      } catch (err: unknown) {
        if (!isPrismaUniqueViolation(err)) throw err;
        const conflict = await this.prisma.monitoringContact.findFirst({
          where: {
            OR: [
              ...(email ? [{ email }] : []),
              ...(mobile ? [{ mobile }] : []),
            ].filter((o) => Object.keys(o).length > 0),
          },
        });
        if (conflict) {
          monitoringContactId = conflict.id;
        }
      }
    }

    const taskSpecs: Array<{ stationCode: string; chartAt: Date }> = [];
    const trainName = params.trainName ?? schedule.trainName;

    const entry = chartTimesWithSecond.get(fromCode);
    const needsAsyncHydration = !entry;

    if (entry) {
      const stationCode = fromCode;

      taskSpecs.push({
        stationCode,
        chartAt: buildChartAtWithDayOffset(
          trainStartDate,
          entry.chartOne.time,
          entry.chartOne.dayOffset ?? 0,
        ),
      });

      if (entry.chartTwo) {
        taskSpecs.push({
          stationCode,
          chartAt: buildChartAtWithDayOffset(
            trainStartDate,
            entry.chartTwo.time,
            entry.chartTwo.dayOffset ?? 0,
          ),
        });
      }
    } else {
      // DB does not have chart time for fromCode yet.
      // Compute estimated chartAt from departure/arrival time or default (4 hours before departure).
      const boardingStn = schedule.stationList.find(
        (s) =>
          String(s.stationCode ?? '')
            .trim()
            .toUpperCase() === fromCode,
      );
      const dayCount = stationDayCount(boardingStn);
      const rawTime =
        boardingStn?.departureTime || boardingStn?.arrivalTime || '08:00';
      const timeMatch = String(rawTime)
        .trim()
        .match(/^(\d{1,2}):(\d{2})/);
      const timeStr = timeMatch
        ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
        : '08:00';

      const deptDateTime = buildChartAtWithDayOffset(
        trainStartDate,
        timeStr,
        dayCount - 1,
      );
      const estimatedChartAt = new Date(
        deptDateTime.getTime() - 4 * 3600 * 1000,
      );

      taskSpecs.push({
        stationCode: fromCode,
        chartAt: estimatedChartAt,
      });
    }

    const jid = opts?.journeyRequestId || randomUUID();

    const createdTasks = taskSpecs.map((spec) => ({
      id: randomUUID(),
      journeyRequestId: jid,
      trainNumber,
      trainName,
      fromStationCode: fromCode,
      toStationCode: toCode,
      stationCode: spec.stationCode,
      journeyDate,
      trainStartDate: new Date(validation.context.trainStartDate),
      chartAt: spec.chartAt,
      status: 'pending',
      retryCount: 0,
      nextRunAt: null,
      lockedAt: null,
      lastError: null,
    }));

    await this.prisma.$transaction([
      this.prisma.journeyMonitoringRequest.create({
        data: {
          id: jid,
          monitoringContactId: monitoringContactId ?? null,
          trainNumber,
          fromStationCode: fromCode,
          toStationCode: toCode,
          journeyDate,
          classCode,
        },
      }),
      this.prisma.journeyMonitorContact.create({
        data: {
          journeyRequestId: jid,
          email: email || null,
          mobile: mobile || null,
        },
      }),
      this.prisma.chartTimeAvailabilityTask.createMany({
        data: createdTasks,
      }),
    ]);

    const tasks = createdTasks.map((t) => ({
      id: t.id,
      stationCode: t.stationCode,
      chartAt: t.chartAt.toISOString(),
      status: t.status,
    }));

    if (needsAsyncHydration) {
      setImmediate(() => {
        void this.asyncHydrateChartTimeAndUpdateTasks(
          trainNumber,
          fromCode,
          trainStartDate,
          jid,
        );
      });
    }

    return { journeyRequestId: jid, tasks };
  }

  /**
   * Asynchronously validates and creates journey monitoring tasks, sends admin notification,
   * hydrations, and immediate checks in the background.
   */
  async queueJourneyMonitoring(
    params: {
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
    },
    journeyRequestId?: string,
  ): Promise<void> {
    try {
      const validation = await this.validateJourneyForMonitoring(params);
      if (!validation.valid) {
        this.logger.warn(
          `[journey/queue] Validation failed for train=${params.trainNumber} from=${params.fromStationCode} to=${params.toStationCode} jid=${journeyRequestId}: ${JSON.stringify(validation.errors)}`,
        );
        return;
      }

      const result = await this.createJourneyTasks(params, {
        validatedContext: validation.context,
        journeyRequestId,
      });

      void this.notificationService
        .sendAdminMonitoringRequestEmail({
          journeyRequestId: result.journeyRequestId,
          taskCount: result.tasks.length,
          trainNumber: params.trainNumber,
          trainName: params.trainName,
          fromStationCode: params.fromStationCode,
          toStationCode: params.toStationCode,
          journeyDate: params.journeyDate,
          classCode: params.classCode,
          stationCodesToMonitor: [validation.context.fromCode],
          userEmail: params.email,
          userMobile: params.mobile,
        })
        .catch((err) =>
          this.logger.error(
            'Admin monitoring request notification failed',
            err instanceof Error ? err.stack || err.message : String(err),
          ),
        );
    } catch (err) {
      this.logger.error(
        `[journey/queue] Failed to process background journey monitoring for train=${params.trainNumber} jid=${journeyRequestId}: ${err instanceof Error ? err.stack || err.message : String(err)}`,
      );
    }
  }

  /**
   * Queue a "chart prepared — no specific destination" alert task. Skips the
   * route/IRCTC validation (we only need the boarding station's chart time)
   * and writes the row with `toStationCode = ''` plus a `resultPayload` flag
   * so `runTask` knows to route to `notificationService.notifyChartPrepared`
   * instead of running the full availability check.
   */
  async queueChartPreparedMonitoring(
    params: {
      trainNumber: string;
      trainName?: string;
      fromStationCode: string;
      toStationCode: string; // expected to be '' (the no-destination sentinel)
      journeyDate: string;
      classCode: string;
      stationCodesToMonitor?: string[];
      email?: string;
      mobile?: string;
      trainStartDate?: string;
    },
    journeyRequestId?: string,
  ): Promise<void> {
    if (params.toStationCode) {
      this.logger.warn(
        `[journey/queue-chart-prepared] called with non-empty toStationCode=${params.toStationCode}; falling through to queueJourneyMonitoring`,
      );
      return this.queueJourneyMonitoring(params, journeyRequestId);
    }

    const fromCode = params.fromStationCode.trim().toUpperCase();
    const trainNumber = params.trainNumber.trim();
    const jYmd = parseJourneyYmdForValidation(params.journeyDate);
    if (!jYmd) {
      this.logger.warn(
        `[journey/queue-chart-prepared] invalid journeyDate=${params.journeyDate}; skipping`,
      );
      return;
    }

    // Resolve just the schedule + boarding-station chart time. We bypass
    // validateJourneyForMonitoring because that requires a destination on
    // the route; here the destination is empty by design.
    const scheduleResult = await this.irctc.getTrainSchedule(trainNumber, {
      fillRunsOnFromComposition: {
        jDate: jYmd,
        boardingStation: fromCode,
      },
    });
    if (!scheduleResult.ok || !scheduleResult.schedule.stationList?.length) {
      this.logger.warn(
        `[journey/queue-chart-prepared] schedule unavailable for train=${trainNumber} station=${fromCode}: ${scheduleResult.ok ? 'empty stationList' : scheduleResult.reason}`,
      );
      return;
    }
    const schedule = scheduleResult.schedule;
    const boardingStn = schedule.stationList.find(
      (s) =>
        String(s.stationCode ?? '')
          .trim()
          .toUpperCase() === fromCode,
    );
    if (!boardingStn) {
      this.logger.warn(
        `[journey/queue-chart-prepared] boarding station ${fromCode} not found on train=${trainNumber} route`,
      );
      return;
    }
    const dayCount = stationDayCount(boardingStn);
    const startYmd = params.trainStartDate
      ? parseJourneyYmdForValidation(params.trainStartDate)
      : null;
    let resolvedTrainStartDate = startYmd;
    let resolvedBoardingDate = jYmd;
    if (resolvedTrainStartDate && dayCount > 1) {
      if (jYmd === resolvedTrainStartDate) {
        const computedBoardingDate = DateTime.fromISO(resolvedTrainStartDate)
          .plus({ days: dayCount - 1 })
          .toISODate();
        if (computedBoardingDate) resolvedBoardingDate = computedBoardingDate;
      }
    } else if (!resolvedTrainStartDate) {
      resolvedTrainStartDate =
        dayCount > 1
          ? (DateTime.fromISO(jYmd)
              .minus({ days: dayCount - 1 })
              .toISODate() ?? jYmd)
          : jYmd;
    }

    const trainStartDateObj = new Date(resolvedTrainStartDate);
    const email = params.email?.trim().toLowerCase() || undefined;
    const rawMobile = params.mobile?.trim() || undefined;
    const mobile = rawMobile ? toE164(rawMobile) : undefined;
    const classCode = (params.classCode || '3A').trim().toUpperCase();

    // Lookup / create contact.
    let monitoringContactId: string | undefined;
    const existingContact =
      email || mobile
        ? await this.prisma.monitoringContact.findFirst({
            where: {
              OR: [
                ...(email ? [{ email }] : []),
                ...(mobile ? [{ mobile }] : []),
              ].filter((o) => Object.keys(o).length > 0),
            },
          })
        : null;
    if (existingContact) {
      monitoringContactId = existingContact.id;
    } else if (email || mobile) {
      try {
        const created = await this.prisma.monitoringContact.create({
          data: { email: email || null, mobile: mobile || null },
        });
        monitoringContactId = created.id;
      } catch (err: unknown) {
        if (!isPrismaUniqueViolation(err)) throw err;
        const conflict = await this.prisma.monitoringContact.findFirst({
          where: {
            OR: [
              ...(email ? [{ email }] : []),
              ...(mobile ? [{ mobile }] : []),
            ].filter((o) => Object.keys(o).length > 0),
          },
        });
        if (conflict) monitoringContactId = conflict.id;
      }
    }

    // Resolve chartAt for the boarding station (uses cached chart times
    // when available; falls back to the 4h-before-departure estimate when not).
    const chartTimesWithSecond =
      await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        [fromCode],
        trainStartDateObj,
      );
    const entry = chartTimesWithSecond.get(fromCode);
    const needsAsyncHydration = !entry;

    const taskSpecs: Array<{ stationCode: string; chartAt: Date }> = [];
    if (entry) {
      taskSpecs.push({
        stationCode: fromCode,
        chartAt: buildChartAtWithDayOffset(
          trainStartDateObj,
          entry.chartOne.time,
          entry.chartOne.dayOffset ?? 0,
        ),
      });
      if (entry.chartTwo) {
        taskSpecs.push({
          stationCode: fromCode,
          chartAt: buildChartAtWithDayOffset(
            trainStartDateObj,
            entry.chartTwo.time,
            entry.chartTwo.dayOffset ?? 0,
          ),
        });
      }
    } else {
      const rawTime =
        boardingStn?.departureTime || boardingStn?.arrivalTime || '08:00';
      const timeMatch = String(rawTime)
        .trim()
        .match(/^(\d{1,2}):(\d{2})/);
      const timeStr = timeMatch
        ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
        : '08:00';
      const deptDateTime = buildChartAtWithDayOffset(
        trainStartDateObj,
        timeStr,
        dayCount - 1,
      );
      taskSpecs.push({
        stationCode: fromCode,
        chartAt: new Date(deptDateTime.getTime() - 4 * 3600 * 1000),
      });
    }

    const jid = journeyRequestId || randomUUID();
    const trainName = params.trainName ?? schedule.trainName;
    const journeyDateObj = new Date(resolvedBoardingDate);
    const resultPayload = {
      mode: 'chart_prepared_only',
    } as const;

    const createdTasks = taskSpecs.map((spec) => ({
      id: randomUUID(),
      journeyRequestId: jid,
      trainNumber,
      trainName,
      fromStationCode: fromCode,
      toStationCode: '', // sentinel for the no-destination flow
      stationCode: spec.stationCode,
      journeyDate: journeyDateObj,
      trainStartDate: trainStartDateObj,
      chartAt: spec.chartAt,
      status: 'pending',
      retryCount: 0,
      nextRunAt: null,
      lockedAt: null,
      lastError: null,
      resultPayload: { ...resultPayload },
    }));

    await this.prisma.$transaction([
      this.prisma.journeyMonitoringRequest.create({
        data: {
          id: jid,
          monitoringContactId: monitoringContactId ?? null,
          trainNumber,
          fromStationCode: fromCode,
          toStationCode: '',
          journeyDate: journeyDateObj,
          classCode,
        },
      }),
      this.prisma.journeyMonitorContact.create({
        data: {
          journeyRequestId: jid,
          email: email || null,
          mobile: mobile || null,
        },
      }),
      this.prisma.chartTimeAvailabilityTask.createMany({
        data: createdTasks,
      }),
    ]);

    if (needsAsyncHydration) {
      setImmediate(() => {
        void this.asyncHydrateChartTimeAndUpdateTasks(
          trainNumber,
          fromCode,
          trainStartDateObj,
          jid,
        );
      });
    }

    void this.notificationService
      .sendAdminMonitoringRequestEmail({
        journeyRequestId: jid,
        taskCount: createdTasks.length,
        trainNumber,
        trainName,
        fromStationCode: fromCode,
        toStationCode: '',
        journeyDate: resolvedBoardingDate,
        classCode,
        stationCodesToMonitor: [fromCode],
        userEmail: email,
        userMobile: mobile,
      })
      .catch((err) =>
        this.logger.error(
          'Admin chart-prepared monitoring request notification failed',
          err instanceof Error ? err.stack || err.message : String(err),
        ),
      );
  }

  private async asyncHydrateChartTimeAndUpdateTasks(
    trainNumber: string,
    stationCode: string,
    trainStartDate: Date,
    journeyRequestId: string,
  ): Promise<void> {
    const num = to5DigitTrainNo(trainNumber);
    const code = stationCode.trim().toUpperCase();
    const hydrationDateStr = trainStartDate.toISOString().slice(0, 10);

    try {
      this.logger.log(
        `[journey/async-hydration] starting for train=${num} station=${code} jid=${journeyRequestId}`,
      );
      await this.irctc.getTrainComposition(
        {
          trainNo: num,
          jDate: hydrationDateStr,
          boardingStation: code,
        },
        { allowChartNotPrepared: true },
      );

      const chartMetaMap =
        await this.chartTime.getChartTimesWithSecondChartForTrain(
          num,
          [code],
          trainStartDate,
        );
      const entry = chartMetaMap.get(code);
      if (!entry?.chartOne) {
        this.logger.warn(
          `[journey/async-hydration] no chart times found for train=${num} station=${code} after composition fetch`,
        );
        return;
      }

      const exactChartOneAt = buildChartAtWithDayOffset(
        trainStartDate,
        entry.chartOne.time,
        entry.chartOne.dayOffset ?? 0,
      );

      const pendingTasks = await this.prisma.chartTimeAvailabilityTask.findMany(
        {
          where: {
            journeyRequestId,
            stationCode: code,
            status: 'pending',
          },
          orderBy: { createdAt: 'asc' },
        },
      );

      if (pendingTasks.length > 0) {
        await this.prisma.chartTimeAvailabilityTask.update({
          where: { id: pendingTasks[0].id },
          data: { chartAt: exactChartOneAt },
        });

        if (entry.chartTwo) {
          const exactChartTwoAt = buildChartAtWithDayOffset(
            trainStartDate,
            entry.chartTwo.time,
            entry.chartTwo.dayOffset ?? 0,
          );
          if (pendingTasks.length > 1) {
            await this.prisma.chartTimeAvailabilityTask.update({
              where: { id: pendingTasks[1].id },
              data: { chartAt: exactChartTwoAt },
            });
          } else {
            const firstTask = pendingTasks[0];
            await this.prisma.chartTimeAvailabilityTask.create({
              data: {
                journeyRequestId: firstTask.journeyRequestId,
                trainNumber: firstTask.trainNumber,
                trainName: firstTask.trainName,
                fromStationCode: firstTask.fromStationCode,
                toStationCode: firstTask.toStationCode,
                stationCode: firstTask.stationCode,
                journeyDate: firstTask.journeyDate,
                trainStartDate: firstTask.trainStartDate,
                chartAt: exactChartTwoAt,
                status: 'pending',
              },
            });
          }
        }
        this.logger.log(
          `[journey/async-hydration] updated tasks for jid=${journeyRequestId} with exact chartAt=${exactChartOneAt.toISOString()}`,
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[journey/async-hydration] failed for train=${num} station=${code} jid=${journeyRequestId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Run a single ChartTimeAvailabilityTask by calling the Service2 check API
   * internally to find available seats at chart time.
   */
  /**
   * No-destination variant of `runTask`. Skips the IRCTC availability check
   * and just dispatches a `chart_prepared_only` notification with a
   * short-link to the search page. Used when the user set up an alert
   * without picking a destination station.
   */
  private async runChartPreparedTask(
    taskId: string,
    force: boolean,
    task: ChartTimeAvailabilityTask,
  ): Promise<void> {
    const now = new Date();
    const firstRunAt = task.firstRunAt ?? now;
    await this.prisma.chartTimeAvailabilityTask.update({
      where: { id: taskId },
      data: {
        status: 'running',
        retryCount: { increment: task.status === 'pending' ? 1 : 0 },
        lockedAt: now,
        completedAt: null,
        lastError: null,
        firstRunAt,
      },
    });

    const journeyDateStr = task.journeyDate.toISOString().slice(0, 10);
    const chartPreparationText = `Chart for ${task.trainNumber} was prepared at ${task.chartAt.toISOString()}.`;

    try {
      const contact = await this.prisma.journeyMonitorContact.findUnique({
        where: { journeyRequestId: task.journeyRequestId },
      });
      if (!contact || (!contact.email && !contact.mobile)) {
        await this.prisma.chartTimeAvailabilityTask.update({
          where: { id: taskId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            lockedAt: null,
            nextRunAt: null,
            lastError: 'no contact for chart_prepared task',
          },
        });
        return;
      }

      const status = await this.notificationService.notifyChartPrepared({
        email: contact.email,
        mobile: contact.mobile,
        trainNumber: task.trainNumber,
        trainName: task.trainName,
        journeyDate: task.journeyDate,
        chartPreparationText,
      });
      const data: {
        emailNotifiedAt?: Date;
        whatsappNotifiedAt?: Date;
      } = {};
      if (status.emailSent) data.emailNotifiedAt = new Date();
      if (status.whatsappSent) data.whatsappNotifiedAt = new Date();
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          lockedAt: null,
          nextRunAt: null,
          lastError: null,
          firstRunAt,
          ...data,
        },
      });
      void journeyDateStr; // referenced for clarity
    } catch (e) {
      this.logger.error(
        `runChartPreparedTask failed for task=${taskId}`,
        e instanceof Error ? e.stack || e.message : String(e),
      );
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          lastError: (e instanceof Error ? e.message : String(e)).slice(
            0,
            1000,
          ),
          completedAt: new Date(),
          lockedAt: null,
          nextRunAt: null,
        },
      });
    }
    void force; // signature parity with runTask
  }

  async runTask(taskId: string, force = false): Promise<void> {
    const task = await this.prisma.chartTimeAvailabilityTask.findUnique({
      where: { id: taskId },
    });
    if (!task || (!force && task.status !== 'pending')) return;

    // No-destination flow: skip the IRCTC availability check entirely and
    // just send a "chart prepared — check tickets on our platform" notification.
    if (task.toStationCode === '') {
      await this.runChartPreparedTask(taskId, force, task);
      return;
    }

    const attemptNumber =
      (task.retryCount ?? 0) + (task.status === 'pending' ? 1 : 0);

    let firstRunAt = task.firstRunAt;

    if (task.status === 'pending') {
      const now = new Date();
      if (!firstRunAt) {
        firstRunAt = now;
      }
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: 'running',
          retryCount: { increment: 1 },
          lockedAt: now,
          completedAt: null,
          lastError: null,
          firstRunAt,
        },
      });
    } else if (!firstRunAt) {
      firstRunAt = new Date();
    }

    const journeyDateStr = task.journeyDate.toISOString().slice(0, 10);
    const trainStartDateStr = task.trainStartDate
      ? task.trainStartDate.toISOString().slice(0, 10)
      : journeyDateStr;

    try {
      console.log('running task', task.id);
      console.log('task', {
        trainNumber: task.trainNumber,
        stationCode: task.stationCode,
        journeyDate: journeyDateStr,
        trainStartDate: trainStartDateStr,
        destinationStation: task.toStationCode,
      });
      // Resolve the class the user subscribed for so we probe the same class
      // they entered in the alert (the rest of the OD comes from the task).
      const monitorRequest =
        await this.prisma.journeyMonitoringRequest.findUnique({
          where: { id: task.journeyRequestId },
        });
      const subscribedClass = monitorRequest?.classCode?.trim().toUpperCase();

      // Check for vacant berths with the same engine the Search Route uses
      // (alternate paths over ConfirmTkt availability + IRCTC schedule). It
      // already retries across ±station offsets internally, so there's no
      // manual offset loop here, and no OpenAI call. If the user selected 'ANY',
      // passing undefined avlClasses triggers the multi-class best seats algorithm.
      const alt = await this.bookingV2Service.findAlternatePaths({
        trainNumber: task.trainNumber,
        from: task.fromStationCode,
        to: task.toStationCode,
        date: journeyDateStr,
        avlClasses:
          subscribedClass && subscribedClass !== 'ANY'
            ? [subscribedClass]
            : undefined,
        quota: 'GN',
      });
      const isChartTimePassed = isTaskChartTimePassed(task);
      const result = alternatePathsToCheckResult(alt, { isChartTimePassed });

      console.log('result', result);

      const status = result.status === 'success' ? 'completed' : 'failed';

      const isNotPrepared =
        status === 'failed' &&
        (result as any).chartStatus?.kind === 'not_prepared_yet';

      if (isNotPrepared) {
        const delayMs = 30 * 60_000; // 30 minutes
        const nextRunAt = new Date(Date.now() + delayMs);
        await this.prisma.chartTimeAvailabilityTask.update({
          where: { id: taskId },
          data: {
            status: 'pending',
            resultPayload: result as object,
            nextRunAt,
            lockedAt: null,
            completedAt: null,
            retryCount: Math.max(0, attemptNumber - 1),
            lastError: chartTaskFailureText(result).slice(0, 1000),
            firstRunAt: firstRunAt || new Date(),
          },
        });
        console.log(
          'scheduled chart task retry for chart not prepared',
          taskId,
          'nextRunAt',
          nextRunAt.toISOString(),
        );
        return;
      }

      if (
        status === 'failed' &&
        attemptNumber < MAX_CHART_TASK_ATTEMPTS &&
        isRetryableChartTaskFailure(result)
      ) {
        await this.scheduleTaskRetry(
          taskId,
          result,
          attemptNumber,
          firstRunAt || new Date(),
        );
        return;
      }

      if (result.status === 'success' && result.openAiStructuredSeats) {
        // Find it from the origin and remove the fare option temporarily per requirements
        result.openAiStructuredSeats = result.openAiStructuredSeats.map(
          (seat) => {
            const copy = { ...seat } as Record<string, unknown>;
            delete copy.fare;
            return copy as OpenAIStructuredSeat;
          },
        );
      }

      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status,
          resultPayload: result as object,
          completedAt: new Date(),
          lockedAt: null,
          nextRunAt: null,
          lastError:
            status === 'failed'
              ? chartTaskFailureText(result).slice(0, 1000)
              : null,
          firstRunAt: firstRunAt || new Date(),
        },
      });

      if (status === 'completed') {
        const contact = await this.prisma.journeyMonitorContact.findUnique({
          where: { journeyRequestId: task.journeyRequestId },
        });
        console.log('contact', contact);
        if (contact && (contact.email || contact.mobile)) {
          if (process.env.ENABLE_AUTO_SUBSCRIBE_MISSING_LEGS === 'true') {
            try {
              await this.autoSubscribeForMissingLegs({
                journeyRequestId: task.journeyRequestId,
                task,
                result,
                contact,
              });
            } catch (autoSubErr) {
              console.error(
                'Failed to auto-subscribe for missing legs',
                autoSubErr,
              );
            }
          }

          let alternativeTrains: BestTrainCandidateResult[] | undefined;
          const hasTickets = hasBookablePlanForNotification(result);
          let monitoredClassCode = '3A';

          const journeyDateDate =
            task.journeyDate instanceof Date
              ? task.journeyDate
              : new Date(String(task.journeyDate).slice(0, 10));

          // Check if user has already received an alert for this train and journey date
          let existingNotification: unknown = null;
          try {
            existingNotification =
              await this.prisma.sentNotificationLog.findFirst({
                where: {
                  trainNumber: task.trainNumber,
                  journeyDate: journeyDateDate,
                  recipient: {
                    in: [
                      ...(contact.email
                        ? [contact.email.toLowerCase().trim()]
                        : []),
                      ...(contact.mobile ? [contact.mobile.trim()] : []),
                    ],
                  },
                },
              });
          } catch (logErr) {
            this.logger.warn(
              `[journey] Failed to query sent_notification_log for task=${taskId}: ${logErr}`,
            );
          }

          const isFollowUpLeg = Boolean(existingNotification);

          // If follow-up check and no tickets found, skip alternative search & notification dispatch
          if (isFollowUpLeg && !hasTickets) {
            console.log(
              `[journey] Skipping follow-up notification for task=${taskId} (no tickets unlocked)`,
            );
            return;
          }

          if (!hasTickets) {
            try {
              const req = await this.prisma.journeyMonitoringRequest.findUnique(
                {
                  where: { id: task.journeyRequestId },
                },
              );
              if (req) {
                const classCode = req.classCode.toUpperCase();
                monitoredClassCode = classCode;
                const isAc =
                  classCode === 'ANY'
                    ? false
                    : !['SL', '2S', 'GN', 'FC'].includes(classCode);
                const bestResult = await this.bookingV2Service.findBestTrains({
                  from: task.fromStationCode,
                  to: task.toStationCode,
                  date: task.journeyDate.toISOString().slice(0, 10),
                  quota: 'GN',
                  acOnly: isAc,
                  maxTrains: 5,
                });
                alternativeTrains = bestResult.results.slice(0, 5);
              }
            } catch (err) {
              console.error('Failed to find best alternative trains', err);
            }
          }

          try {
            const status = await this.notificationService.notifyUser({
              email: contact.email,
              mobile: contact.mobile,
              task: {
                trainNumber: task.trainNumber,
                trainName: task.trainName,
                fromStationCode: task.fromStationCode,
                toStationCode: task.toStationCode,
                journeyDate: task.journeyDate,
              },
              result,
              alternativeTrains,
              isFollowUpLeg,
            });
            const data: {
              emailNotifiedAt?: Date;
              whatsappNotifiedAt?: Date;
            } = {};
            if (status.emailSent) data.emailNotifiedAt = new Date();
            if (status.whatsappSent) data.whatsappNotifiedAt = new Date();
            if (Object.keys(data).length > 0) {
              await this.prisma.chartTimeAvailabilityTask.update({
                where: { id: taskId },
                data,
              });
            }
          } catch (e) {
            console.error('Notification failed', e);
            const errLogs =
              e instanceof Error ? e.stack || e.message : String(e);
            void this.notificationService.sendAlertFailureReport({
              alertType: 'Journey Task Notification Rejection',
              recipientMobile: contact.mobile,
              recipientEmail: contact.email,
              trainNumber: task.trainNumber,
              trainName: task.trainName,
              fromStationCode: task.fromStationCode,
              toStationCode: task.toStationCode,
              journeyDate: task.journeyDate,
              failureReason:
                'Unhandled rejection during journey task notification',
              logs: errLogs,
              payload: { taskId, journeyRequestId: task.journeyRequestId },
            });
          }

          if (!hasTickets && this.alternativeSearchTaskService) {
            try {
              await this.alternativeSearchTaskService.enqueueTask({
                journeyTaskId: task.id,
                trainNumber: task.trainNumber,
                trainName: task.trainName || undefined,
                fromStationCode: task.fromStationCode,
                toStationCode: task.toStationCode,
                journeyDate: task.journeyDate,
                classCode:
                  monitoredClassCode === 'ANY' ? '3A' : monitoredClassCode,
                monitoringContactId: contact.id,
                email: contact.email || undefined,
                mobile: contact.mobile || undefined,
              });
              this.logger.log(
                `[journey] Enqueued alternate train search for task=${taskId}`,
              );
            } catch (err) {
              this.logger.warn(
                `[journey] Failed to enqueue alternate train search for task=${taskId}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (
        attemptNumber < MAX_CHART_TASK_ATTEMPTS &&
        isRetryableRailFailureText(message)
      ) {
        await this.scheduleTaskRetry(
          taskId,
          { error: message },
          attemptNumber,
          firstRunAt || new Date(),
        );
        return;
      }

      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          resultPayload: { error: message } as object,
          completedAt: new Date(),
          lockedAt: null,
          nextRunAt: null,
          lastError: message.slice(0, 1000),
          firstRunAt: firstRunAt || new Date(),
        },
      });
    }
  }

  private async scheduleTaskRetry(
    taskId: string,
    resultPayload: object,
    attemptNumber: number,
    firstRunAt?: Date,
  ): Promise<void> {
    const delayMs = retryDelayMsForAttempt(attemptNumber);
    const nextRunAt = new Date(Date.now() + delayMs);
    await this.prisma.chartTimeAvailabilityTask.update({
      where: { id: taskId },
      data: {
        status: 'pending',
        resultPayload,
        nextRunAt,
        lockedAt: null,
        completedAt: null,
        lastError: chartTaskFailureText(resultPayload).slice(0, 1000),
        ...(firstRunAt ? { firstRunAt } : {}),
      },
    });
    console.log(
      'scheduled chart task retry',
      taskId,
      'attempt',
      attemptNumber,
      'nextRunAt',
      nextRunAt.toISOString(),
    );
  }

  /**
   * Find pending tasks whose chart time has arrived (chartAt <= now) and run each
   * by calling the Service2 check API internally to find available seats.
   * Called by cron every minute.
   */
  /** Recent cron run/tick logs for the admin viewer. */
  async getRecentCronRuns(opts?: {
    limit?: number;
    cronName?: string;
    status?: string;
  }) {
    const limit = Math.min(Math.max(opts?.limit ?? 120, 1), 500);
    return this.prisma.cronRunLog.findMany({
      where: {
        ...(opts?.cronName ? { cronName: opts.cronName } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /** Persist one cron run/tick (best-effort — never throws into the cron). */
  async logCronRun(entry: {
    cronName: string;
    startedAt: Date;
    status: string;
    isLeader?: boolean;
    tasksClaimed?: number;
    tasksRun?: number;
    completedCount?: number;
    failedCount?: number;
    input?: unknown;
    output?: unknown;
    error?: string | null;
  }): Promise<void> {
    try {
      const finishedAt = new Date();
      await this.prisma.cronRunLog.create({
        data: {
          cronName: entry.cronName,
          startedAt: entry.startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - entry.startedAt.getTime(),
          status: entry.status,
          isLeader: entry.isLeader ?? false,
          tasksClaimed: entry.tasksClaimed ?? 0,
          tasksRun: entry.tasksRun ?? 0,
          completedCount: entry.completedCount ?? 0,
          failedCount: entry.failedCount ?? 0,
          input: (entry.input ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          output: (entry.output ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          error: entry.error ?? null,
        },
      });
    } catch (e) {
      console.warn(
        'logCronRun failed:',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  async runDueTasks(): Promise<RunDueTasksResult> {
    // chartAt is stored as an IST wall-clock timestamp in Postgres.
    // Operational timestamps (next_run_at/locked_at) use DB NOW().
    const istNow = DateTime.now().setZone('Asia/Kolkata');
    console.log(
      'running due tasks',
      istNow.toFormat('yyyy-MM-dd HH:mm:ss'),
      'IST',
    );

    const empty: RunDueTasksResult = {
      istNow: istNow.toFormat('yyyy-MM-dd HH:mm:ss'),
      claimedTaskIds: [],
      tasksRun: 0,
      results: [],
    };

    let due: Array<{ id: string; retry_count: number }> = [];
    let attempt = 0;
    while (attempt < 2) {
      try {
        due = await this.prisma.$queryRaw<
          Array<{ id: string; retry_count: number }>
        >`UPDATE "ChartTimeAvailabilityTask"
          SET status = 'running',
              locked_at = (NOW() AT TIME ZONE 'utc'),
              retry_count = retry_count + 1,
              last_error = NULL
          WHERE id IN (
            SELECT t.id FROM "ChartTimeAvailabilityTask" t
            WHERE t.completed_at IS NULL
              AND (
                (
                  t.status = 'pending'
                  AND t.chart_at <= (NOW() AT TIME ZONE 'utc')
                  AND (t.next_run_at IS NULL OR t.next_run_at <= (NOW() AT TIME ZONE 'utc'))
                )
                OR (
                  t.status = 'running'
                  AND (
                    t.locked_at IS NULL
                    OR t.locked_at <= (NOW() AT TIME ZONE 'utc') - INTERVAL '10 minutes'
                  )
                )
              )
              AND NOT EXISTS (
                SELECT 1 FROM "notification_unsubscribe" nu
                JOIN "JourneyMonitorContact" jmc
                  ON jmc.journey_request_id = t.journey_request_id
                WHERE nu.recipient = LOWER(TRIM(COALESCE(jmc.email, '')))
                   OR nu.recipient = TRIM(COALESCE(jmc.mobile, ''))
              )
            ORDER BY COALESCE(t.next_run_at, t.chart_at) ASC
            LIMIT 20
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, retry_count`;
        break; // Success
      } catch (error) {
        attempt++;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`runDueTasks query failed (attempt ${attempt}):`, msg);
        if (attempt >= 2) {
          // Gracefully return 0 tasks if it keeps failing. Cron will retry next minute.
          return empty;
        }
        // Wait 1 second before retrying
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
    console.log('marked as running', due);
    const claimedTaskIds = due.map((t) => t.id);
    for (const task of due) {
      await this.runTask(task.id, true);
    }

    // Re-read the just-run tasks to capture the run's OUTPUT (final status +
    // error per task). Note: notification send is fire-and-forget, so
    // emailNotifiedAt/whatsappNotifiedAt may lag — status/lastError are the
    // synchronous outcome of this run.
    let results: RunDueTaskResult[] = [];
    if (claimedTaskIds.length > 0) {
      try {
        const rows = await this.prisma.chartTimeAvailabilityTask.findMany({
          where: { id: { in: claimedTaskIds } },
          select: {
            id: true,
            trainNumber: true,
            fromStationCode: true,
            toStationCode: true,
            journeyDate: true,
            status: true,
            retryCount: true,
            lastError: true,
          },
        });
        results = (rows ?? []).map((r) => ({
          taskId: r.id,
          trainNumber: r.trainNumber,
          from: r.fromStationCode,
          to: r.toStationCode,
          journeyDate: r.journeyDate?.toISOString().slice(0, 10) ?? null,
          status: r.status,
          retryCount: r.retryCount ?? 0,
          lastError: r.lastError ?? null,
        }));
      } catch (e) {
        console.warn(
          'runDueTasks: failed to summarize task outcomes:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    return {
      istNow: istNow.toFormat('yyyy-MM-dd HH:mm:ss'),
      claimedTaskIds,
      tasksRun: due.length,
      results,
    };
  }

  async getTasksByJourneyRequestId(journeyRequestId: string) {
    return this.prisma.chartTimeAvailabilityTask.findMany({
      where: { journeyRequestId },
      orderBy: { chartAt: 'asc' },
    });
  }

  getAllAlerts() {
    return this.prisma.chartTimeAvailabilityTask.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        contact: true,
      },
      take: 200, // Limit to recent 200 for now
    });
  }

  async getNotificationsAnalytics(
    groupBy: 'day' | 'week' | 'month' = 'day',
    startDate?: string,
    endDate?: string,
  ) {
    const periodSql =
      groupBy === 'week'
        ? Prisma.sql`DATE_TRUNC('week', jmr.created_at AT TIME ZONE 'Asia/Kolkata')::date::text`
        : groupBy === 'month'
          ? Prisma.sql`DATE_TRUNC('month', jmr.created_at AT TIME ZONE 'Asia/Kolkata')::date::text`
          : Prisma.sql`DATE(jmr.created_at AT TIME ZONE 'Asia/Kolkata')::text`;

    const rawRows = await this.prisma.$queryRaw<
      Array<{
        date: string;
        total_notifications_created: number;
        total_delivered: number;
        whatsapp_delivered: number;
        email_delivered: number;
        unique_users: number;
        unique_trains_monitored: number;
      }>
    >`
      SELECT 
        ${periodSql} AS date,
        COUNT(DISTINCT jmr.id)::int AS total_notifications_created,
        COUNT(DISTINCT CASE WHEN ctat.email_notified_at IS NOT NULL OR ctat.whatsapp_notified_at IS NOT NULL THEN jmr.id END)::int AS total_delivered,
        COUNT(DISTINCT CASE WHEN ctat.whatsapp_notified_at IS NOT NULL THEN jmr.id END)::int AS whatsapp_delivered,
        COUNT(DISTINCT CASE WHEN ctat.email_notified_at IS NOT NULL THEN jmr.id END)::int AS email_delivered,
        COUNT(DISTINCT jmr.monitoring_contact_id)::int AS unique_users,
        COUNT(DISTINCT jmr.train_number)::int AS unique_trains_monitored
      FROM "JourneyMonitoringRequest" jmr
      LEFT JOIN "ChartTimeAvailabilityTask" ctat ON ctat.journey_request_id = jmr.id
      ${
        startDate && endDate
          ? Prisma.sql`WHERE jmr.created_at >= ${startDate}::timestamp AND jmr.created_at <= (${endDate} || ' 23:59:59')::timestamp`
          : startDate
            ? Prisma.sql`WHERE jmr.created_at >= ${startDate}::timestamp`
            : endDate
              ? Prisma.sql`WHERE jmr.created_at <= (${endDate} || ' 23:59:59')::timestamp`
              : Prisma.empty
      }
      GROUP BY 1
      ORDER BY date ASC
    `;

    let runningCreated = 0;
    let runningDelivered = 0;
    let runningWhatsapp = 0;
    let runningEmail = 0;
    let peakCount = 0;
    let peakDate = '';

    const formattedRows = rawRows.map((row, idx) => {
      const created = Number(row.total_notifications_created);
      const delivered = Number(row.total_delivered);
      const whatsapp = Number(row.whatsapp_delivered);
      const email = Number(row.email_delivered);

      const deliveryRate =
        created > 0 ? Number(((delivered / created) * 100).toFixed(2)) : 0;

      const prevCreated =
        idx > 0 ? Number(rawRows[idx - 1].total_notifications_created) : null;
      const periodChange = prevCreated !== null ? created - prevCreated : null;
      const growthPct =
        prevCreated && prevCreated > 0
          ? Number((((created - prevCreated) / prevCreated) * 100).toFixed(2))
          : null;

      runningCreated += created;
      runningDelivered += delivered;
      runningWhatsapp += whatsapp;
      runningEmail += email;

      if (created > peakCount) {
        peakCount = created;
        peakDate = row.date;
      }

      return {
        date: row.date,
        totalNotificationsCreated: created,
        totalDelivered: delivered,
        whatsappDelivered: whatsapp,
        emailDelivered: email,
        deliveryRatePct: deliveryRate,
        uniqueUsers: Number(row.unique_users),
        uniqueTrainsMonitored: Number(row.unique_trains_monitored),
        dayOnDayChange: periodChange,
        periodChange,
        growthPercentageDoD: growthPct,
        growthPercentage: growthPct,
      };
    });

    const totalPeriods = formattedRows.length;
    const avgPerPeriod =
      totalPeriods > 0 ? Number((runningCreated / totalPeriods).toFixed(2)) : 0;
    const overallDeliveryRate =
      runningCreated > 0
        ? Number(((runningDelivered / runningCreated) * 100).toFixed(2))
        : 0;

    const monthlyRepeatUsersRaw = await this.prisma.$queryRaw<
      Array<{
        month: string;
        total_users: number;
        new_users: number;
        returning_users: number;
        repeat_users_in_month: number;
        single_alert_users: number;
        repeat_user_rate_pct: number | string;
        notifications_by_repeat_users: number;
        total_notifications: number;
      }>
    >`
      WITH user_first_seen AS (
        SELECT 
          monitoring_contact_id,
          DATE_TRUNC('month', MIN(created_at) AT TIME ZONE 'Asia/Kolkata')::date::text AS first_month
        FROM "JourneyMonitoringRequest"
        WHERE monitoring_contact_id IS NOT NULL
        GROUP BY 1
      ),
      user_monthly_activity AS (
        SELECT 
          DATE_TRUNC('month', jmr.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS month,
          jmr.monitoring_contact_id,
          COUNT(*)::int AS notification_count,
          ufs.first_month
        FROM "JourneyMonitoringRequest" jmr
        JOIN user_first_seen ufs ON jmr.monitoring_contact_id = ufs.monitoring_contact_id
        GROUP BY 1, 2, 4
      )
      SELECT 
        month,
        COUNT(DISTINCT monitoring_contact_id)::int AS total_users,
        COUNT(DISTINCT CASE WHEN first_month = month THEN monitoring_contact_id END)::int AS new_users,
        COUNT(DISTINCT CASE WHEN first_month < month THEN monitoring_contact_id END)::int AS returning_users,
        COUNT(DISTINCT CASE WHEN notification_count > 1 THEN monitoring_contact_id END)::int AS repeat_users_in_month,
        COUNT(DISTINCT CASE WHEN notification_count = 1 THEN monitoring_contact_id END)::int AS single_alert_users,
        ROUND((COUNT(DISTINCT CASE WHEN notification_count > 1 THEN monitoring_contact_id END)::numeric / NULLIF(COUNT(DISTINCT monitoring_contact_id), 0)) * 100, 2) AS repeat_user_rate_pct,
        COALESCE(SUM(CASE WHEN notification_count > 1 THEN notification_count ELSE 0 END), 0)::int AS notifications_by_repeat_users,
        COALESCE(SUM(notification_count), 0)::int AS total_notifications
      FROM user_monthly_activity
      GROUP BY 1
      ORDER BY month DESC
    `;

    const monthlyRepeatUsers = monthlyRepeatUsersRaw.map((row) => {
      const repeatUsers = Number(row.repeat_users_in_month);
      const totalUsers = Number(row.total_users);
      const notificationsByRepeat = Number(row.notifications_by_repeat_users);
      const avgPerRepeatUser =
        repeatUsers > 0
          ? Number((notificationsByRepeat / repeatUsers).toFixed(1))
          : 0;

      return {
        month: row.month,
        totalUsers,
        newUsers: Number(row.new_users),
        returningUsers: Number(row.returning_users),
        repeatUsersInMonth: repeatUsers,
        singleAlertUsers: Number(row.single_alert_users),
        repeatUserRatePct: Number(row.repeat_user_rate_pct || 0),
        notificationsByRepeatUsers: notificationsByRepeat,
        totalNotifications: Number(row.total_notifications),
        avgNotificationsPerRepeatUser: avgPerRepeatUser,
      };
    });

    return {
      groupBy,
      dailyStats: formattedRows,
      stats: formattedRows,
      monthlyRepeatUsers,
      summary: {
        totalNotifications: runningCreated,
        totalCreated: runningCreated,
        totalDelivered: runningDelivered,
        totalWhatsappDelivered: runningWhatsapp,
        totalEmailDelivered: runningEmail,
        overallDeliveryRate,
        totalDays: totalPeriods,
        totalPeriods,
        avgPerDay: avgPerPeriod,
        avgPerPeriod,
        peakDay: peakDate ? { date: peakDate, count: peakCount } : null,
        peakPeriod: peakDate ? { date: peakDate, count: peakCount } : null,
      },
    };
  }

  async resendTaskNotification(taskId: string): Promise<{
    sent: boolean;
    emailSent: boolean;
    whatsappSent: boolean;
    reason?: string;
  }> {
    const task = await this.prisma.chartTimeAvailabilityTask.findUnique({
      where: { id: taskId },
      include: { contact: true },
    });

    if (!task) {
      return {
        sent: false,
        emailSent: false,
        whatsappSent: false,
        reason: 'Task not found',
      };
    }

    const contact =
      task.contact ||
      (await this.prisma.journeyMonitorContact.findUnique({
        where: { journeyRequestId: task.journeyRequestId },
      }));

    if (!contact || (!contact.email && !contact.mobile)) {
      return {
        sent: false,
        emailSent: false,
        whatsappSent: false,
        reason: 'No contact information (email or mobile) found for task',
      };
    }

    let result = task.resultPayload as unknown as Service2CheckResult;
    if (!result) {
      await this.runTask(taskId, true);
      const updated = await this.prisma.chartTimeAvailabilityTask.findUnique({
        where: { id: taskId },
      });
      result = updated?.resultPayload as unknown as Service2CheckResult;
    }

    if (!result) {
      return {
        sent: false,
        emailSent: false,
        whatsappSent: false,
        reason: 'No result payload available to send notification',
      };
    }

    const status = await this.notificationService.notifyUser({
      email: contact.email || undefined,
      mobile: contact.mobile || undefined,
      task: {
        trainNumber: task.trainNumber,
        trainName: task.trainName,
        fromStationCode: task.fromStationCode,
        toStationCode: task.toStationCode,
        journeyDate: task.journeyDate,
      },
      result,
    });

    const data: { emailNotifiedAt?: Date; whatsappNotifiedAt?: Date } = {};
    if (status.emailSent) data.emailNotifiedAt = new Date();
    if (status.whatsappSent) data.whatsappNotifiedAt = new Date();

    if (Object.keys(data).length > 0) {
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data,
      });
    }

    const sent = status.emailSent || status.whatsappSent;
    return {
      sent,
      emailSent: status.emailSent,
      whatsappSent: status.whatsappSent,
      reason: sent
        ? undefined
        : 'Notification provider returned failure (check WATI/Resend API status)',
    };
  }

  async resendFailedWhatsAppNotifications(hours = 24): Promise<{
    found: number;
    resent: number;
    failed: number;
  }> {
    const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const cooldownBefore = new Date(Date.now() - 5 * 60 * 1000);
    const tasks = await this.prisma.chartTimeAvailabilityTask.findMany({
      where: {
        createdAt: { gte: sinceDate },
        status: 'completed',
        completedAt: { lte: cooldownBefore },
        OR: [
          {
            contact: { mobile: { not: null } },
            whatsappNotifiedAt: null,
          },
          {
            contact: { email: { not: null } },
            emailNotifiedAt: null,
          },
        ],
      },
      include: {
        contact: true,
      },
      take: 50,
    });

    let resent = 0;
    let failed = 0;

    for (const task of tasks) {
      const contact =
        task.contact ||
        (await this.prisma.journeyMonitorContact.findUnique({
          where: { journeyRequestId: task.journeyRequestId },
        }));

      if (!contact) continue;

      const needsWhatsApp = Boolean(
        contact.mobile?.trim() && !task.whatsappNotifiedAt,
      );
      const needsEmail = Boolean(
        contact.email?.trim() && !task.emailNotifiedAt,
      );

      if (!needsWhatsApp && !needsEmail) continue;

      if (task.resultPayload) {
        const result = task.resultPayload as unknown as Service2CheckResult;
        try {
          const status = await this.notificationService.notifyUser({
            email: needsEmail ? contact.email?.trim() || undefined : undefined,
            mobile: needsWhatsApp
              ? contact.mobile?.trim() || undefined
              : undefined,
            task: {
              trainNumber: task.trainNumber,
              trainName: task.trainName,
              fromStationCode: task.fromStationCode,
              toStationCode: task.toStationCode,
              journeyDate: task.journeyDate,
            },
            result,
          });

          const data: { emailNotifiedAt?: Date; whatsappNotifiedAt?: Date } =
            {};
          if (needsWhatsApp && status.whatsappSent)
            data.whatsappNotifiedAt = new Date();
          if (needsEmail && status.emailSent) data.emailNotifiedAt = new Date();

          if (Object.keys(data).length > 0) {
            await this.prisma.chartTimeAvailabilityTask.update({
              where: { id: task.id },
              data,
            });
            resent++;
          } else {
            failed++;
          }
        } catch (err) {
          this.logger.error(
            `Failed to resend notification for task ${task.id}`,
            err,
          );
          failed++;
        }
      }
    }

    return { found: tasks.length, resent, failed };
  }

  /**
   * Get stations between from and to that have chart times, for the journey/stations endpoint.
   * Returns stationCode, stationName, chart one time, and optionally chart two time + day offset.
   */
  async getStationsWithChartTimesForRoute(params: {
    trainNumber: string;
    fromStationCode: string;
    toStationCode: string;
  }): Promise<
    Array<{
      stationCode: string;
      stationName: string;
      chartOneTime: string;
      chartOneDayOffset: number | null;
      chartTwoTime: string | null;
      chartTwoDayOffset: number | null;
    }>
  > {
    const fromCode = params.fromStationCode.trim().toUpperCase();
    const toCode = params.toStationCode.trim().toUpperCase();
    const trainNumber = params.trainNumber.trim();

    const scheduleResult = await this.irctc.getTrainSchedule(trainNumber);
    if (!scheduleResult.ok || !scheduleResult.schedule.stationList?.length) {
      return [];
    }
    const schedule = scheduleResult.schedule;

    const list = schedule.stationList as Array<{
      stationCode?: string;
      stationName?: string;
    }>;
    const codes = list
      .map((s) => String(s.stationCode ?? '').trim())
      .filter(Boolean);
    const fromIdx = codes.findIndex((c) => c === fromCode);
    const toIdx = codes.findIndex((c) => c === toCode);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) {
      return [];
    }

    const stationCodesInRoute = codes.slice(fromIdx, toIdx + 1);
    type ChartEntry = {
      chartOne: { time: string; dayOffset: number | null };
      chartTwo?: { time: string; dayOffset: number | null };
    };
    const chartTimesWithSecond =
      (await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        stationCodesInRoute,
      )) as unknown as Map<string, ChartEntry>;

    const result: Array<{
      stationCode: string;
      stationName: string;
      chartOneTime: string;
      chartOneDayOffset: number | null;
      chartTwoTime: string | null;
      chartTwoDayOffset: number | null;
    }> = [];

    for (let i = fromIdx; i <= toIdx; i++) {
      const stationCode = codes[i];
      const entry = chartTimesWithSecond.get(stationCode);
      if (!entry) continue;

      const stationName = String(list[i]?.stationName ?? stationCode).trim();
      result.push({
        stationCode,
        stationName,
        chartOneTime: entry.chartOne.time,
        chartOneDayOffset: entry.chartOne.dayOffset,
        chartTwoTime: entry.chartTwo?.time ?? null,
        chartTwoDayOffset: entry.chartTwo?.dayOffset ?? 0,
      });
    }

    return result;
  }

  /**
   * Automatically subscribes the user for missing/uncovered journey legs (Use Case 1 & 2):
   * 1. If A->B is available but B->C is not available, subscribe for station B at B's chart time.
   * 2. If B->E is not available and chart for onward seats releases at remote station D, subscribe for station D.
   */
  async autoSubscribeForMissingLegs(params: {
    journeyRequestId: string;
    task: Pick<
      ChartTimeAvailabilityTask,
      | 'trainNumber'
      | 'trainName'
      | 'fromStationCode'
      | 'toStationCode'
      | 'journeyDate'
      | 'trainStartDate'
    >;
    result: Service2CheckResult;
    contact?: { email?: string | null; mobile?: string | null } | null;
  }): Promise<{ createdTaskIds: string[] }> {
    const { journeyRequestId, task, result, contact } = params;
    const email = contact?.email?.trim() || undefined;
    const mobile = contact?.mobile?.trim() || undefined;

    if (!email && !mobile) {
      return { createdTaskIds: [] };
    }

    const plan = result.openAiBookingPlan ?? [];
    const stationScheduleList = result.trainSchedule?.stationList;

    const coverage = this.notificationService.extractJourneyLegCoverage({
      fromStationCode: task.fromStationCode,
      toStationCode: task.toStationCode,
      plan,
      stationScheduleList,
    });

    const uncoveredList = coverage.filter(
      (c): c is Extract<JourneyLegCoverage, { type: 'no_ticket' }> =>
        c.type === 'no_ticket',
    );

    if (uncoveredList.length === 0) {
      return { createdTaskIds: [] };
    }

    const createdTaskIds: string[] = [];
    const journeyDateStr =
      task.journeyDate instanceof Date
        ? task.journeyDate.toISOString().slice(0, 10)
        : String(task.journeyDate).slice(0, 10);

    let classCode = '3A';
    try {
      const origReq = await this.prisma.journeyMonitoringRequest.findUnique({
        where: { id: journeyRequestId },
      });
      if (origReq?.classCode) classCode = origReq.classCode;
    } catch {
      // ignore
    }

    for (const unc of uncoveredList) {
      const bStation = unc.fromCode;
      const eStation = unc.toCode;

      let targetStation = bStation;

      try {
        const meta = await this.chartTime.getChartMetaForTrainStation(
          task.trainNumber,
          bStation,
        );

        const remoteD =
          meta?.chartNextRemoteStation ||
          meta?.chartRemoteStation ||
          (result.composition?.nextRemote &&
          result.composition.nextRemote.trim().toUpperCase() !== bStation
            ? result.composition.nextRemote
            : undefined) ||
          (result.composition?.remote &&
          result.composition.remote.trim().toUpperCase() !== bStation
            ? result.composition.remote
            : undefined);

        if (remoteD) {
          targetStation = remoteD.trim().toUpperCase();
        }
      } catch {
        // fallback to bStation
      }

      // Avoid self-recursion if task already covers this exact sub-segment
      if (
        task.fromStationCode.trim().toUpperCase() === targetStation &&
        task.toStationCode.trim().toUpperCase() ===
          eStation.trim().toUpperCase()
      ) {
        continue;
      }

      const existingTask =
        await this.prisma.chartTimeAvailabilityTask.findFirst({
          where: {
            trainNumber: task.trainNumber,
            stationCode: targetStation,
            fromStationCode: targetStation,
            toStationCode: eStation,
            journeyDate: new Date(journeyDateStr),
            contact: {
              OR: [
                ...(email ? [{ email }] : []),
                ...(mobile ? [{ mobile }] : []),
              ],
            },
          },
        });

      if (existingTask) {
        continue;
      }

      try {
        const createRes = await this.createJourneyTasks({
          trainNumber: task.trainNumber,
          trainName: task.trainName || undefined,
          fromStationCode: targetStation,
          toStationCode: eStation,
          journeyDate: journeyDateStr,
          classCode,
          email,
          mobile,
          stationCodesToMonitor: [targetStation],
        });

        if (createRes.tasks?.length > 0) {
          createdTaskIds.push(...createRes.tasks.map((t) => t.id));
        }
      } catch (createErr) {
        console.warn(
          `[journey] autoSubscribeForMissingLegs failed for train=${task.trainNumber} targetStation=${targetStation}:`,
          createErr instanceof Error ? createErr.message : String(createErr),
        );
      }
    }

    return { createdTaskIds };
  }
}
