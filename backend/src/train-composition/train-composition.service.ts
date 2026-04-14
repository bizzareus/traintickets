import { Injectable, Logger } from '@nestjs/common';
import { ChartTimeService } from '../chart-time/chart-time.service';
import {
  IrctcService,
  type TrainCompositionResponse,
} from '../irctc/irctc.service';

export type FetchTrainCompositionParams = {
  trainNo: string;
  jDate: string;
  boardingStation: string;
};

/** Per-station chart times (e.g. from `TrainStationChartTime`). */
export type StationChartMetaDto = {
  stationCode: string;
  trainArrivalTime?: string | null;
  trainDepartureTime?: string | null;
  chartOneTime?: string | null;
  chartOneDayOffset?: number | null;
  chartTwoTime?: string | null;
  chartTwoDayOffset?: number | null;
  chartTwoIsNextDay?: boolean; // deprecated, use chartTwoDayOffset
  chartRemoteStation?: string | null;
  compositionError?: string | null;
  /**
   * When IRCTC has no per-station chart meta yet, times match another station’s
   * successful composition (train-wide window until local chart is prepared).
   */
  chartTimesFallbackFromStation?: string | null;
  isLive?: boolean;
  chartNextRemoteStation?: string | null;
};

function applyDbCachedToRow(
  row: StationChartMetaDto,
  cached: {
    chartOne: { time: string; dayOffset: number | null };
    chartTwo?: { time: string; dayOffset: number | null };
    chartRemoteStation?: string | null;
    chartNextRemoteStation?: string | null;
  },
): void {
  row.chartOneTime = cached.chartOne.time.trim();
  row.chartOneDayOffset = cached.chartOne.dayOffset;
  if (cached.chartTwo?.time?.trim()) {
    row.chartTwoTime = cached.chartTwo.time.trim();
    row.chartTwoDayOffset = cached.chartTwo.dayOffset;
    row.chartTwoIsNextDay = (cached.chartTwo.dayOffset ?? 0) >= 1;
  }
  row.chartRemoteStation = cached.chartRemoteStation;
  row.chartNextRemoteStation = cached.chartNextRemoteStation;
  row.compositionError = null;
}

/**
 * Ticketing source station per OpenAI seat segment (boarding for that ticket).
 * Each object uses `from` as the station to query composition / chart time for.
 */
export function sourceStationCodesFromOpenAiSeats(
  seats: ReadonlyArray<{ from?: string | null }> | null | undefined,
): string[] {
  if (!seats?.length) return [];
  const set = new Set<string>();
  for (const s of seats) {
    const c = String(s?.from ?? '')
      .trim()
      .toUpperCase();
    if (c) set.add(c);
  }
  return [...set];
}

/**
 * Application-wide entry point for IRCTC train composition (chart + coaches).
 * Wraps {@link IrctcService.getTrainComposition} so chart times persist consistently
 * and all feature modules depend on this module instead of calling IRCTC directly.
 */
@Injectable()
export class TrainCompositionService {
  private readonly logger = new Logger(TrainCompositionService.name);

  constructor(
    private readonly irctc: IrctcService,
    private readonly chartTime: ChartTimeService,
  ) {}

  /**
   * POST trainComposition with the given boarding/source station for this journey date.
   * Side effect: upserts chart time rows from the response (see IrctcService).
   */
  async fetchForBoarding(
    params: FetchTrainCompositionParams,
    opts?: { allowChartNotPrepared?: boolean },
  ): Promise<TrainCompositionResponse> {
    const trainNo = String(params.trainNo ?? '').trim();
    const jDate = String(params.jDate ?? '')
      .trim()
      .slice(0, 10);
    const boardingStation = String(params.boardingStation ?? '')
      .trim()
      .toUpperCase();
    this.logger.debug(
      `[trainComposition] fetch trainNo=${trainNo} jDate=${jDate} boarding=${boardingStation}`,
    );
    return this.irctc.getTrainComposition(
      {
        trainNo,
        jDate,
        boardingStation,
      },
      opts,
    );
  }

  /**
   * For each boarding station, call IRCTC composition so chart times are persisted
   * (see {@link IrctcService.getTrainComposition}). Matches journey monitoring
   * behaviour: DB is populated even when IRCTC returns chart-not-prepared (soft path).
   */
  async persistChartTimesFromCompositionForBoardingStations(params: {
    trainNumber: string;
    /** YYYY-MM-DD (journey / run date for composition). */
    journeyDate: string;
    stationCodes: string[];
    logContext?: string;
  }): Promise<void> {
    const trainNo = String(params.trainNumber ?? '').trim();
    const jDate = String(params.journeyDate ?? '')
      .trim()
      .slice(0, 10);
    const unique = [
      ...new Set(
        params.stationCodes
          .map((c) =>
            String(c ?? '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
    if (!trainNo || !jDate || unique.length === 0) return;

    const ctx = params.logContext ?? 'boarding_stations';
    this.logger.log(
      `[trainComposition] persistChartTimes jDate=${jDate} context=${ctx} stationCount=${unique.length} codes=${unique.join(',')}`,
    );

    for (const boardingStation of unique) {
      try {
        await this.fetchForBoarding(
          { trainNo, jDate, boardingStation },
          { allowChartNotPrepared: true },
        );
      } catch (err) {
        this.logger.warn(
          `[trainComposition] chart time fetch failed trainNo=${trainNo} boarding=${boardingStation} jDate=${jDate}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Chart times for one train + boarding station.
   * With `refreshFromIrctc`, calls IRCTC trainComposition for that boarding point and fills
   * chart times from the response (and DB side effects from {@link fetchForBoarding}).
   */
  async fetchSourceStationChartMeta(params: {
    trainNumber: string;
    sourceStation: string;
    /** When true, POST IRCTC trainComposition for this boarding station before reading DB. */
    refreshFromIrctc?: boolean;
  }): Promise<StationChartMetaDto> {
    const trainNumber = String(params.trainNumber ?? '').trim();
    // const journeyDate = String(params.journeyDate ?? '')
    //   .trim()
    //   .slice(0, 10);
    const stationCode = String(params.sourceStation ?? '')
      .trim()
      .toUpperCase();

    const row: StationChartMetaDto = {
      stationCode,
      trainArrivalTime: null,
      trainDepartureTime: null,
      chartOneDayOffset: null,
      chartTwoDayOffset: null,
      isLive: false,
    };

    let cached = await this.chartTime.getChartMetaForTrainStation(
      trainNumber,
      stationCode,
    );

    const needsRefresh =
      params.refreshFromIrctc ||
      !cached ||
      cached.chartOne.dayOffset === null ||
      !cached.chartRemoteStation;

    if (needsRefresh) {
      try {
        const jDate = new Date().toISOString().slice(0, 10);
        await this.fetchForBoarding(
          { trainNo: trainNumber, jDate, boardingStation: stationCode },
          { allowChartNotPrepared: true },
        );
        // Re-read after refresh
        cached = await this.chartTime.getChartMetaForTrainStation(
          trainNumber,
          stationCode,
        );
        row.isLive = true;
      } catch (err) {
        this.logger.warn(
          `[trainComposition] refresh/auto-refresh failed for ${trainNumber} at ${stationCode}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (cached?.chartOne?.time?.trim()) {
      applyDbCachedToRow(row, cached);
    }
    return row;
  }
}
