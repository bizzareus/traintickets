import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import {
  IrctcService,
  type TrainScheduleResponse,
} from '../irctc/irctc.service';
import { TrainCompositionService } from '../train-composition/train-composition.service';
import { Service2Service } from '../service2/service2.service';
import { NotificationService } from '../notification/notification.service';
import { DateTime } from 'luxon';
import {
  getTrainDoesNotRunOnDateError,
  parseJourneyYmdForValidation,
} from '../common/train-run-day.validation';

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

function chartAtIsDue(chartAt: Date, now = new Date()): boolean {
  const chartWall = DateTime.fromJSDate(chartAt, { zone: 'utc' }).toFormat(
    'yyyyMMddHHmmss',
  );
  const nowIstWall = DateTime.fromJSDate(now)
    .setZone('Asia/Kolkata')
    .toFormat('yyyyMMddHHmmss');
  return chartWall <= nowIstWall;
}

@Injectable()
export class JourneyTaskService {
  constructor(
    private prisma: PrismaService,
    private chartTime: ChartTimeService,
    private irctc: IrctcService,
    private trainComposition: TrainCompositionService,
    private service2: Service2Service,
    private notificationService: NotificationService,
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
    if (!resolvedTrainStartDate && jYmd) {
      if (dayCount > 1) {
        const boardDate = DateTime.fromISO(jYmd);
        resolvedTrainStartDate = boardDate
          .minus({ days: dayCount - 1 })
          .toISODate();
      } else {
        resolvedTrainStartDate = jYmd;
      }
    }

    const validationDate = resolvedTrainStartDate || jYmd;
    const runDayErr = getTrainDoesNotRunOnDateError(
      validationDate,
      schedule.trainRunsOn,
    );
    if (runDayErr) {
      // If we inferred or used a trainStartDate that is different from boarding date
      if (resolvedTrainStartDate && resolvedTrainStartDate !== jYmd) {
        runDayErr.message = `This train does not start its journey on ${resolvedTrainStartDate} (the date it would have to start to reach your boarding station ${fromCode} on ${jYmd}).`;
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
        jYmd,
        trainStartDate: resolvedTrainStartDate || jYmd,
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
    const email = params.email?.trim() || undefined;
    const mobile = params.mobile?.trim() || undefined;
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
          await this.prisma.monitoringContact.update({
            where: { id: existing.id },
            data: { email },
          });
        }
        if (mobile && existing.mobile !== mobile) {
          await this.prisma.monitoringContact.update({
            where: { id: existing.id },
            data: { mobile },
          });
        }
      } else {
        const created = await this.prisma.monitoringContact.create({
          data: { email: email || null, mobile: mobile || null },
        });
        monitoringContactId = created.id;
      }
    }

    const taskSpecs: Array<{ stationCode: string; chartAt: Date }> = [];
    const trainName = params.trainName ?? schedule.trainName;

    const entry = chartTimesWithSecond.get(fromCode);
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
    }

    if (taskSpecs.length === 0) {
      throw new Error(
        'No chart times found for stations in this route. Add chart times (e.g. train 29251, NDLS, 19:54) first.',
      );
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

    for (const t of tasks) {
      const chartAt = new Date(t.chartAt);
      if (chartAtIsDue(chartAt, now)) {
        await this.runTask(t.id);
        const updated = await this.prisma.chartTimeAvailabilityTask.findUnique({
          where: { id: t.id },
        });
        if (updated) {
          const i = tasks.findIndex((x) => x.id === t.id);
          if (i >= 0) tasks[i].status = updated.status;
        }
      }
    }

    return { journeyRequestId, tasks };
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

    if (task.status === 'pending') {
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: 'running',
          retryCount: { increment: 1 },
          lockedAt: new Date(),
          completedAt: null,
          lastError: null,
        },
      });
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
      const result = await this.service2.check({
        trainNumber: task.trainNumber,
        stationCode: task.stationCode,
        journeyDate: journeyDateStr,
        trainStartDate: trainStartDateStr,
        destinationStation: task.toStationCode,
        triggerSource: 'cron',
      });

      console.log('result', result);

      const status = result.status === 'success' ? 'completed' : 'failed';
      if (
        status === 'failed' &&
        attemptNumber < MAX_CHART_TASK_ATTEMPTS &&
        isRetryableChartTaskFailure(result)
      ) {
        await this.scheduleTaskRetry(taskId, result, attemptNumber);
        return;
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
        },
      });

      if (status === 'completed') {
        const contact = await this.prisma.journeyMonitorContact.findUnique({
          where: { journeyRequestId: task.journeyRequestId },
        });
        console.log('contact', contact);
        if (contact && (contact.email || contact.mobile)) {
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
        await this.scheduleTaskRetry(taskId, { error: message }, attemptNumber);
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
        },
      });
    }
  }

  private async scheduleTaskRetry(
    taskId: string,
    resultPayload: object,
    attemptNumber: number,
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
  async runDueTasks(): Promise<number> {
    // chartAt is stored as an IST wall-clock timestamp in Postgres.
    // Operational timestamps (next_run_at/locked_at) use DB NOW().
    const istNow = DateTime.now().setZone('Asia/Kolkata');
    console.log(
      'running due tasks',
      istNow.toFormat('yyyy-MM-dd HH:mm:ss'),
      'IST',
    );

    const due = await this.prisma.$queryRaw<
      Array<{ id: string; retry_count: number }>
    >`UPDATE "ChartTimeAvailabilityTask"
      SET status = 'running',
          locked_at = NOW(),
          retry_count = retry_count + 1,
          last_error = NULL
      WHERE id IN (
        SELECT id FROM "ChartTimeAvailabilityTask"
        WHERE completed_at IS NULL
          AND (
            (
              status = 'pending'
              AND chart_at <= (NOW() AT TIME ZONE 'Asia/Kolkata')
              AND (next_run_at IS NULL OR next_run_at <= NOW())
            )
            OR (
              status = 'running'
              AND (
                locked_at IS NULL
                OR locked_at <= NOW() - INTERVAL '10 minutes'
              )
            )
          )
        ORDER BY COALESCE(next_run_at, chart_at) ASC
        LIMIT 20
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, retry_count`;
    console.log('marked as running', due);
    for (const task of due) {
      await this.runTask(task.id, true);
    }
    return due.length;
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
}
