import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { IrctcService } from '../irctc/irctc.service';
import { Service2Service } from '../service2/service2.service';
import { NotificationService } from '../notification/notification.service';
import { DateTime } from 'luxon';

/**
 * Builds chartAt (Date) from journey date and HH:MM chart time (local).
 */
function buildChartAt(journeyDate: Date, chartTimeLocal: string): Date {
  const [y, mo, d] = journeyDate
    .toISOString()
    .slice(0, 10)
    .split('-')
    .map(Number);
  const [h, min] = chartTimeLocal.split(':').map(Number);
  return new Date(y, mo - 1, d, h ?? 0, min ?? 0, 0, 0);
}

/**
 * Builds chartAt for journeyDate + dayOffset days + HH:MM (for chart two).
 */
function buildChartAtWithDayOffset(
  journeyDate: Date,
  chartTimeLocal: string,
  dayOffset: number,
): Date {
  const base = new Date(journeyDate);
  base.setDate(base.getDate() + dayOffset);
  const [h, min] = chartTimeLocal.split(':').map(Number);
  base.setHours(h ?? 0, min ?? 0, 0, 0);
  return base;
}

@Injectable()
export class JourneyTaskService {
  constructor(
    private prisma: PrismaService,
    private chartTime: ChartTimeService,
    private irctc: IrctcService,
    private service2: Service2Service,
    private notificationService: NotificationService,
  ) {}

  /**
   * Create one task per station (and per chart one/chart two) in the route, scheduled at each chart time.
   * If stationCodesToMonitor is provided, only creates tasks for those stations.
   * If chart time is already past, run Browser Use immediately and mark task completed.
   * Returns journeyRequestId and list of tasks.
   */
  async createJourneyTasks(params: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode: string;
    stationCodesToMonitor?: string[];
    email?: string;
    mobile?: string;
  }): Promise<{
    journeyRequestId: string;
    tasks: Array<{
      id: string;
      stationCode: string;
      chartAt: string;
      status: string;
    }>;
  }> {
    const journeyDate = new Date(params.journeyDate);
    const fromCode = params.fromStationCode.trim().toUpperCase();
    const toCode = params.toStationCode.trim().toUpperCase();
    const trainNumber = params.trainNumber.trim();
    const classCode = (params.classCode || '3A').trim().toUpperCase();
    const now = new Date();
    const stationCodesToMonitor = params.stationCodesToMonitor?.map((c) =>
      String(c).trim().toUpperCase(),
    );
    const email = params.email?.trim() || undefined;
    const mobile = params.mobile?.trim() || undefined;

    const scheduleResult = await this.irctc.getTrainSchedule(trainNumber);
    if (!scheduleResult.ok) {
      if (scheduleResult.reason === 'maintenance') {
        throw new Error(
          'IRCTC is temporarily unavailable (maintenance or downtime). Please try again later.',
        );
      }
      throw new Error(
        'Train schedule not found. Please try again after the route is loaded.',
      );
    }
    const schedule = scheduleResult.schedule;
    if (!schedule.stationList?.length) {
      throw new Error(
        'Train schedule not found. Please try again after the route is loaded.',
      );
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
      throw new Error(
        'From/to stations not found on this train route or invalid order.',
      );
    }

    const stationCodesInRoute = codes.slice(fromIdx, toIdx + 1);
    const stationsToProcess =
      stationCodesToMonitor != null && stationCodesToMonitor.length > 0
        ? stationCodesInRoute.filter((c) => stationCodesToMonitor.includes(c))
        : stationCodesInRoute;

    type ChartEntry = {
      chartOne: string;
      chartTwo?: { time: string; dayOffset: number };
    };
    let chartTimesWithSecond =
      (await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        stationsToProcess,
      )) as Map<string, ChartEntry>;

    const refreshChartTimesMap = async () => {
      chartTimesWithSecond =
        (await this.chartTime.getChartTimesWithSecondChartForTrain(
          trainNumber,
          stationsToProcess,
        )) as Map<string, ChartEntry>;
    };

    const routeHasAnyChartTime = () =>
      stationsToProcess.some((s) => chartTimesWithSecond.get(s));

    const fetchCompositionForStations = async (
      stationCodes: string[],
      dateForComposition: Date,
      logLabel: string,
    ) => {
      const jDateStr = dateForComposition.toISOString().slice(0, 10);
      console.log(
        `[createJourneyTasks] trainComposition jDate=${jDateStr} label=${logLabel} stationCount=${stationCodes.length}`,
      );
      for (const stCode of stationCodes) {
        try {
          await this.irctc.getTrainComposition({
            trainNo: trainNumber,
            jDate: jDateStr,
            boardingStation: stCode,
          });
        } catch (err) {
          console.warn(
            `Chart time fetch failed for ${trainNumber} @ ${stCode} (${jDateStr}):`,
            err instanceof Error ? err.message : err,
          );
        }
      }
      await refreshChartTimesMap();
      const covered = stationsToProcess.filter((s) =>
        chartTimesWithSecond.get(s),
      ).length;
      console.log(
        `[createJourneyTasks] after ${logLabel} (jDate=${jDateStr}): stationsWithChartTimes=${covered}/${stationsToProcess.length}`,
      );
    };

    // If DB has no chart times for some stations, fetch from train composition API and persist
    const missingStations = stationsToProcess.filter(
      (s) => !chartTimesWithSecond.get(s),
    );
    if (missingStations.length > 0) {
      await fetchCompositionForStations(
        missingStations,
        journeyDate,
        'journey_date_missing_stations',
      );
    }

    // IRCTC composition is often keyed to the train's run date; if nothing was stored for this journey date, try previous calendar day
    const hadChartTimesBeforePrevDay = routeHasAnyChartTime();
    let attemptedPreviousDayFallback = false;
    let pickedUpChartTimesFromPreviousDate = false;

    if (!hadChartTimesBeforePrevDay) {
      const prevRunDate = new Date(journeyDate);
      prevRunDate.setDate(prevRunDate.getDate() - 1);
      const prevStr = prevRunDate.toISOString().slice(0, 10);
      attemptedPreviousDayFallback = true;
      console.log(
        `[createJourneyTasks] no chart times for journey date ${params.journeyDate}; trying previous calendar day jDate=${prevStr}`,
      );
      await fetchCompositionForStations(
        stationsToProcess,
        prevRunDate,
        'previous_day_fallback',
      );
      pickedUpChartTimesFromPreviousDate = routeHasAnyChartTime();
      console.log(
        `[createJourneyTasks] previous_day_fallback result: pickedUpFromPreviousDate=${pickedUpChartTimesFromPreviousDate}`,
      );
    } else {
      console.log(
        `[createJourneyTasks] skipped previous_day_fallback (route already had chart times for journey context; journeyDate=${params.journeyDate})`,
      );
    }

    console.log('[createJourneyTasks] chart resolution summary', {
      trainNumber,
      journeyDate: params.journeyDate,
      attemptedPreviousDayFallback,
      pickedUpChartTimesFromPreviousDate,
    });

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

    for (const stationCode of stationsToProcess) {
      const entry = chartTimesWithSecond.get(stationCode);
      if (!entry) continue;

      taskSpecs.push({
        stationCode,
        chartAt: buildChartAt(journeyDate, entry.chartOne),
      });

      if (entry.chartTwo) {
        taskSpecs.push({
          stationCode,
          chartAt: buildChartAtWithDayOffset(
            journeyDate,
            entry.chartTwo.time,
            entry.chartTwo.dayOffset,
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

        if (email || mobile) {
          await tx.journeyMonitorContact.create({
            data: {
              journeyRequestId: jid,
              email: email || null,
              mobile: mobile || null,
            },
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
  async runTask(taskId: string): Promise<void> {
    const task = await this.prisma.chartTimeAvailabilityTask.findUnique({
      where: { id: taskId },
    });
    if (!task || task.status !== 'pending') return;

    await this.prisma.chartTimeAvailabilityTask.update({
      where: { id: taskId },
      data: { status: 'running' },
    });

    const journeyDateStr = task.journeyDate.toISOString().slice(0, 10);

    try {
      console.log('running task', task.id);
      console.log('task', {
        trainNumber: task.trainNumber,
        stationCode: task.stationCode,
        journeyDate: journeyDateStr,
        classCode: task.classCode,
        destinationStation: task.toStationCode,
      });
      const result = await this.service2.check({
        trainNumber: task.trainNumber,
        stationCode: task.stationCode,
        journeyDate: journeyDateStr,
        classCode: task.classCode,
        destinationStation: task.toStationCode,
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
    >`SELECT id FROM "ChartTimeAvailabilityTask"
      WHERE chart_at <= (NOW() AT TIME ZONE 'Asia/Kolkata')
        AND status = 'pending'
      ORDER BY chart_at ASC
      LIMIT 20`;
    console.log('due', due);
    for (const task of due) {
      await this.runTask(task.id);
    }
    return due.length;
  }

  async getTasksByJourneyRequestId(journeyRequestId: string) {
    return this.prisma.chartTimeAvailabilityTask.findMany({
      where: { journeyRequestId },
      orderBy: { chartAt: 'asc' },
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
      chartTwoTime: string | null;
      chartTwoDayOffset: number;
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
      chartOne: string;
      chartTwo?: { time: string; dayOffset: number };
    };
    const chartTimesWithSecond =
      (await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        stationCodesInRoute,
      )) as Map<string, ChartEntry>;

    const result: Array<{
      stationCode: string;
      stationName: string;
      chartOneTime: string;
      chartTwoTime: string | null;
      chartTwoDayOffset: number;
    }> = [];

    for (let i = fromIdx; i <= toIdx; i++) {
      const stationCode = codes[i];
      const entry = chartTimesWithSecond.get(stationCode);
      if (!entry) continue;

      const stationName = String(list[i]?.stationName ?? stationCode).trim();
      result.push({
        stationCode,
        stationName,
        chartOneTime: entry.chartOne,
        chartTwoTime: entry.chartTwo?.time ?? null,
        chartTwoDayOffset: entry.chartTwo?.dayOffset ?? 0,
      });
    }

    return result;
  }
}
