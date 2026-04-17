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
 * Builds chartAt (Date) from journey date and HH:MM chart time (local).
 * Aligns with Asia/Kolkata (IST) zone for absolute moment calculation.
 */
function buildChartAt(journeyDate: Date, chartTimeLocal: string): Date {
  const jStr = journeyDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const [h, min] = chartTimeLocal.split(':').map(Number);
  return DateTime.fromFormat(`${jStr} ${h}:${min}`, 'yyyy-MM-dd H:m', {
    zone: 'Asia/Kolkata',
  }).toJSDate();
}

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
    const stationCodesToMonitor = params.stationCodesToMonitor?.map((c) =>
      String(c).trim().toUpperCase(),
    );

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

    const boardingStn = schedule.stationList.find((s) => s.stationCode === fromCode);
    const dayCount = (boardingStn as any)?.dayCount ?? 1;
    let resolvedTrainStartDate = startYmd;
    if (!resolvedTrainStartDate && jYmd) {
      if (dayCount > 1) {
        const boardDate = DateTime.fromISO(jYmd);
        resolvedTrainStartDate = boardDate.minus({ days: dayCount - 1 }).toISODate();
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

    const stationCodesInRoute = codes.slice(fromIdx, toIdx + 1);

    if (stationCodesToMonitor != null && stationCodesToMonitor.length > 0) {
      const missing = stationCodesToMonitor.filter(
        (c) => !stationCodesInRoute.includes(c),
      );
      if (missing.length > 0) {
        return {
          valid: false,
          errors: [
            {
              code: 'STATION_NOT_ON_ROUTE',
              message: `These stations are not on the route segment: ${missing.join(', ')}.`,
            },
          ],
        };
      }
    }

    const stationsToProcess =
      stationCodesToMonitor != null && stationCodesToMonitor.length > 0
        ? stationCodesInRoute.filter((c) => stationCodesToMonitor.includes(c))
        : stationCodesInRoute;

    if (stationsToProcess.length === 0) {
      return {
        valid: false,
        errors: [
          {
            code: 'NO_STATIONS_TO_MONITOR',
            message:
              'No stations to monitor on this route for the selection. Check from/to and optional station list.',
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
        stationsToProcess,
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
   * Create one task per station (and per chart one/chart two) in the route, scheduled at each chart time.
   * If stationCodesToMonitor is provided, only creates tasks for those stations.
   * If chart time is already past, run Browser Use immediately and mark task completed.
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
    const { schedule, fromCode, toCode, trainNumber, stationsToProcess } =
      validation.context;

    const journeyDate = new Date(params.journeyDate.trim());
    const classCode = (params.classCode || '3A').trim().toUpperCase();
    const now = new Date();
    const email = params.email?.trim() || undefined;
    const mobile = params.mobile?.trim() || undefined;

    const chartTimesWithSecond = new Map<string, any>();
    const resolvedStations = new Set<string>();
    const stationsToQueue = [fromCode];
    const hydrationDate = validation.context.trainStartDate;

    // Follow the chain of charting stations starting from the boarding station
    while (stationsToQueue.length > 0) {
      const current = stationsToQueue.shift()!;
      if (resolvedStations.has(current)) continue;

      const resMap = await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        [current],
        hydrationDate,
      );
      const entry = resMap.get(current);
      if (entry) {
        chartTimesWithSecond.set(current, entry);
        resolvedStations.add(current);

        const next = entry.chartNextRemoteStation?.trim().toUpperCase();
        if (next) {
          // Check if 'next' is correctly ordered on our route segment AND before the destination.
          // stationsToProcess contains the segment [fromCode, ..., toCode].
          const nextIdx = stationsToProcess.indexOf(next);
          // if nextIdx is >= 0 (on segment) AND < stationsToProcess.length - 1 (before destination)
          if (nextIdx >= 0 && nextIdx < stationsToProcess.length - 1) {
            if (!resolvedStations.has(next)) {
              stationsToQueue.push(next);
            }
          }
        }
      } else {
        // If no chart info even after hydration, we can't chain further from this station.
        resolvedStations.add(current);
      }
    }

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

    const trainStartDate = new Date(validation.context.trainStartDate);

    for (const stationCode of stationsToProcess) {
      const entry = chartTimesWithSecond.get(stationCode);
      if (!entry) continue;

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
          const task = await (tx.chartTimeAvailabilityTask as any).create({
            data: {
              journeyRequestId: jid,
              trainNumber,
              trainName,
              fromStationCode: fromCode,
              toStationCode: toCode,
              stationCode: spec.stationCode,
              journeyDate,
              trainStartDate: new Date(validation.context.trainStartDate),
              classCode,
              chartAt: spec.chartAt,
              status: 'pending',
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
      if (chartAt <= now) {
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
    if (!task || (!force && task.status !== "pending")) return;

    if (task.status === "pending") {
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: { status: "running" },
      });
    }

    const journeyDateStr = task.journeyDate.toISOString().slice(0, 10);
    const trainStartDateStr = (task as any).trainStartDate
      ? (task as any).trainStartDate.toISOString().slice(0, 10)
      : journeyDateStr;

    try {
      console.log('running task', task.id);
      console.log('task', {
        trainNumber: task.trainNumber,
        stationCode: task.stationCode,
        journeyDate: journeyDateStr,
        trainStartDate: trainStartDateStr,
        classCode: task.classCode,
        destinationStation: task.toStationCode,
      });
      const result = await this.service2.check({
        trainNumber: task.trainNumber,
        stationCode: task.stationCode,
        journeyDate: journeyDateStr,
        trainStartDate: trainStartDateStr,
        classCode: task.classCode,
        destinationStation: task.toStationCode,
        triggerSource: 'cron',
      });

      console.log('result', result);

      const status = result.status === 'success' ? 'completed' : 'failed';
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status,
          resultPayload: result as object,
          completedAt: new Date(),
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
                classCode: task.classCode,
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
      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          resultPayload: { error: message } as object,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Find pending tasks whose chart time has arrived (chartAt <= now) and run each
   * by calling the Service2 check API internally to find available seats.
   * Called by cron every minute.
   */
  async runDueTasks(): Promise<number> {
    // chartAt is stored as IST wall-clock time.
    // Use raw SQL so Postgres converts NOW() to IST for an accurate comparison.
    const istNow = DateTime.now().setZone('Asia/Kolkata');
    console.log(
      'running due tasks',
      istNow.toFormat('yyyy-MM-dd HH:mm:ss'),
      'IST',
    );

    const due = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >`UPDATE "ChartTimeAvailabilityTask"
      SET status = 'running'
      WHERE id IN (
        SELECT id FROM "ChartTimeAvailabilityTask"
        WHERE chart_at <= NOW()
          AND status = 'pending'
        ORDER BY chart_at ASC
        LIMIT 20
      )
      RETURNING id`;
    console.log("marked as running", due);
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

  async getAllAlerts() {
    return (this.prisma.chartTimeAvailabilityTask as any).findMany({
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
