import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { IrctcService } from '../irctc/irctc.service';
import { Service2Service } from '../service2/service2.service';
import moment from 'moment-timezone';

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

    const schedule = await this.irctc.getTrainSchedule(trainNumber);
    if (!schedule?.stationList?.length) {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- ChartTimeService method; cross-file inference can fail
    const chartTimesWithSecond =
      (await this.chartTime.getChartTimesWithSecondChartForTrain(
        trainNumber,
        stationsToProcess,
      )) as Map<string, ChartEntry>;

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

    const journeyMonitoringRequest =
      await this.prisma.journeyMonitoringRequest.create({
        data: {
          monitoringContactId: monitoringContactId ?? null,
          trainNumber,
          fromStationCode: fromCode,
          toStationCode: toCode,
          journeyDate,
          classCode,
        },
      });
    const journeyRequestId = journeyMonitoringRequest.id;

    const tasks: Array<{
      id: string;
      stationCode: string;
      chartAt: string;
      status: string;
    }> = [];

    const createAndMaybeRun = async (stCode: string, chartAt: Date) => {
      const task = await this.prisma.chartTimeAvailabilityTask.create({
        data: {
          journeyRequestId,
          trainNumber,
          trainName: params.trainName ?? schedule.trainName,
          fromStationCode: fromCode,
          toStationCode: toCode,
          stationCode: stCode,
          journeyDate,
          classCode,
          chartAt,
          status: 'pending',
        },
      });
      tasks.push({
        id: task.id,
        stationCode: task.stationCode,
        chartAt: task.chartAt.toISOString(),
        status: task.status,
      });
      if (chartAt <= now) {
        await this.runTask(task.id);
        const updated = await this.prisma.chartTimeAvailabilityTask.findUnique({
          where: { id: task.id },
        });
        if (updated) {
          const i = tasks.findIndex((t) => t.id === task.id);
          if (i >= 0) tasks[i].status = updated.status;
        }
      }
    };

    for (const stationCode of stationsToProcess) {
      const entry = chartTimesWithSecond.get(stationCode);
      if (!entry) continue;

      const chartAt1 = buildChartAt(journeyDate, entry.chartOne);
      await createAndMaybeRun(stationCode, chartAt1);

      if (entry.chartTwo) {
        const chartAt2 = buildChartAtWithDayOffset(
          journeyDate,
          entry.chartTwo.time,
          entry.chartTwo.dayOffset,
        );
        await createAndMaybeRun(stationCode, chartAt2);
      }
    }

    if (tasks.length === 0) {
      throw new Error(
        'No chart times found for stations in this route. Add chart times (e.g. train 29251, NDLS, 19:54) first.',
      );
    }

    if (email || mobile) {
      await this.prisma.journeyMonitorContact.create({
        data: {
          journeyRequestId,
          email: email || null,
          mobile: mobile || null,
        },
      });
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
    // Current datetime in IST (Asia/Kolkata) for chartAt comparison
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- moment-timezone types
    const now: Date = moment().tz('Asia/Kolkata').toDate();
    console.log('running due tasks', now.toISOString());
    const due = await this.prisma.chartTimeAvailabilityTask.findMany({
      where: {
        chartAt: { lte: now },
        status: 'pending',
      },
      orderBy: { chartAt: 'asc' },
      take: 20,
    });

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

    const schedule = await this.irctc.getTrainSchedule(trainNumber);
    if (!schedule?.stationList?.length) {
      return [];
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
      return [];
    }

    const stationCodesInRoute = codes.slice(fromIdx, toIdx + 1);
    type ChartEntry = {
      chartOne: string;
      chartTwo?: { time: string; dayOffset: number };
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- ChartTimeService method; cross-file inference can fail
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
