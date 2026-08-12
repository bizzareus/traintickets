import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Prisma, ChartTimeAvailabilityTask } from '@prisma/client';
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
  return /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|network|temporarily unavailable|unable to contact rail systems|IRCTC schedule service unavailable/i.test(
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

/**
 * Map a Search-Route alternate-paths result onto the Service2CheckResult shape the
 * alert task and notification already consume, so the seat alert can run on the
 * same engine the homepage uses (ConfirmTkt availability + IRCTC schedule) instead
 * of an OpenAI call. Confirmed legs become the booking plan (one filled slot per
 * route leg, `{}` for a non-bookable hop). When no confirmed leg exists we report a
 * `not_prepared_yet` status so the task keeps polling on its existing schedule.
 */
function alternatePathsToCheckResult(
  alt: FindAlternatePathsResult,
): Service2CheckResult {
  const confirmedLegs = alt.legs.filter((l) => l.segmentKind === 'confirmed');

  if (confirmedLegs.length === 0) {
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

function chartAtIsDue(chartAt: Date, now = new Date()): boolean {
  return chartAt.getTime() <= now.getTime();
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
      if (resolvedTrainStartDate && resolvedTrainStartDate !== resolvedBoardingDate) {
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
    opts?: { validatedContext?: JourneyValidContext },
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
    const now = new Date();
    const email = params.email?.trim().toLowerCase() || undefined;
    // Normalize to E.164 (add 91 prefix for 10-digit Indian numbers) so the
    // DB always stores a consistent format regardless of what the client sent.
    const rawMobile = params.mobile?.trim() || undefined;
    const mobile = rawMobile ? toE164(rawMobile) : undefined;
    const trainStartDate = new Date(validation.context.trainStartDate);

    const chartTimesWithSecond =
      await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        [fromCode],
        trainStartDate,
      );

    let monitoringContactId: string | undefined;
    if (email || mobile) {
      const existing = await this.prisma.monitoringContact.findFirst({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(mobile ? [{ mobile }] : []),
          ].filter((o) => Object.keys(o).length > 0),
        },
      });
      if (existing) {
        monitoringContactId = existing.id;
        if (email && existing.email !== email) {
          try {
            await this.prisma.monitoringContact.update({
              where: { id: existing.id },
              data: { email },
            });
          } catch (err: unknown) {
            // Ignore unique constraint violation if another contact already has this email
            const errObj =
              err != null && typeof err === 'object'
                ? (err as Record<string, unknown>)
                : null;
            const causeKind =
              errObj?.cause != null &&
              typeof errObj.cause === 'object' &&
              'kind' in errObj.cause
                ? (errObj.cause as Record<string, unknown>).kind
                : undefined;
            const isUniqueViolation =
              errObj?.code === 'P2002' ||
              causeKind === 'UniqueConstraintViolation';
            if (!isUniqueViolation) throw err;
          }
        }
        if (mobile && existing.mobile !== mobile) {
          try {
            await this.prisma.monitoringContact.update({
              where: { id: existing.id },
              data: { mobile },
            });
          } catch (err: unknown) {
            // Ignore unique constraint violation if another contact already has this mobile
            const errObj =
              err != null && typeof err === 'object'
                ? (err as Record<string, unknown>)
                : null;
            const causeKind =
              errObj?.cause != null &&
              typeof errObj.cause === 'object' &&
              'kind' in errObj.cause
                ? (errObj.cause as Record<string, unknown>).kind
                : undefined;
            const isUniqueViolation =
              errObj?.code === 'P2002' ||
              causeKind === 'UniqueConstraintViolation';
            if (!isUniqueViolation) throw err;
          }
        }
      } else {
        try {
          const created = await this.prisma.monitoringContact.create({
            data: { email: email || null, mobile: mobile || null },
          });
          monitoringContactId = created.id;
        } catch (err: unknown) {
          // Another row with the same email or mobile was inserted concurrently
          // (or the client retried). Recover gracefully by finding the conflict.
          const errObj =
            err != null && typeof err === 'object'
              ? (err as Record<string, unknown>)
              : null;
          const causeKind =
            errObj?.cause != null &&
            typeof errObj.cause === 'object' &&
            errObj.cause !== null &&
            'kind' in errObj.cause
              ? (errObj.cause as Record<string, unknown>).kind
              : undefined;
          const isUniqueViolation =
            errObj?.code === 'P2002' ||
            causeKind === 'UniqueConstraintViolation';
          if (!isUniqueViolation) throw err;
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
        (s) => String(s.stationCode ?? '').trim().toUpperCase() === fromCode,
      );
      const dayCount = stationDayCount(boardingStn);
      const rawTime =
        boardingStn?.departureTime ||
        boardingStn?.arrivalTime ||
        '08:00';
      const timeMatch = String(rawTime).trim().match(/^(\d{1,2}):(\d{2})/);
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

    const { journeyRequestId, tasks } = await this.prisma.$transaction(
      async (tx) => {
        const jmr = await tx.journeyMonitoringRequest.create({
          data: {
            monitoringContactId: monitoringContactId ?? null,
            trainNumber,
            fromStationCode: fromCode,
            toStationCode: toCode,
            journeyDate,
            classCode,
          },
        });
        const jid = jmr.id;

        await tx.journeyMonitorContact.create({
          data: {
            journeyRequestId: jid,
            email: email || null,
            mobile: mobile || null,
          },
        });

        const createdTasks: Array<{
          id: string;
          stationCode: string;
          chartAt: string;
          status: string;
        }> = [];
        for (const spec of taskSpecs) {
          const task = await tx.chartTimeAvailabilityTask.create({
            data: {
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
            },
          });
          createdTasks.push({
            id: task.id,
            stationCode: task.stationCode,
            chartAt: task.chartAt.toISOString(),
            status: task.status,
          });
        }

        return { journeyRequestId: jid, tasks: createdTasks };
      },
      { timeout: 30_000 },
    );

    if (needsAsyncHydration) {
      setImmediate(() => {
        void this.asyncHydrateChartTimeAndUpdateTasks(
          trainNumber,
          fromCode,
          trainStartDate,
          journeyRequestId,
        );
      });
    }

    // Eagerly run any already-due tasks in the BACKGROUND so POST /journey returns
    // as soon as the alert is persisted (the durable transaction above). This is
    // fire-and-forget: the scheduled runDueTasks() sweep is the safety net, so a
    // failure here only delays the first check to the next tick — it never loses
    // the alert or blocks the user. Returned tasks stay 'pending' (queued ack).
    const dueTaskIds = tasks
      .filter((t) => chartAtIsDue(new Date(t.chartAt), now))
      .map((t) => t.id);
    if (dueTaskIds.length > 0) {
      void this.runTasksInBackground(dueTaskIds, journeyRequestId);
    }

    return { journeyRequestId, tasks };
  }

  /**
   * Fire-and-forget runner for the initial check of already-due tasks, detached
   * from the POST /journey response. Sequential; logs and swallows errors (never
   * throws) — the scheduled runDueTasks() sweep still covers anything that fails.
   */
  private async runTasksInBackground(
    taskIds: string[],
    journeyRequestId: string,
  ): Promise<void> {
    for (const id of taskIds) {
      try {
        await this.runTask(id);
      } catch (err) {
        console.error(
          `[journey] background task run failed journeyRequestId=${journeyRequestId} taskId=${id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
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

      const pendingTasks =
        await this.prisma.chartTimeAvailabilityTask.findMany({
          where: {
            journeyRequestId,
            stationCode: code,
            status: 'pending',
          },
          orderBy: { createdAt: 'asc' },
        });

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
  async runTask(taskId: string, force = false): Promise<void> {
    const task = await this.prisma.chartTimeAvailabilityTask.findUnique({
      where: { id: taskId },
    });
    if (!task || (!force && task.status !== 'pending')) return;

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
      // manual offset loop here, and no OpenAI call.
      const alt = await this.bookingV2Service.findAlternatePaths({
        trainNumber: task.trainNumber,
        from: task.fromStationCode,
        to: task.toStationCode,
        date: journeyDateStr,
        avlClasses: subscribedClass ? [subscribedClass] : undefined,
        quota: 'GN',
      });
      const result = alternatePathsToCheckResult(alt);

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

          let alternativeTrains: BestTrainCandidateResult[] | undefined;
          const hasTickets = hasBookablePlanForNotification(result);

          if (!hasTickets) {
            if (this.alternativeSearchTaskService) {
              try {
                await this.alternativeSearchTaskService.enqueueTask({
                  journeyTaskId: task.id,
                  trainNumber: task.trainNumber,
                  trainName: task.trainName ?? undefined,
                  fromStationCode: task.fromStationCode,
                  toStationCode: task.toStationCode,
                  journeyDate: task.journeyDate,
                  email: contact.email || undefined,
                  mobile: contact.mobile || undefined,
                });
              } catch (altErr) {
                console.error(
                  'Failed to enqueue alternative search task',
                  altErr,
                );
              }
            }

            try {
              const req = await this.prisma.journeyMonitoringRequest.findUnique(
                {
                  where: { id: task.journeyRequestId },
                },
              );
              if (req) {
                const classCode = req.classCode.toUpperCase();
                const isAc = !['SL', '2S', 'GN', 'FC'].includes(classCode);
                const bestResult = await this.bookingV2Service.findBestTrains({
                  from: task.fromStationCode,
                  to: task.toStationCode,
                  date: task.journeyDate.toISOString().slice(0, 10),
                  quota: 'GN',
                  acOnly: isAc,
                  maxTrains: 3,
                });
                alternativeTrains = bestResult.results.slice(0, 3);
              }
            } catch (err) {
              console.error('Failed to find best alternative trains', err);
            }
          }

          void this.notificationService
            .notifyUser({
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
            })
            .then((status) => {
              const data: {
                emailNotifiedAt?: Date;
                whatsappNotifiedAt?: Date;
              } = {};
              if (status.emailSent) data.emailNotifiedAt = new Date();
              if (status.whatsappSent) data.whatsappNotifiedAt = new Date();
              if (Object.keys(data).length > 0) {
                return this.prisma.chartTimeAvailabilityTask.update({
                  where: { id: taskId },
                  data,
                });
              }
            })
            .catch((e) => console.error('Notification failed', e));
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
            SELECT id FROM "ChartTimeAvailabilityTask"
            WHERE completed_at IS NULL
              AND (
                (
                  status = 'pending'
                  AND chart_at <= (NOW() AT TIME ZONE 'utc')
                  AND (next_run_at IS NULL OR next_run_at <= (NOW() AT TIME ZONE 'utc'))
                )
                OR (
                  status = 'running'
                  AND (
                    locked_at IS NULL
                    OR locked_at <= (NOW() AT TIME ZONE 'utc') - INTERVAL '10 minutes'
                  )
                )
              )
            ORDER BY COALESCE(next_run_at, chart_at) ASC
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

      const existingTask =
        await this.prisma.chartTimeAvailabilityTask.findFirst({
          where: {
            trainNumber: task.trainNumber,
            stationCode: targetStation,
            journeyDate: new Date(journeyDateStr),
            journeyRequestId,
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
