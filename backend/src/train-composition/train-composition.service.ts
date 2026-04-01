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
  chartTwoTime?: string | null;
  chartTwoIsNextDay?: boolean;
  chartRemoteStation?: string | null;
  compositionError?: string | null;
  /**
   * When IRCTC has no per-station chart meta yet, times match another station’s
   * successful composition (train-wide window until local chart is prepared).
   */
  chartTimesFallbackFromStation?: string | null;
};

function applyDbCachedToRow(
  row: StationChartMetaDto,
  cached: {
    chartOne: string;
    chartTwo?: { time: string; dayOffset: number };
  },
): void {
  if (!cached.chartOne?.trim()) return;
  row.chartOneTime = cached.chartOne.trim();
  if (cached.chartTwo?.time?.trim()) {
    row.chartTwoTime = cached.chartTwo.time.trim();
    row.chartTwoIsNextDay = (cached.chartTwo.dayOffset ?? 0) >= 1;
  }
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
   * Chart times for one train + station from `TrainStationChartTime` only (no IRCTC).
   * `journeyDate` is accepted for API symmetry; rows are not keyed by date in DB.
   */
  async fetchSourceStationChartMeta(params: {
    trainNumber: string;
    journeyDate: string;
    sourceStation: string;
  }): Promise<StationChartMetaDto> {
    const trainNumber = String(params.trainNumber ?? '').trim();
    const stationCode = String(params.sourceStation ?? '')
      .trim()
      .toUpperCase();

    const row: StationChartMetaDto = {
      stationCode,
      trainArrivalTime: null,
      trainDepartureTime: null,
    };

    const cached = await this.chartTime.getChartMetaForTrainStation(
      trainNumber,
      stationCode,
    );
    if (cached?.chartOne?.trim()) {
      applyDbCachedToRow(row, cached);
    }

    return row;
  }
}
