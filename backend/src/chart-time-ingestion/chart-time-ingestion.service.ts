import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { IrctcService } from '../irctc/irctc.service';
import { TrainCompositionService } from '../train-composition/train-composition.service';

const CHART_TASK_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
] as const;

type StationIngestionStatus = 'saved' | 'failed' | 'skipped';

type StationIngestionResult = {
  stationCode: string;
  stationName: string;
  status: StationIngestionStatus;
  error: string | null;
};

type RunIngestionParams = {
  trainNumber: string;
  journeyDate: string;
};

/** Max trains per `runIngestionBatch` / `POST .../run` (deduped). */
export const CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH = 80;

/** `TrainList` rows per `runTrainListBatchIngestion` / `POST .../run-train-list`. */
export const TRAIN_LIST_CHART_INGESTION_BATCH = 500;

/**
 * Split pasted ingestion text into raw entries.
 * Per line: if the line contains `"`, extract each `"…"` segment; otherwise split on commas.
 */
export function splitRawEntriesFromIngestionText(text: string): string[] {
  const t = String(text ?? '').trim();
  if (!t) return [];
  const out: string[] = [];
  for (const line of t.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes('"')) {
      for (const m of trimmed.matchAll(/"([^"]*)"/g)) {
        const inner = m[1].trim();
        if (inner) out.push(inner);
      }
    } else {
      for (const part of trimmed.split(',')) {
        const p = part.trim();
        if (p) out.push(p);
      }
    }
  }
  return out;
}

/**
 * Parse a single entry into an IRCTC train number (digits only).
 * Accepts `22637`, `22637 - WEST COAST EXP`, optional surrounding quotes / trailing comma.
 */
export function extractTrainNumberFromIngestionChunk(
  chunk: string,
): string | null {
  let s = String(chunk ?? '').trim();
  if (!s) return null;
  if (s.endsWith(',')) s = s.slice(0, -1).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  const m = s.match(/^(\d{4,7})\b/);
  return m ? m[1] : null;
}

@Injectable()
export class ChartTimeIngestionService {
  private readonly logger = new Logger(ChartTimeIngestionService.name);

  constructor(
    private readonly irctc: IrctcService,
    private readonly trainComposition: TrainCompositionService,
    private readonly prisma: PrismaService,
  ) {}

  private assertPassword(adminPassword: string): void {
    const expected = String(
      process.env.CHART_TIME_INGESTION_PASSWORD ?? '',
    ).trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'Ingestion password is not configured.',
      );
    }
    if (String(adminPassword ?? '') !== expected) {
      throw new UnauthorizedException('Invalid admin password.');
    }
  }

  /** Used by admin UI gate; does not run ingestion. */
  verifyAdminPassword(adminPassword: string): { unlocked: true } {
    this.assertPassword(adminPassword);
    return { unlocked: true };
  }

  /**
   * Normalizes run request body into unique train numbers (handles `"22637 - NAME",` style pastes).
   */
  collectTrainNumbersForIngestionRun(body: {
    trainNumber?: string;
    trainNumbers?: string[];
    trainNumbersText?: string;
  }): string[] {
    let rawChunks: string[] = [];
    if (Array.isArray(body.trainNumbers)) {
      rawChunks = body.trainNumbers
        .map((x) => String(x).trim())
        .filter(Boolean);
    } else if (typeof body.trainNumbersText === 'string') {
      rawChunks = splitRawEntriesFromIngestionText(body.trainNumbersText);
    } else {
      const single = String(body.trainNumber ?? '').trim();
      if (single) rawChunks = [single];
    }
    const nums = rawChunks
      .map((chunk) => extractTrainNumberFromIngestionChunk(chunk))
      .filter((n): n is string => n != null && n.length > 0);
    return [...new Set(nums)];
  }

  async runIngestion(params: RunIngestionParams) {
    const startedAt = Date.now();
    const trainNumber = String(params.trainNumber ?? '').trim();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const journeyDate = yesterday.toISOString().slice(0, 10);

    const scheduleResult = await this.irctc.getTrainSchedule(trainNumber, {
      forceRefresh: true,
    });
    if (!scheduleResult.ok) {
      if (scheduleResult.reason === 'maintenance') {
        throw new ServiceUnavailableException(
          `IRCTC maintenance: ${scheduleResult.message}`,
        );
      }
      throw new ServiceUnavailableException(
        'Schedule for this train is not available.',
      );
    }

    const stations = scheduleResult.schedule.stationList ?? [];
    this.logger.log(
      `[chart-time-ingestion] start train=${trainNumber} date=${journeyDate} stations=${stations.length}`,
    );

    const perStation: StationIngestionResult[] = [];
    for (const station of stations) {
      const stationCode = String(station.stationCode ?? '')
        .trim()
        .toUpperCase();
      const stationName = String(station.stationName ?? '').trim();
      if (!stationCode) {
        perStation.push({
          stationCode: '',
          stationName,
          status: 'skipped',
          error: 'Missing station code in schedule row.',
        });
        continue;
      }

      try {
        await this.trainComposition.fetchForBoarding({
          trainNo: trainNumber,
          jDate: journeyDate,
          boardingStation: stationCode,
        });
        perStation.push({
          stationCode,
          stationName,
          status: 'saved',
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[chart-time-ingestion] station_failed train=${trainNumber} date=${journeyDate} station=${stationCode} error=${message}`,
        );
        perStation.push({
          stationCode,
          stationName,
          status: 'failed',
          error: message,
        });
      }
    }

    const succeeded = perStation.filter((s) => s.status === 'saved').length;
    const failed = perStation.filter((s) => s.status === 'failed').length;
    const skipped = perStation.filter((s) => s.status === 'skipped').length;
    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `[chart-time-ingestion] done train=${trainNumber} date=${journeyDate} attempted=${perStation.length} succeeded=${succeeded} failed=${failed} skipped=${skipped} elapsedMs=${elapsedMs}`,
    );

    return {
      trainNumber,
      journeyDate,
      trainName: scheduleResult.schedule.trainName,
      totals: {
        attempted: perStation.length,
        succeeded,
        failed,
        skipped,
      },
      elapsedMs,
      stations: perStation,
    };
  }

  private toErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  /**
   * Run ingestion for multiple trains (same journey date) in parallel. One train failing does not stop the rest.
   */
  async runIngestionBatch(params: {
    trainNumbers: string[];
    journeyDate: string;
  }) {
    const journeyDate = String(params.journeyDate ?? '')
      .trim()
      .slice(0, 10);
    const unique = [
      ...new Set(
        params.trainNumbers.map((t) => String(t ?? '').trim()).filter(Boolean),
      ),
    ];
    if (unique.length === 0) {
      throw new ServiceUnavailableException(
        'At least one train number is required.',
      );
    }
    if (unique.length > CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH) {
      throw new ServiceUnavailableException(
        `At most ${CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH} trains per request.`,
      );
    }

    const existingRows = await this.prisma.trainStationChartTime.groupBy({
      by: ['trainNumber'],
      where: { trainNumber: { in: unique } },
    });
    const existingSet = new Set(existingRows.map((r) => r.trainNumber));
    const skippedAlreadyInDb = unique.filter((n) => existingSet.has(n));
    const toRun = unique.filter((n) => !existingSet.has(n));

    if (skippedAlreadyInDb.length > 0) {
      this.logger.log(
        `[chart-time-ingestion] skip_existing_db count=${skippedAlreadyInDb.length} trains=${skippedAlreadyInDb.join(',')}`,
      );
    }

    const batchStarted = Date.now();
    const settled =
      toRun.length > 0
        ? await Promise.allSettled(
            toRun.map((trainNumber) =>
              this.runIngestion({ trainNumber, journeyDate }),
            ),
          )
        : [];

    const trains: (
      | (Awaited<ReturnType<ChartTimeIngestionService['runIngestion']>> & {
          ok: true;
        })
      | { ok: false; trainNumber: string; error: string }
    )[] = settled.map((s, i) => {
      const trainNumber = toRun[i];
      if (s.status === 'fulfilled') {
        return { ok: true, ...s.value };
      }
      const message = this.toErrorMessage(s.reason);
      this.logger.warn(
        `[chart-time-ingestion] train_failed train=${trainNumber} date=${journeyDate} error=${message}`,
      );
      return { ok: false, trainNumber, error: message };
    });

    let stationsAttempted = 0;
    let stationsSaved = 0;
    let stationsFailed = 0;
    let stationsSkipped = 0;
    for (const t of trains) {
      if (!t.ok) continue;
      stationsAttempted += t.totals.attempted;
      stationsSaved += t.totals.succeeded;
      stationsFailed += t.totals.failed;
      stationsSkipped += t.totals.skipped;
    }

    const trainsOk = trains.filter((t) => t.ok).length;
    const trainsFailedRun = trains.filter((t) => !t.ok).length;
    const elapsedMs = Date.now() - batchStarted;
    this.logger.log(
      `[chart-time-ingestion] batch_done date=${journeyDate} parsed=${unique.length} skipped_db=${skippedAlreadyInDb.length} run=${toRun.length} ok=${trainsOk} failed=${trainsFailedRun} elapsedMs=${elapsedMs}`,
    );

    return {
      journeyDate,
      trains,
      skippedAlreadyInDb,
      summary: {
        trainCount: unique.length,
        trainsSkippedExistingDb: skippedAlreadyInDb.length,
        trainsRun: toRun.length,
        trainsOk,
        trainsFailed: trainsFailedRun,
        stationsAttempted,
        stationsSaved,
        stationsFailed,
        stationsSkipped,
        elapsedMs,
      },
    };
  }

  /**
   * Next `TRAIN_LIST_CHART_INGESTION_BATCH` trains from `TrainList` with
   * `chartTimeIngestionDone = false`, using IST today then tomorrow if no chart rows were stored.
   * Sets `chartTimeIngestionDone` on each row after processing.
   */
  async runTrainListBatchIngestion() {
    const ist = DateTime.now().setZone('Asia/Kolkata');
    const today = ist.toFormat('yyyy-LL-dd');
    const tomorrow = ist.plus({ days: 1 }).toFormat('yyyy-LL-dd');

    const rows = await this.prisma.trainList.findMany({
      where: { chartTimeIngestionDone: false },
      orderBy: { trainNumber: 'asc' },
      take: TRAIN_LIST_CHART_INGESTION_BATCH,
    });

    const batchStarted = Date.now();
    const settled = await Promise.allSettled(
      rows.map((row) =>
        this.ingestTrainListRowForChartTimes({
          id: row.id,
          trainNumber: row.trainNumber,
          today,
          tomorrow,
        }),
      ),
    );

    type RowResult =
      | {
          kind: 'skipped_existing';
          trainNumber: string;
          label: string;
        }
      | ({
          kind: 'ingested';
          journeyDateUsed: string;
          triedTomorrow: boolean;
        } & Awaited<ReturnType<ChartTimeIngestionService['runIngestion']>>)
      | {
          kind: 'failed';
          trainNumber: string;
          label: string;
          error: string;
        };

    const trains: RowResult[] = settled.map((s, i) => {
      const row = rows[i];
      if (s.status === 'fulfilled') return s.value;
      return {
        kind: 'failed' as const,
        trainNumber: row.trainNumber,
        label: row.label,
        error: this.toErrorMessage(s.reason),
      };
    });

    let stationsAttempted = 0;
    let stationsSaved = 0;
    let stationsFailed = 0;
    let stationsSkipped = 0;
    for (const t of trains) {
      if (t.kind !== 'ingested') continue;
      stationsAttempted += t.totals.attempted;
      stationsSaved += t.totals.succeeded;
      stationsFailed += t.totals.failed;
      stationsSkipped += t.totals.skipped;
    }

    const remainingPendingTrainList = await this.prisma.trainList.count({
      where: { chartTimeIngestionDone: false },
    });

    const elapsedMs = Date.now() - batchStarted;
    const ingested = trains.filter((t) => t.kind === 'ingested');
    const skippedExisting = trains.filter((t) => t.kind === 'skipped_existing');
    const failed = trains.filter((t) => t.kind === 'failed');

    this.logger.log(
      `[chart-time-ingestion] train_list_batch today=${today} tomorrow=${tomorrow} picked=${rows.length} ingested=${ingested.length} skipped_existing=${skippedExisting.length} failed=${failed.length} remaining_pending=${remainingPendingTrainList} elapsedMs=${elapsedMs}`,
    );

    return {
      mode: 'train_list' as const,
      datesTried: { today, tomorrow },
      trains,
      summary: {
        pickedFromTrainList: rows.length,
        ingestedCount: ingested.length,
        skippedExistingDbCount: skippedExisting.length,
        failedCount: failed.length,
        stationsAttempted,
        stationsSaved,
        stationsFailed,
        stationsSkipped,
        elapsedMs,
        remainingPendingTrainList,
      },
    };
  }

  private async ingestTrainListRowForChartTimes(params: {
    id: string;
    trainNumber: string;
    today: string;
    tomorrow: string;
  }): Promise<
    | {
        kind: 'skipped_existing';
        trainNumber: string;
        label: string;
      }
    | ({
        kind: 'ingested';
        journeyDateUsed: string;
        triedTomorrow: boolean;
      } & Awaited<ReturnType<ChartTimeIngestionService['runIngestion']>>)
    | {
        kind: 'failed';
        trainNumber: string;
        label: string;
        error: string;
      }
  > {
    const row = await this.prisma.trainList.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, trainNumber: true, label: true },
    });

    const existingChartCount = await this.prisma.trainStationChartTime.count({
      where: { trainNumber: row.trainNumber },
    });
    if (existingChartCount > 0) {
      await this.prisma.trainList.update({
        where: { id: row.id },
        data: { chartTimeIngestionDone: true },
      });
      return {
        kind: 'skipped_existing',
        trainNumber: row.trainNumber,
        label: row.label,
      };
    }

    const datesToTry = [params.today, params.tomorrow] as const;
    let lastRun: Awaited<
      ReturnType<ChartTimeIngestionService['runIngestion']>
    > | null = null;
    let journeyDateUsed: string | null = null;
    let triedTomorrow = false;

    for (let i = 0; i < datesToTry.length; i++) {
      const journeyDate = datesToTry[i];
      if (i === 1) triedTomorrow = true;
      const countBefore = await this.prisma.trainStationChartTime.count({
        where: { trainNumber: row.trainNumber },
      });
      try {
        lastRun = await this.runIngestion({
          trainNumber: row.trainNumber,
          journeyDate,
        });
      } catch (err) {
        this.logger.warn(
          `[chart-time-ingestion] train_list_row_error train=${row.trainNumber} date=${journeyDate} error=${this.toErrorMessage(err)}`,
        );
        lastRun = null;
        continue;
      }
      journeyDateUsed = journeyDate;
      const countAfter = await this.prisma.trainStationChartTime.count({
        where: { trainNumber: row.trainNumber },
      });
      const gotChartRows = countAfter > countBefore;
      const gotCompositions = lastRun.totals.succeeded > 0;
      if (gotChartRows || gotCompositions) {
        break;
      }
    }

    await this.prisma.trainList.update({
      where: { id: row.id },
      data: { chartTimeIngestionDone: true },
    });

    if (lastRun && journeyDateUsed) {
      return {
        kind: 'ingested',
        journeyDateUsed,
        triedTomorrow,
        ...lastRun,
      };
    }

    return {
      kind: 'failed',
      trainNumber: row.trainNumber,
      label: row.label,
      error:
        'No usable IRCTC response for IST today or tomorrow (schedule/composition unavailable or all stations failed).',
    };
  }

  /** Chart-time availability tasks (admin list). */
  async listChartTimeAvailabilityTasks(opts: {
    limit?: number;
    status?: string;
  }) {
    const take = Math.min(Math.max(Number(opts.limit) || 300, 1), 500);
    const raw = String(opts.status ?? '')
      .trim()
      .toLowerCase();
    const statusFilter = CHART_TASK_STATUSES.includes(
      raw as (typeof CHART_TASK_STATUSES)[number],
    )
      ? raw
      : undefined;
    const where = statusFilter ? { status: statusFilter } : {};
    const orderBy =
      statusFilter === 'pending' || statusFilter === 'running'
        ? ({ chartAt: 'asc' } as const)
        : ({ chartAt: 'desc' } as const);
    const tasks = await this.prisma.chartTimeAvailabilityTask.findMany({
      where,
      orderBy,
      take,
    });
    return { tasks };
  }
}
