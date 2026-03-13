import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { IrctcService } from '../irctc/irctc.service';
import { BrowserUseService } from '../browser-use/browser-use.service';
import { randomUUID } from 'crypto';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'http://localhost:3009';

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

@Injectable()
export class JourneyTaskService {
  constructor(
    private prisma: PrismaService,
    private chartTime: ChartTimeService,
    private irctc: IrctcService,
    private browserUse: BrowserUseService,
  ) {}

  /**
   * Create one task per station in the route (from origin to destination), scheduled at each station's chart time.
   * If chart time is already past for that date, run Browser Use immediately and mark task completed.
   * Returns journeyRequestId and list of tasks.
   */
  async createJourneyTasks(params: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode: string;
  }): Promise<{
    journeyRequestId: string;
    tasks: Array<{
      id: string;
      stationCode: string;
      chartAt: string;
      status: string;
    }>;
  }> {
    const journeyRequestId = randomUUID();
    const journeyDate = new Date(params.journeyDate);
    const fromCode = params.fromStationCode.trim().toUpperCase();
    const toCode = params.toStationCode.trim().toUpperCase();
    const trainNumber = params.trainNumber.trim();
    const classCode = (params.classCode || '3A').trim().toUpperCase();
    const now = new Date();

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
    const chartTimes = await this.chartTime.getChartTimesForTrain(
      trainNumber,
      stationCodesInRoute,
    );

    const tasks: Array<{
      id: string;
      stationCode: string;
      chartAt: string;
      status: string;
    }> = [];
    for (const stationCode of stationCodesInRoute) {
      const chartTimeLocal = chartTimes.get(stationCode);
      if (!chartTimeLocal) continue;

      const chartAt = buildChartAt(journeyDate, chartTimeLocal);
      const task = await this.prisma.chartTimeAvailabilityTask.create({
        data: {
          journeyRequestId,
          trainNumber,
          trainName: params.trainName ?? schedule.trainName,
          fromStationCode: fromCode,
          toStationCode: toCode,
          stationCode,
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
    }

    if (tasks.length === 0) {
      throw new Error(
        'No chart times found for stations in this route. Add chart times (e.g. train 29251, NDLS, 19:54) first.',
      );
    }

    return { journeyRequestId, tasks };
  }

  /**
   * Run a single ChartTimeAvailabilityTask (Browser Use availability check).
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

    try {
      const result = await this.browserUse.executeAvailabilityCheck({
        trainNumber: task.trainNumber,
        trainName: task.trainName ?? undefined,
        fromStationCode: task.stationCode,
        toStationCode: task.toStationCode,
        classCode: task.classCode,
        journeyDate: task.journeyDate.toISOString().slice(0, 10),
        callbackUrl: `${API_URL}/api/browser/webhook`,
      });

      const resultPayload: Record<string, unknown> =
        result.resultPayload != null
          ? (result.resultPayload as Record<string, unknown>)
          : {
              output: result.output,
              ...(result.steps && { steps: result.steps }),
            };
      if (result.resultPayload == null) {
        try {
          if (typeof result.output === 'string' && result.output.trim()) {
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            Object.assign(resultPayload, parsed);
          }
        } catch {
          // keep raw
        }
      }

      await this.prisma.chartTimeAvailabilityTask.update({
        where: { id: taskId },
        data: {
          status: result.status === 'success' ? 'completed' : 'failed',
          resultPayload: resultPayload as object,
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
   * Find tasks due (chartAt <= now) with status pending and run each.
   * Called by cron every minute.
   */
  async runDueTasks(): Promise<number> {
    const now = new Date();
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
}
