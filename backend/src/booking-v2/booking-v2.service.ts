import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import moment from 'moment';
import { IrctcService } from '../irctc/irctc.service';
import { CacheService } from '../cache/cache.service';
import { InMemoryCacheService } from '../cache/in-memory-cache.service';
import { StationCacheService } from '../cache/station-cache.service';
import {
  BestTrainsRouteCache,
  bestTrainsCacheKey,
  type CachedBestTrain,
} from './best-trains-cache';
import {
  AlternatePathsRouteCache,
  alternatePathsCacheKey,
} from './alternate-paths-cache';
import type { RouteCacheRecord } from '../route-cache/route-cache.store';
import { fetchWithTimeout } from '../common/fetch-with-timeout';
import {
  BOOKING_V2_ALTERNATE_PATH_CLASSES,
  BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS,
  BOOKING_V2_RAIL_API_BASE,
  BOOKING_V2_RAIL_API_HEADERS,
  BOOKING_V2_MAX_STATIONS_OFFSET,
} from './booking-v2.constants';
import {
  avlDayMatchesJourneyDate,
  collapsibleRealtimeRemainderEndpoints,
  filterDepartedTrainsFromSearchResponse,
  isLegConfirmed,
  legScheduleTiming,
  normalizeAndDedupeClassCodes,
  orderedDestinationIndices,
  parseScheduleDayCount,
  parseUpstreamAvailablityType,
} from './booking-v2.utils';

/** Opaque upstream JSON key for vendor prediction text on availability day rows. */
const UPSTREAM_VENDOR_STATUS_KEY = Buffer.from(
  'Y29uZmlybVRrdFN0YXR1cw==',
  'base64',
).toString('utf8');

/** One class option for a confirmed leg — used in `confirmedClassOptions`. */
export type AlternatePathClassOption = {
  travelClass: string;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

export type AlternatePathLeg = {
  from: string;
  to: string;
  /** Confirmed booking segment vs. hop with no usable class — verify live on IRCTC. */
  segmentKind: 'confirmed' | 'check_realtime';
  /** Travel class when `segmentKind` is confirmed; null for check_realtime. */
  travelClass: string | null;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
  /**
   * All confirmed class options for this segment, sorted cheapest-first.
   * Populated only when `segmentKind` is `'confirmed'`.
   * When there is only one confirmed class this will have length 1.
   */
  confirmedClassOptions: AlternatePathClassOption[];
  /** From IRCTC schedule at boarding stop (HH:MM). */
  departureTime: string | null;
  /** From IRCTC schedule at alighting stop (HH:MM). */
  arrivalTime: string | null;
  /** Travel time for this leg when both clocks resolved (and `dayCount` when present). */
  durationMinutes: number | null;
  /** ISO date (YYYY-MM-DD) when the train departs this leg's boarding station. */
  boardingDate?: string;
  /** Day offset relative to train start date (0 = origin departure day, 1 = day 2...). */
  dayOffset?: number;
};

// ---------------------------------------------------------------------------
// Progress streaming
// ---------------------------------------------------------------------------

/** Granular events emitted during findAlternatePaths for real-time UI feedback. */
export type AlternatePathProgressEvent =
  | { type: 'schedule_ok'; trainName: string | null; stopCount: number }
  | { type: 'schedule_fail' }
  | { type: 'route_ok'; from: string; to: string; stopCount: number }
  | { type: 'route_fail'; from: string; to: string }
  | {
      type: 'hop_confirmed';
      from: string;
      to: string;
      travelClass: string;
      fare: number | null;
      hopIndex: number;
    }
  | { type: 'hop_unavailable'; from: string; to: string; hopIndex: number }
  | {
      type: 'done';
      isComplete: boolean;
      legCount: number;
      totalFare: number | null;
    };

export type AlternatePathRemainderMergedSchedule = {
  from: string;
  to: string;
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes: number | null;
};

export type FindAlternatePathsResult = {
  trainNumber: string;
  legs: AlternatePathLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  /** Code → human-readable name for every station on the route (from IRCTC schedule). */
  stationNameMap: Record<string, string>;
  /** When the UI merges a realtime suffix, IRCTC schedule timing for that whole OD (DEE → BVI). */
  remainderMergedSchedule: AlternatePathRemainderMergedSchedule | null;
  /** Code and departure time (HH:MM) of the train's very first station. */
  trainOriginCode: string | null;
  trainOriginDepartureTime: string | null;
  /** Step-by-step trace for debugging (also logged with Logger). */
  debugLog: string[];
  trainStartDate?: string;
};

export type BookingV2TrainSearchRow = {
  trainNumber: string;
  trainName?: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: number;
  fromStnCode?: string;
  toStnCode?: string;
  avlClasses?: string[];
  availabilityCache?: Record<string, unknown>;
  trainStartDate?: string;
};

export type BestTrainSearchInput = {
  from: string;
  to: string;
  date: string;
  quota?: string;
  acOnly?: boolean;
  maxTrains?: number;
  trains?: BookingV2TrainSearchRow[];
};

export type BestTrainScore = {
  originConfirmed: boolean;
  confirmedContiguousStationsFromOrigin: number;
  confirmedContiguousMinutesFromOrigin: number;
  totalConfirmedStations: number;
  totalConfirmedMinutes: number;
  longestConfirmedLegStations: number;
  longestConfirmedLegMinutes: number;
  isComplete: boolean;
  totalFare: number | null;
};

export type BestTrainCandidateResult = {
  train: BookingV2TrainSearchRow;
  alternatePath: FindAlternatePathsResult;
  score: BestTrainScore;
  rankReason: string;
};

export type BestTrainSearchResult = {
  from: string;
  to: string;
  date: string;
  acOnly: boolean;
  totalTrainsFound: number;
  candidatesEvaluated: number;
  candidatesSkipped: number;
  results: BestTrainCandidateResult[];
};

export type BestTrainProgressEvent =
  | { type: 'search_start'; from: string; to: string; date: string }
  | {
      type: 'candidates_ready';
      totalTrainsFound: number;
      candidateCount: number;
    }
  | {
      type: 'train_started';
      trainNumber: string;
      trainName: string | null;
      index: number;
      total: number;
    }
  | {
      type: 'train_done';
      trainNumber: string;
      trainName: string | null;
      index: number;
      total: number;
      result: BestTrainCandidateResult | null;
      skippedReason?: string;
    }
  | { type: 'done'; resultCount: number; evaluatedCount: number };

type AvlDayRow = {
  availablityType?: number | string | null;
  availablityStatus?: string | null;
  vendorPredictionStatus?: string | null;
  predictionPercentage?: string | null;
  availabilityDisplayName?: string | null;
};

type SegmentProbeRow = {
  day: AvlDayRow | null;
  fare: number | null;
  fetchError?: string;
};

type MultiClassProbeResult = {
  perClass: SegmentProbeRow[];
  bestConfirmedClassIndex: number | null;
  /** First class with an availability row (for regret / realtime messaging). */
  displayRow: AvlDayRow | null;
};

/** 24 hours in milliseconds — TTL for train search cache entries. */
const TRAIN_SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * TTL for per-segment availability probes. The alternate-paths fan-out makes one
 * fetchAvailability call per (train, from, to, date, class, quota); caching the
 * small extracted result lets concurrent/repeat searches (and the every-6h cron)
 * reuse it instead of re-hitting the upstream. This cache was the #1 DB load
 * (millions of cache_entry writes) at the old 15m TTL, so it's now 6h — trading
 * some availability freshness for far less DB/IRCTC churn. Env-tunable via
 * BOOKING_V2_AVL_CACHE_TTL_MS (default 6h, max 24h).
 */
const AVL_SEGMENT_TTL_MS = (() => {
  const n = Number.parseInt(process.env.BOOKING_V2_AVL_CACHE_TTL_MS ?? '', 10);
  return Number.isFinite(n) && n >= 60_000 && n <= 24 * 60 * 60 * 1000
    ? n
    : 6 * 60 * 60 * 1000;
})();
const BEST_TRAIN_CONCURRENCY = 3;
/**
 * TTL for a precomputed best-train cache entry. 12h — comfortably longer than
 * the cron's 6h cadence + refresh threshold, so an entry is always still served
 * while it becomes refresh-eligible (even entries written late in a multi-route
 * run never expire before the next 6h run rewrites them).
 */
const BEST_TRAINS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/**
 * TTL for a cached per-train alternate-paths result. Shorter than the best-train
 * cache because these carry live seat availability (WL counts) that goes stale
 * faster. Env-tunable via BOOKING_V2_ALT_PATHS_CACHE_TTL_MS (default 6h).
 */
const ALT_PATHS_CACHE_TTL_MS = (() => {
  const n = Number.parseInt(
    process.env.BOOKING_V2_ALT_PATHS_CACHE_TTL_MS ?? '',
    10,
  );
  return Number.isFinite(n) && n >= 60_000 && n <= 24 * 60 * 60 * 1000
    ? n
    : 6 * 60 * 60 * 1000;
})();
/**
 * Cap concurrent origin-destination probes per hop in alternate-paths. The
 * previous unbounded Promise.all could fan out ~6 ODs × ~9 classes ≈ 54
 * concurrent IRCTC calls per hop, exhausting the DB pool / IRCTC rate limit and
 * driving p95 toward 70s. Each probe still fetches its classes in parallel
 * internally, so the effective ceiling is this × class count.
 */
const ALT_PATH_PROBE_CONCURRENCY = (() => {
  const n = Number.parseInt(process.env.ALT_PATH_PROBE_CONCURRENCY ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 3;
})();
const NON_AC_CLASS_CODES = new Set(['SL', '2S', 'GN', 'FC']);

function isAcClassCode(code: string): boolean {
  return !NON_AC_CLASS_CODES.has(code.trim().toUpperCase());
}

function parseRailClockMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function normalizeTrainSearchRow(
  item: unknown,
): BookingV2TrainSearchRow | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  const trainNumber = String((r.trainNumber as any) ?? '').trim();
  if (!trainNumber) return null;
  const avlClasses = Array.isArray(r.avlClasses)
    ? r.avlClasses
        .map((c) =>
          String(c ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean)
    : undefined;
  const duration =
    typeof r.duration === 'number'
      ? r.duration
      : typeof r.duration === 'string'
        ? parseInt(r.duration, 10)
        : undefined;
  return {
    ...(item as BookingV2TrainSearchRow),
    trainNumber,
    trainName: String((r.trainName as any) ?? '').trim(),
    departureTime:
      typeof r.departureTime === 'string' ? r.departureTime : undefined,
    arrivalTime: typeof r.arrivalTime === 'string' ? r.arrivalTime : undefined,
    duration: Number.isFinite(duration) ? duration : undefined,
    fromStnCode:
      typeof r.fromStnCode === 'string'
        ? r.fromStnCode.trim().toUpperCase()
        : undefined,
    toStnCode:
      typeof r.toStnCode === 'string'
        ? r.toStnCode.trim().toUpperCase()
        : undefined,
    avlClasses,
    trainStartDate:
      typeof r.trainStartDate === 'string' ? r.trainStartDate : undefined,
  };
}

function extractTrainListRows(root: unknown): BookingV2TrainSearchRow[] {
  if (!root || typeof root !== 'object') return [];
  const data = (root as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>).trainList;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => normalizeTrainSearchRow(item))
    .filter((row): row is BookingV2TrainSearchRow => row != null);
}

function normalizeTrainRows(
  rows: BookingV2TrainSearchRow[] | undefined,
): BookingV2TrainSearchRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => normalizeTrainSearchRow(item))
    .filter((row): row is BookingV2TrainSearchRow => row != null);
}

function limitBestTrainCandidates(
  rows: BookingV2TrainSearchRow[],
  maxTrains: number | undefined,
): BookingV2TrainSearchRow[] {
  if (typeof maxTrains !== 'number' || !Number.isFinite(maxTrains)) {
    return rows;
  }
  const n = Math.max(1, Math.floor(maxTrains));
  return rows.slice(0, n);
}

function compareBestTrainResults(
  a: BestTrainCandidateResult,
  b: BestTrainCandidateResult,
): number {
  const as = a.score;
  const bs = b.score;
  const confirmedHoursCmp =
    bs.confirmedContiguousMinutesFromOrigin -
    as.confirmedContiguousMinutesFromOrigin;
  if (confirmedHoursCmp !== 0) return confirmedHoursCmp;

  const boolCmp = Number(bs.originConfirmed) - Number(as.originConfirmed);
  if (boolCmp !== 0) return boolCmp;

  const ad = a.train.duration ?? Number.MAX_SAFE_INTEGER;
  const bd = b.train.duration ?? Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;

  const af = as.totalFare ?? Number.POSITIVE_INFINITY;
  const bf = bs.totalFare ?? Number.POSITIVE_INFINITY;
  if (af !== bf) return af - bf;

  const longestMinutesCmp =
    bs.longestConfirmedLegMinutes - as.longestConfirmedLegMinutes;
  if (longestMinutesCmp !== 0) return longestMinutesCmp;

  const longestStationsCmp =
    bs.longestConfirmedLegStations - as.longestConfirmedLegStations;
  if (longestStationsCmp !== 0) return longestStationsCmp;

  const completeCmp = Number(bs.isComplete) - Number(as.isComplete);
  if (completeCmp !== 0) return completeCmp;

  const aDep =
    parseRailClockMinutes(a.train.departureTime) ?? Number.MAX_SAFE_INTEGER;
  const bDep =
    parseRailClockMinutes(b.train.departureTime) ?? Number.MAX_SAFE_INTEGER;
  return aDep - bDep;
}

@Injectable()
export class BookingV2Service {
  private readonly logger = new Logger(BookingV2Service.name);

  constructor(
    private readonly irctc: IrctcService,
    private readonly cache: CacheService,
    private readonly stationCache: StationCacheService,
    private readonly bestTrainsCache: BestTrainsRouteCache,
    private readonly altPathsCache: AlternatePathsRouteCache,
  ) {}

  async getTrainSchedule(trainNumber: string) {
    return this.irctc.getTrainSchedule(trainNumber);
  }

  /** `YYYY-MM-DD`, `DD-MM-YYYY`, slashes, or other valid formats parsed to `DD-MM-YYYY`. */
  normalizeToRailApiDate(dateInput: string): string | null {
    const t = String(dateInput).trim().replace(/\//g, '-');
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
      const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const [, y, mo, d] = m;
        const parsed = `${d.padStart(2, '0')}-${mo.padStart(2, '0')}-${y}`;
        if (moment(parsed, 'DD-MM-YYYY', true).isValid()) {
          return parsed;
        }
      }
    }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(t)) {
      const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m) {
        const d = m[1].padStart(2, '0');
        const mo = m[2].padStart(2, '0');
        const parsed = `${d}-${mo}-${m[3]}`;
        if (moment(parsed, 'DD-MM-YYYY', true).isValid()) {
          return parsed;
        }
      }
    }

    // Fallback to strict moment parsing of other known formats to avoid deprecation warnings
    const formats = [
      'YYYY-MM-DD',
      'YYYY-M-D',
      'DD-MM-YYYY',
      'D-M-YYYY',
      'D MMM YYYY',
      'DD MMM YYYY',
      'D MMMM YYYY',
      'DD MMMM YYYY',
      'MMM D, YYYY',
      'MMM DD, YYYY',
      'MMMM D, YYYY',
      'MMMM DD, YYYY',
    ];
    const parsedMoment = moment(t, formats, true);
    if (parsedMoment.isValid()) {
      const year = parsedMoment.year();
      if (year >= 2000 && year <= 2100) {
        return parsedMoment.format('DD-MM-YYYY');
      }
    }
    return null;
  }

  private normalizeAvlDayRow(r: Record<string, unknown>): AvlDayRow {
    const rawVendor = r[UPSTREAM_VENDOR_STATUS_KEY];
    const vendor =
      typeof rawVendor === 'string' && rawVendor.trim() !== ''
        ? rawVendor.trim()
        : null;
    return {
      availablityType: r.availablityType as AvlDayRow['availablityType'],
      availablityStatus:
        typeof r.availablityStatus === 'string' ? r.availablityStatus : null,
      vendorPredictionStatus: vendor,
      predictionPercentage:
        typeof r.predictionPercentage === 'string'
          ? r.predictionPercentage
          : null,
      availabilityDisplayName:
        typeof r.availabilityDisplayName === 'string'
          ? r.availabilityDisplayName
          : null,
    };
  }

  async searchStations(searchString: string): Promise<unknown> {
    const q = (searchString || '').trim();

    // DB-first: station_cache is the seeded source of truth for autocomplete.
    // A DB blip must not 500 the autocomplete — fall through to the RapidAPI
    // fallback (which returns [] on its own failure) instead of throwing.
    let cached: Awaited<ReturnType<StationCacheService['search']>> = [];
    try {
      cached = await this.stationCache.search(q);
    } catch (err) {
      this.logger.warn(
        `[booking-v2/stations] cache search failed q=${q.slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (cached.length > 0) {
      this.logger.log(
        `[booking-v2/stations] source=cache q=${q.slice(0, 40)} count=${cached.length}`,
      );
      return { data: { stationList: cached } };
    }

    // Cache miss → RapidAPI fallback (fast/reliable, unlike the IRCTC rail API).
    // Backfill the cache so the next lookup for this station is served from DB.
    const fromApi = await this.irctc.searchStationsViaRapidApi(q);
    this.logger.log(
      `[booking-v2/stations] source=rapidapi reason=cache_miss q=${q.slice(0, 40)} count=${fromApi.length}`,
    );
    if (fromApi.length > 0) {
      void this.stationCache
        .upsertMany(fromApi)
        .catch((e: unknown) =>
          this.logger.warn('[booking-v2/stations] cache upsert failed', e),
        );
    }
    return { data: { stationList: fromApi } };
  }

  async searchTrains(
    from: string,
    to: string,
    dateInput: string,
  ): Promise<unknown> {
    const dateDdMmYyyy = this.normalizeToRailApiDate(dateInput);
    if (!dateDdMmYyyy) throw new Error('Invalid journey date');

    const cacheKey = `trains:${from.trim().toUpperCase()}:${to.trim().toUpperCase()}:${dateDdMmYyyy}`;
    return this.cache.getOrSet(
      cacheKey,
      () => this.fetchTrainsFromUpstream(from, to, dateDdMmYyyy),
      TRAIN_SEARCH_TTL_MS,
    );
  }

  async findBestTrains(
    input: BestTrainSearchInput,
    onProgress?: (event: BestTrainProgressEvent) => void,
    // When provided, per-segment availability probes read/write this cache
    // instead of the shared Postgres cache_entry (the cron passes an in-memory
    // one so a run never writes to the DB).
    segmentCache?: CacheService,
  ): Promise<BestTrainSearchResult> {
    const from = String(input.from ?? '')
      .trim()
      .toUpperCase();
    const to = String(input.to ?? '')
      .trim()
      .toUpperCase();
    const date = String(input.date ?? '').trim();
    const quota = String(input.quota ?? 'GN')
      .trim()
      .toUpperCase();
    const dateDdMmYyyy = this.normalizeToRailApiDate(date);
    if (!from || !to || !dateDdMmYyyy) {
      throw new Error('from, to, and valid date are required');
    }

    const acOnly = input.acOnly === true;

    onProgress?.({ type: 'search_start', from, to, date });
    let allTrains = normalizeTrainRows(input.trains);
    if (allTrains.length === 0) {
      const rawSearch = await this.searchTrains(from, to, date);
      allTrains = extractTrainListRows(rawSearch);
    }

    const candidates = limitBestTrainCandidates(allTrains, input.maxTrains);
    onProgress?.({
      type: 'candidates_ready',
      totalTrainsFound: allTrains.length,
      candidateCount: candidates.length,
    });

    let evaluatedCount = 0;
    let skippedCount = 0;
    const results: BestTrainCandidateResult[] = [];

    await this.mapWithConcurrency(
      candidates,
      BEST_TRAIN_CONCURRENCY,
      async (train, index) => {
        const trainName = train.trainName?.trim() || null;
        onProgress?.({
          type: 'train_started',
          trainNumber: train.trainNumber,
          trainName,
          index: index + 1,
          total: candidates.length,
        });

        const trainFrom = (train.fromStnCode ?? from).trim().toUpperCase();
        const trainTo = (train.toStnCode ?? to).trim().toUpperCase();
        const rawClasses =
          Array.isArray(train.avlClasses) && train.avlClasses.length > 0
            ? train.avlClasses
            : [...BOOKING_V2_ALTERNATE_PATH_CLASSES];
        const avlClasses = normalizeAndDedupeClassCodes(rawClasses);
        const classesForRequest = acOnly
          ? avlClasses.filter(isAcClassCode)
          : avlClasses;

        if (acOnly && avlClasses.length > 0 && classesForRequest.length === 0) {
          skippedCount += 1;
          onProgress?.({
            type: 'train_done',
            trainNumber: train.trainNumber,
            trainName,
            index: index + 1,
            total: candidates.length,
            result: null,
            skippedReason: 'No AC classes listed for this train',
          });
          return;
        }

        try {
          const alternatePath = await this.findAlternatePaths(
            {
              trainNumber: train.trainNumber,
              from: trainFrom,
              to: trainTo,
              date,
              quota,
              avlClasses: classesForRequest,
            },
            undefined,
            segmentCache,
          );
          evaluatedCount += 1;
          const score = this.scoreBestTrainCandidate(alternatePath);
          const result: BestTrainCandidateResult = {
            train,
            alternatePath,
            score,
            rankReason: this.describeBestTrainScore(score, trainFrom, trainTo),
          };
          if (score.originConfirmed) {
            results.push(result);
          } else {
            skippedCount += 1;
          }
          onProgress?.({
            type: 'train_done',
            trainNumber: train.trainNumber,
            trainName,
            index: index + 1,
            total: candidates.length,
            result: score.originConfirmed ? result : null,
            skippedReason: score.originConfirmed
              ? undefined
              : 'No confirmed ticket starts from the origin',
          });
        } catch (err) {
          skippedCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[booking-v2/best-trains] train=${train.trainNumber} failed: ${message}`,
          );
          onProgress?.({
            type: 'train_done',
            trainNumber: train.trainNumber,
            trainName,
            index: index + 1,
            total: candidates.length,
            result: null,
            skippedReason: message,
          });
        }
      },
    );

    results.sort(compareBestTrainResults);
    onProgress?.({
      type: 'done',
      resultCount: results.length,
      evaluatedCount,
    });

    return {
      from,
      to,
      date,
      acOnly,
      totalTrainsFound: allTrains.length,
      candidatesEvaluated: evaluatedCount,
      candidatesSkipped: skippedCount,
      results,
    };
  }

  // -------------------------------------------------------------------------
  // Precomputed best-train cache (written by the leader-elected cron, read on
  // the request path). Read-only lookups never trigger a compute.
  // -------------------------------------------------------------------------

  /**
   * Read the cached best train for an OD+date, or null on miss/expiry. Pure cache
   * read — never computes. Returns the full record so callers get `cachedAt`.
   */
  async getCachedBestTrain(
    from: string,
    to: string,
    date: string,
  ): Promise<RouteCacheRecord<CachedBestTrain> | null> {
    const key = bestTrainsCacheKey(from, to, this.normalizeToRailApiDate(date));
    if (!key) return null;
    const record = await this.bestTrainsCache.getRecord(key);
    if (record) {
      this.logger.log(
        `[best-trains-cache] HIT key=${key} found=${record.value.found} cachedAt=${record.cachedAt.toISOString()}`,
      );
    } else {
      this.logger.log(`[best-trains-cache] MISS key=${key}`);
    }
    return record;
  }

  /**
   * Compute the best train for an OD+date via findBestTrains and store the trimmed
   * top candidate. Cron-only (expensive). Caches an explicit `found: false` marker
   * when no confirmed candidate exists so the request path shows the CTA rather
   * than treating it as an un-cached route. Returns the top train (or null) so
   * callers (the cron) can record what was updated.
   */
  async computeAndCacheBestTrain(
    from: string,
    to: string,
    date: string,
  ): Promise<{ found: boolean; trainNumber: string | null }> {
    const key = bestTrainsCacheKey(from, to, this.normalizeToRailApiDate(date));
    if (!key) throw new Error('from, to, and a valid date are required');

    // Cron-only path: run the scan's per-segment probes through an in-memory
    // cache so it never writes to the shared Postgres cache_entry (only the
    // final trimmed result is persisted, to route_caching). Protects the DB.
    const result = await this.findBestTrains(
      { from, to, date, acOnly: false },
      undefined,
      new InMemoryCacheService(),
    );
    const found = await this.cacheBestTrainResult(from, to, date, result);
    return { found, trainNumber: result.results[0]?.train.trainNumber ?? null };
  }

  /**
   * Persist the top candidate of an already-computed best-train result under the
   * route cache key. Shared by the cron and the live best-trains endpoint so a
   * real "Find best tickets" scan (full, non-AC) also warms the cache. Trims to
   * the small homepage payload; stores an explicit no-train marker when empty.
   * Best-effort: callers on the request path should not await/throw on this.
   */
  async cacheBestTrainResult(
    from: string,
    to: string,
    date: string,
    result: BestTrainSearchResult,
  ): Promise<boolean> {
    const key = bestTrainsCacheKey(from, to, this.normalizeToRailApiDate(date));
    if (!key) return false;

    const payload = this.buildBestTrainPayload(result);
    await this.bestTrainsCache.set(key, payload, BEST_TRAINS_CACHE_TTL_MS);
    this.logger.log(
      `[best-trains-cache] STORED key=${key} found=${payload.found}${
        payload.found ? ` train=${payload.train.trainNumber}` : ''
      } ttlMs=${BEST_TRAINS_CACHE_TTL_MS}`,
    );
    return payload.found;
  }

  /** Trim a full best-train result to the small homepage cache payload. */
  private buildBestTrainPayload(
    result: BestTrainSearchResult,
  ): CachedBestTrain {
    const top = result.results[0];
    if (!top) return { found: false };
    // Keep only the station names actually referenced by the legs, so the row
    // stays small but the UI can show "Name (CODE)" for each leg endpoint.
    const stationNames: Record<string, string> = {};
    const nameMap = top.alternatePath.stationNameMap ?? {};
    for (const leg of top.alternatePath.legs) {
      for (const code of [leg.from, leg.to]) {
        const c = code?.trim().toUpperCase();
        const name = c ? nameMap[c] : undefined;
        if (c && name && name.trim() && !stationNames[c]) {
          stationNames[c] = name.trim();
        }
      }
    }
    return {
      found: true,
      train: {
        trainNumber: top.train.trainNumber,
        trainName: top.train.trainName?.trim() || null,
        departureTime: top.train.departureTime ?? null,
        arrivalTime: top.train.arrivalTime ?? null,
      },
      legs: top.alternatePath.legs,
      stationNames,
      totalFare: top.alternatePath.totalFare,
      isComplete: top.alternatePath.isComplete,
      rankReason: top.rankReason,
    };
  }

  /**
   * Cron bulk path: compute the trimmed payload + cache key for a route WITHOUT
   * writing (segment probes run through an in-memory cache, so no cache_entry
   * writes). The cron collects these and writes them all in one bulk upsert via
   * bulkStoreBestTrains.
   */
  async computeBestTrainPayload(
    from: string,
    to: string,
    date: string,
  ): Promise<{ key: string; payload: CachedBestTrain } | null> {
    const key = bestTrainsCacheKey(from, to, this.normalizeToRailApiDate(date));
    if (!key) return null;
    const result = await this.findBestTrains(
      { from, to, date, acOnly: false },
      undefined,
      new InMemoryCacheService(),
    );
    return { key, payload: this.buildBestTrainPayload(result) };
  }

  /** Bulk-write precomputed best-train payloads in one upsert (cron path). */
  async bulkStoreBestTrains(
    items: Array<{ key: string; payload: CachedBestTrain }>,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.bestTrainsCache.setMany(
      items.map((i) => ({ key: i.key, value: i.payload })),
      BEST_TRAINS_CACHE_TTL_MS,
    );
  }

  private scoreBestTrainCandidate(
    alternatePath: FindAlternatePathsResult,
  ): BestTrainScore {
    const route = alternatePath.stationCodesOnRoute.map((c) =>
      c.trim().toUpperCase(),
    );
    const routeIndex = new Map(route.map((code, i) => [code, i]));
    const origin = route[0] ?? null;
    let contiguousCursor = origin;
    let contiguousStations = 0;
    let contiguousMinutes = 0;
    let totalStations = 0;
    let totalMinutes = 0;
    let longestStations = 0;
    let longestMinutes = 0;
    let stillContiguous = true;

    for (const leg of alternatePath.legs) {
      if (leg.segmentKind !== 'confirmed') {
        stillContiguous = false;
        continue;
      }
      const from = leg.from.trim().toUpperCase();
      const to = leg.to.trim().toUpperCase();
      const fromIdx = routeIndex.get(from);
      const toIdx = routeIndex.get(to);
      const stationSpan =
        fromIdx != null && toIdx != null && toIdx > fromIdx
          ? toIdx - fromIdx
          : 0;
      const minutes =
        typeof leg.durationMinutes === 'number' && leg.durationMinutes > 0
          ? leg.durationMinutes
          : 0;

      totalStations += stationSpan;
      totalMinutes += minutes;
      longestStations = Math.max(longestStations, stationSpan);
      longestMinutes = Math.max(longestMinutes, minutes);

      if (stillContiguous && contiguousCursor === from && stationSpan > 0) {
        contiguousStations += stationSpan;
        contiguousMinutes += minutes;
        contiguousCursor = to;
      } else {
        stillContiguous = false;
      }
    }

    const firstLeg = alternatePath.legs[0];
    const originConfirmed =
      Boolean(origin) &&
      firstLeg?.segmentKind === 'confirmed' &&
      firstLeg.from.trim().toUpperCase() === origin;

    return {
      originConfirmed,
      confirmedContiguousStationsFromOrigin: contiguousStations,
      confirmedContiguousMinutesFromOrigin: contiguousMinutes,
      totalConfirmedStations: totalStations,
      totalConfirmedMinutes: totalMinutes,
      longestConfirmedLegStations: longestStations,
      longestConfirmedLegMinutes: longestMinutes,
      isComplete: alternatePath.isComplete,
      totalFare: alternatePath.totalFare,
    };
  }

  private describeBestTrainScore(
    score: BestTrainScore,
    from: string,
    to: string,
  ): string {
    if (!score.originConfirmed) {
      return `No confirmed ticket starts from ${from}.`;
    }
    const hours = Math.floor(score.confirmedContiguousMinutesFromOrigin / 60);
    const minutes = score.confirmedContiguousMinutesFromOrigin % 60;
    const duration =
      score.confirmedContiguousMinutesFromOrigin > 0
        ? `${hours > 0 ? `${hours}h ` : ''}${minutes}m`.trim()
        : 'the first confirmed segment';
    if (score.isComplete) {
      return `Confirmed from ${from} to ${to}, covering the full journey.`;
    }
    return `Confirmed from ${from} for ${score.confirmedContiguousStationsFromOrigin} station hop(s), about ${duration}.`;
  }

  private async mapWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const run = async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    };
    const count = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: count }, run));
  }

  private async fetchTrainsFromUpstream(
    from: string,
    to: string,
    dateDdMmYyyy: string,
  ): Promise<unknown> {
    const params = new URLSearchParams({
      sourceStationCode: from.trim().toUpperCase(),
      destinationStationCode: to.trim().toUpperCase(),
      addAvailabilityCache: 'true',
      excludeMultiTicketAlternates: 'false',
      excludeBoostAlternates: 'false',
      sortBy: 'DEFAULT',
      dateOfJourney: dateDdMmYyyy,
      enableNearby: 'true',
      enableTG: 'true',
      tGPlan: 'CTG-A36',
      showTGPrediction: 'false',
      tgColor: 'DEFAULT',
      showPredictionGlobal: 'true',
      showNewAlternates: 'true',
      showNewAltText: 'true',
    });
    const url = `${BOOKING_V2_RAIL_API_BASE.trainsSearch}?${params}`;
    const res = await fetchWithTimeout(url, {
      headers: BOOKING_V2_RAIL_API_HEADERS,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/trains/search] upstream ${res.status} body=${text.slice(0, 200)}`,
      );
      throw new Error(`Train search failed: ${res.status}`);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      const sanitized = this.sanitizeVendorStatusKeys(parsed);
      return filterDepartedTrainsFromSearchResponse(sanitized);
    } catch {
      throw new Error('Train search: invalid JSON');
    }
  }

  /** Recursively expose `railDataStatus` instead of legacy vendor-only JSON keys. */
  private sanitizeVendorStatusKeys(node: unknown): unknown {
    if (node == null) return node;
    if (Array.isArray(node)) {
      return node.map((x) => this.sanitizeVendorStatusKeys(x));
    }
    if (typeof node !== 'object') return node;
    const legacyKey = Buffer.from(
      'Y29uZmlybVRrdFN0YXR1cw==',
      'base64',
    ).toString('utf8');
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === legacyKey) {
        out.railDataStatus = this.sanitizeVendorStatusKeys(v);
        continue;
      }
      out[k] = this.sanitizeVendorStatusKeys(v);
    }
    return out;
  }

  async checkAvailability(
    trainNo: string,
    from: string,
    to: string,
    dateInput: string,
    travelClass: string,
    quota: string,
  ): Promise<unknown> {
    const dateDdMmYyyy = this.normalizeToRailApiDate(dateInput);
    if (!dateDdMmYyyy) throw new Error('Invalid journey date');
    const params = new URLSearchParams({
      trainNo: String(trainNo).trim(),
      sourceStationCode: from.trim().toUpperCase(),
      destinationStationCode: to.trim().toUpperCase(),
      dateOfJourney: dateDdMmYyyy,
      quota: quota.trim().toUpperCase() || 'GN',
      travelClass: travelClass.trim().toUpperCase() || 'SL',
      enableTG: 'true',
      tGPlan: 'CTG-A36',
      showTGPrediction: 'false',
      tgColor: 'DEFAULT',
      showPredictionGlobal: 'true',
      showNewMealOptions: 'true',
      showNewAlternates: 'false',
      showNewAltText: 'true',
    });
    const url = `${BOOKING_V2_RAIL_API_BASE.fetchAvailability}?${params}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS,
      body: '',
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/availability] upstream ${res.status} train=${trainNo} ${from}-${to} body=${text.slice(0, 200)}`,
      );
      throw new Error(`Availability request failed: ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Availability: invalid JSON');
    }
  }

  /**
   * Cache-aware wrapper around findAlternatePaths, keyed by
   * route + train + class-set + date (see alternatePathsCacheKey). On a hit,
   * returns the stored result immediately (no IRCTC calls, no progress events);
   * on a miss, computes with progress and stores the result. Used by the
   * user-facing /alternate-paths endpoints so "Find in SL" / "Search all classes"
   * both populate and read the same route_caching table. `cached` tells the
   * caller which path was taken (for logging / client hints).
   */
  async findAlternatePathsCached(
    input: {
      trainNumber: string;
      from: string;
      to: string;
      date: string;
      avlClasses?: string[];
      quota?: string;
    },
    onProgress?: (event: AlternatePathProgressEvent) => void,
  ): Promise<{ result: FindAlternatePathsResult; cached: boolean }> {
    const key = alternatePathsCacheKey(
      input.from,
      input.to,
      input.trainNumber,
      input.avlClasses,
      this.normalizeToRailApiDate(input.date),
    );

    if (key) {
      const hit = await this.altPathsCache.get(key);
      if (hit) {
        this.logger.log(`[alt-paths-cache] HIT key=${key}`);
        return { result: hit, cached: true };
      }
      this.logger.log(`[alt-paths-cache] MISS key=${key}`);
    }

    const result = await this.findAlternatePaths(input, onProgress);

    if (key) {
      // Trim the (potentially large) debug trace before persisting.
      const toStore: FindAlternatePathsResult = { ...result, debugLog: [] };
      await this.altPathsCache.set(key, toStore, ALT_PATHS_CACHE_TTL_MS);
      this.logger.log(
        `[alt-paths-cache] STORED key=${key} legs=${result.legCount} complete=${result.isComplete} ttlMs=${ALT_PATHS_CACHE_TTL_MS}`,
      );
    }
    return { result, cached: false };
  }

  async findAlternatePaths(
    input: {
      trainNumber: string;
      from: string;
      to: string;
      date: string;
      avlClasses?: string[];
      quota?: string;
    },
    onProgress?: (event: AlternatePathProgressEvent) => void,
    segmentCache?: CacheService,
  ): Promise<FindAlternatePathsResult> {
    const sharedProbeCache = new Map<string, MultiClassProbeResult>();

    // Probe only the classes the train actually offers. When the caller didn't
    // supply avlClasses, resolve them once (DB-first, RapidAPI fallback) so we
    // don't fan out across every possible class — cuts the per-request probe
    // count ~2-4x. Falls back to the full class list only if classes are unknown.
    if (!input.avlClasses || input.avlClasses.length === 0) {
      const trainClasses = await this.irctc.getTrainClasses(input.trainNumber);
      if (trainClasses.length > 0) {
        input = { ...input, avlClasses: trainClasses };
      }
    }

    // Each internal pass (direct + every ±station offset combo) emits its own
    // `done`. Suppress those — otherwise the client shows "Search complete" as
    // soon as the direct pass finishes, while the offset retries are still
    // running and the final result hasn't been sent. We emit a single `done`
    // at the true end (see `finish`). Non-`done` events still stream through so
    // the loader keeps showing progress across all passes.
    const passProgress: typeof onProgress = onProgress
      ? (event) => {
          if (event.type !== 'done') onProgress(event);
        }
      : undefined;
    const finish = (
      result: FindAlternatePathsResult,
    ): FindAlternatePathsResult => {
      onProgress?.({
        type: 'done',
        isComplete: result.isComplete,
        legCount: result.legs.length,
        totalFare: result.totalFare,
      });
      return result;
    };

    // 1. Try standard/direct route first (no offsets)
    const directResult = await this.findAlternatePathsInternal(
      input,
      passProgress,
      sharedProbeCache,
      segmentCache,
    );
    if (
      directResult.isComplete &&
      directResult.legs.length > 0 &&
      directResult.legs.every((l) => l.segmentKind === 'confirmed')
    ) {
      return finish(directResult);
    }

    // 2. If direct is not fully confirmed, try offset fallbacks
    const maxOffset = BOOKING_V2_MAX_STATIONS_OFFSET;
    for (let offset = 1; offset <= maxOffset; offset++) {
      const combos = [
        { before: offset, after: 0 },
        { before: 0, after: offset },
        { before: offset, after: offset },
      ];

      for (const combo of combos) {
        this.logger.log(
          `[alternate-paths ${input.trainNumber}] Retrying with offset combo: before=${combo.before}, after=${combo.after}`,
        );
        const offsetResult = await this.findAlternatePathsInternal(
          {
            ...input,
            stationsBefore: combo.before,
            stationsAfter: combo.after,
          },
          passProgress,
          sharedProbeCache,
          segmentCache,
        );

        if (
          offsetResult.isComplete &&
          offsetResult.legs.length > 0 &&
          offsetResult.legs.every((l) => l.segmentKind === 'confirmed')
        ) {
          this.logger.log(
            `[alternate-paths ${input.trainNumber}] Found fully confirmed path using offset: before=${combo.before}, after=${combo.after}`,
          );
          return finish(offsetResult);
        }
      }
    }

    // 3. Fallback to standard result if no fully confirmed path is found with offsets
    return finish(directResult);
  }

  async findAlternatePathsInternal(
    input: {
      trainNumber: string;
      from: string;
      to: string;
      date: string;
      avlClasses?: string[];
      quota?: string;
      stationsBefore?: number;
      stationsAfter?: number;
    },
    onProgress?: (event: AlternatePathProgressEvent) => void,
    sharedProbeCache?: Map<string, MultiClassProbeResult>,
    segmentCache?: CacheService,
  ): Promise<FindAlternatePathsResult> {
    const emit = (ev: AlternatePathProgressEvent) => onProgress?.(ev);
    const trainNumber = String(input.trainNumber).trim();
    const from = String(input.from).trim().toUpperCase();
    const to = String(input.to).trim().toUpperCase();
    const quota = String(input.quota ?? 'GN')
      .trim()
      .toUpperCase();
    const dateDdMmYyyy = this.normalizeToRailApiDate(input.date);
    const debugLog: string[] = [];
    const logStep = (msg: string) => {
      debugLog.push(msg);
      this.logger.log(`[alternate-paths ${trainNumber}] ${msg}`);
    };

    if (!trainNumber || !from || !to || !dateDdMmYyyy) {
      throw new Error('trainNumber, from, to, and valid date are required');
    }

    const fromTrain = normalizeAndDedupeClassCodes(input.avlClasses ?? []);
    const classes =
      fromTrain.length > 0 ? fromTrain : [...BOOKING_V2_ALTERNATE_PATH_CLASSES];

    logStep(
      `Start: ${from} → ${to} (offsets: before=${input.stationsBefore ?? 0}, after=${input.stationsAfter ?? 0}) | journeyDate=${input.date} (DD-MM-YYYY ${dateDdMmYyyy}) | probeClasses=${classes.join(',')} (${fromTrain.length ? 'from train avlClasses' : 'fallback list'}) quota=${quota}`,
    );

    const stationNameMap: Record<string, string> = {};

    const sched = await this.irctc.getTrainSchedule(trainNumber);
    if (!sched.ok || !sched.schedule?.stationList?.length) {
      logStep(
        `IRCTC schedule: FAILED or empty (ok=${sched.ok}) — cannot list intermediate stops`,
      );
      emit({ type: 'schedule_fail' });
      return {
        trainNumber,
        legs: [],
        totalFare: null,
        legCount: 0,
        isComplete: false,
        stationCodesOnRoute: [],
        stationNameMap,
        trainOriginCode: null,
        trainOriginDepartureTime: null,
        remainderMergedSchedule: null,
        debugLog,
      };
    }

    logStep(
      `IRCTC schedule: OK — ${sched.schedule.stationList.length} stops on full route (${sched.schedule.trainName ?? 'train'})`,
    );
    emit({
      type: 'schedule_ok',
      trainName: sched.schedule.trainName ?? null,
      stopCount: sched.schedule.stationList.length,
    });

    const stationList = sched.schedule.stationList;

    // Build a code→name lookup from the full schedule (upper-cased keys).
    for (const st of stationList) {
      const code = String(st.stationCode ?? '')
        .trim()
        .toUpperCase();
      const name = String(st.stationName ?? '').trim();
      if (code && name) stationNameMap[code] = name;
    }

    // Find index of from and to in stationList to construct offset slice
    const codes = stationList
      .map((s) =>
        String(s.stationCode ?? '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);
    let fromIdx = -1;
    let toIdx = -1;
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === from) {
        for (let j = i + 1; j < codes.length; j++) {
          if (codes[j] === to) {
            fromIdx = i;
            toIdx = j;
            break;
          }
        }
        if (fromIdx !== -1) break;
      }
    }

    if (fromIdx < 0 || toIdx < 0) {
      logStep(
        `Route slice: FAILED — "${from}" or "${to}" not found in order on this train (or same station)`,
      );
      emit({ type: 'route_fail', from, to });
      return {
        trainNumber,
        legs: [],
        totalFare: null,
        legCount: 0,
        isComplete: false,
        stationCodesOnRoute: [],
        stationNameMap,
        trainOriginCode: null,
        trainOriginDepartureTime: null,
        remainderMergedSchedule: null,
        debugLog,
      };
    }

    const startIdx = Math.max(0, fromIdx - (input.stationsBefore ?? 0));
    const endIdx = Math.min(
      stationList.length - 1,
      toIdx + (input.stationsAfter ?? 0),
    );
    const stations = codes.slice(startIdx, endIdx + 1);

    logStep(
      `Route slice: ${stations.length} stops from boarding to destination: ${stations.join(' → ')}`,
    );
    emit({ type: 'route_ok', from, to, stopCount: stations.length });

    const legTim = (fromSt: string, toSt: string) =>
      legScheduleTiming(stationList, fromSt, toSt);

    const legs: AlternatePathLeg[] = [];
    let currentIdx = 0;
    const targetIdx = stations.length - 1;
    let hop = 0;
    const probeCache =
      sharedProbeCache ?? new Map<string, MultiClassProbeResult>();
    const maxIterations = Math.max(8, stations.length * 4);
    let iterations = 0;

    const boardingStopLine = stationList[fromIdx];
    const boardingDayCount =
      parseScheduleDayCount(boardingStopLine?.dayCount) ?? 1;
    const trainStartMoment = moment(dateDdMmYyyy, 'DD-MM-YYYY').subtract(
      boardingDayCount - 1,
      'days',
    );

    const cacheKey = (a: string, b: string, d: string) => `${a}|${b}|${d}`;

    while (currentIdx < targetIdx && iterations < maxIterations) {
      iterations += 1;
      hop += 1;
      const destOrder = orderedDestinationIndices(currentIdx, targetIdx);
      const waveLabels = destOrder.map(
        (i) => `${stations[currentIdx]}→${stations[i]}`,
      );
      logStep(
        `Hop ${hop}: at ${stations[currentIdx]} — parallel fetch (${destOrder.length} ODs × ${classes.length} classes), manual priority: ${waveLabels.join(' > ')}; first confirmed in this order wins`,
      );

      const probes: MultiClassProbeResult[] = new Array(destOrder.length);
      await this.mapWithConcurrency(
        destOrder,
        ALT_PATH_PROBE_CONCURRENCY,
        async (destIdx, w) => {
          const fromStn = stations[currentIdx];
          const fromStopLine = stationList[startIdx + currentIdx];
          const fromDayCount =
            parseScheduleDayCount(fromStopLine?.dayCount) ?? 1;
          const currentHopDate = trainStartMoment
            .clone()
            .add(fromDayCount - 1, 'days')
            .format('DD-MM-YYYY');

          const toStn = stations[destIdx];
          const key = cacheKey(fromStn, toStn, currentHopDate);
          let probe = probeCache.get(key);
          if (!probe) {
            probe = await this.probeSegmentAllClasses(
              trainNumber,
              fromStn,
              toStn,
              currentHopDate,
              classes,
              quota,
              segmentCache,
            );
            probeCache.set(key, probe);
          }
          probes[w] = probe;
        },
      );

      let chosenDestIdx: number | null = null;
      let chosenProbe: MultiClassProbeResult | null = null;
      for (let w = 0; w < destOrder.length; w++) {
        const destIdx = destOrder[w];
        const fromStn = stations[currentIdx];
        const toStn = stations[destIdx];
        const probe = probes[w];
        logStep(this.formatMultiClassProbeLine(fromStn, toStn, probe, classes));
        if (probe.bestConfirmedClassIndex != null) {
          chosenDestIdx = destIdx;
          chosenProbe = probe;
          break;
        }
      }

      if (
        chosenDestIdx != null &&
        chosenProbe != null &&
        chosenProbe.bestConfirmedClassIndex != null
      ) {
        const bc = chosenProbe.bestConfirmedClassIndex;
        const picked = chosenProbe.perClass[bc];
        const day = picked.day;
        logStep(
          `Hop ${hop}: CHOSEN ${stations[currentIdx]} → ${stations[chosenDestIdx]} | class=${classes[bc]}${picked.fare != null ? ` fare ₹${picked.fare}` : ''}`,
        );
        emit({
          type: 'hop_confirmed',
          from: stations[currentIdx],
          to: stations[chosenDestIdx],
          travelClass: classes[bc],
          fare: picked.fare,
          hopIndex: hop,
        });
        const chosenFromStopLine = stationList[startIdx + currentIdx];
        const chosenFromDayCount =
          parseScheduleDayCount(chosenFromStopLine?.dayCount) ?? 1;
        const chosenLegBoardingDate = trainStartMoment
          .clone()
          .add(chosenFromDayCount - 1, 'days')
          .format('YYYY-MM-DD');

        legs.push({
          from: stations[currentIdx],
          to: stations[chosenDestIdx],
          segmentKind: 'confirmed',
          travelClass: classes[bc],
          railDataStatus: day ? String(day.vendorPredictionStatus ?? '') : null,
          availablityStatus: day ? String(day.availablityStatus ?? '') : null,
          predictionPercentage: day
            ? String(day.predictionPercentage ?? '')
            : null,
          availabilityDisplayName: day
            ? String(day.availabilityDisplayName ?? '')
            : null,
          fare: picked.fare,
          confirmedClassOptions: this.buildConfirmedClassOptions(
            chosenProbe.perClass,
            classes,
          ),
          ...legTim(stations[currentIdx], stations[chosenDestIdx]),
          boardingDate: chosenLegBoardingDate,
          dayOffset: chosenFromDayCount - 1,
        });
        currentIdx = chosenDestIdx;
        continue;
      }

      const nextIdx = currentIdx + 1;
      if (nextIdx > targetIdx) {
        logStep(`Hop ${hop}: cannot advance past ${stations[targetIdx]}`);
        break;
      }

      const fromStn = stations[currentIdx];
      const fromStopLine = stationList[startIdx + currentIdx];
      const fromDayCount = parseScheduleDayCount(fromStopLine?.dayCount) ?? 1;
      const bridgeLegBoardingDate = trainStartMoment
        .clone()
        .add(fromDayCount - 1, 'days')
        .format('YYYY-MM-DD');
      const bridgeDate = trainStartMoment
        .clone()
        .add(fromDayCount - 1, 'days')
        .format('DD-MM-YYYY');

      const toStn = stations[nextIdx];
      const key = cacheKey(fromStn, toStn, bridgeDate);
      let bridge = probeCache.get(key);
      if (!bridge) {
        bridge = await this.probeSegmentAllClasses(
          trainNumber,
          fromStn,
          toStn,
          bridgeDate,
          classes,
          quota,
          segmentCache,
        );
        probeCache.set(key, bridge);
      }
      logStep(
        `Hop ${hop}: no confirmed segment in destination order — bridge ${fromStn} → ${toStn} (check realtime)`,
      );
      logStep(this.formatMultiClassProbeLine(fromStn, toStn, bridge, classes));
      emit({
        type: 'hop_unavailable',
        from: fromStn,
        to: toStn,
        hopIndex: hop,
      });

      if (bridge.bestConfirmedClassIndex != null) {
        const bc: number = bridge.bestConfirmedClassIndex;
        const picked = bridge.perClass[bc];
        const day = picked.day;
        logStep(
          `Hop ${hop}: bridge segment is confirmed in ${classes[bc]}${picked.fare != null ? ` fare ₹${picked.fare}` : ''}`,
        );
        emit({
          type: 'hop_confirmed',
          from: fromStn,
          to: toStn,
          travelClass: classes[bc],
          fare: picked.fare,
          hopIndex: hop,
        });
        legs.push({
          from: fromStn,
          to: toStn,
          segmentKind: 'confirmed',
          travelClass: classes[bc],
          railDataStatus: day ? String(day.vendorPredictionStatus ?? '') : null,
          availablityStatus: day ? String(day.availablityStatus ?? '') : null,
          predictionPercentage: day
            ? String(day.predictionPercentage ?? '')
            : null,
          availabilityDisplayName: day
            ? String(day.availabilityDisplayName ?? '')
            : null,
          fare: picked.fare,
          confirmedClassOptions: this.buildConfirmedClassOptions(
            bridge.perClass,
            classes,
          ),
          ...legTim(fromStn, toStn),
          boardingDate: bridgeLegBoardingDate,
          dayOffset: fromDayCount - 1,
        });
      } else {
        const disp = bridge.displayRow;
        legs.push({
          from: fromStn,
          to: toStn,
          segmentKind: 'check_realtime',
          travelClass: null,
          railDataStatus: disp
            ? String(disp.vendorPredictionStatus ?? '')
            : null,
          availablityStatus: disp ? String(disp.availablityStatus ?? '') : null,
          predictionPercentage: disp
            ? String(disp.predictionPercentage ?? '')
            : null,
          availabilityDisplayName: disp
            ? String(disp.availabilityDisplayName ?? '')
            : null,
          fare: null,
          confirmedClassOptions: [],
          ...legTim(fromStn, toStn),
          boardingDate: bridgeLegBoardingDate,
          dayOffset: fromDayCount - 1,
        });
      }
      currentIdx = nextIdx;
    }

    const confirmedLegs = legs.filter((l) => l.segmentKind === 'confirmed');
    const totalFare =
      confirmedLegs.length > 0 &&
      confirmedLegs.every((l) => typeof l.fare === 'number')
        ? confirmedLegs.reduce((s, l) => s + (l.fare ?? 0), 0)
        : null;

    const hasRealtime = legs.some((l) => l.segmentKind === 'check_realtime');
    const isComplete =
      !hasRealtime &&
      legs.length > 0 &&
      legs[legs.length - 1].to === stations[targetIdx];

    if (currentIdx < targetIdx) {
      logStep(
        `Stopped before final stop ${stations[targetIdx]} (still at ${stations[currentIdx]} after ${iterations} iteration(s))`,
      );
    }

    logStep(
      `Done: isComplete=${isComplete} legs=${legs.length}${totalFare != null ? ` totalFare=₹${totalFare}` : ''}`,
    );
    emit({ type: 'done', isComplete, legCount: legs.length, totalFare });

    const journeyDest = stations[targetIdx] ?? to;
    const remainderEp = collapsibleRealtimeRemainderEndpoints(
      legs,
      journeyDest,
    );
    const remainderMergedSchedule: AlternatePathRemainderMergedSchedule | null =
      remainderEp != null
        ? {
            from: remainderEp.from,
            to: remainderEp.to,
            ...legScheduleTiming(stationList, remainderEp.from, remainderEp.to),
          }
        : null;

    return {
      trainNumber,
      legs,
      totalFare,
      legCount: legs.length,
      isComplete,
      stationCodesOnRoute: stations,
      stationNameMap,
      remainderMergedSchedule,
      trainOriginCode:
        stationList[0]?.stationCode?.trim().toUpperCase() || null,
      trainOriginDepartureTime: stationList[0]?.departureTime ?? null,
      debugLog,
      trainStartDate: trainStartMoment.format('YYYY-MM-DD'),
    };
  }

  /** One-line per segment: each probed class with the availability snapshot used. */
  private formatMultiClassProbeLine(
    fromStn: string,
    toStn: string,
    probe: MultiClassProbeResult,
    classCodes: readonly string[],
  ): string {
    const parts = classCodes.map((code, i) => {
      const p = probe.perClass[i];
      const label = p ? this.formatPerClassAvailabilityLabel(p) : 'missing';
      return `${code} (${label})`;
    });
    const best = probe.bestConfirmedClassIndex;
    const bestStr =
      best != null && classCodes[best]
        ? ` | picked ${classCodes[best]}`
        : ' | no confirmed class';
    return `  ${fromStn} → ${toStn} — ${parts.join(', ')}${bestStr}`;
  }

  /** Human-readable label from one fetchAvailability row (debug / UI). */
  private formatPerClassAvailabilityLabel(row: SegmentProbeRow): string {
    if (row.fetchError) {
      const m = row.fetchError.trim();
      return m.length > 28 ? `${m.slice(0, 25)}…` : m;
    }
    if (!row.day) {
      return 'no row';
    }
    const day = row.day;
    const disp = String(day.availabilityDisplayName ?? '').trim();
    const st = String(day.availablityStatus ?? '').trim();
    const ct = String(day.vendorPredictionStatus ?? '').trim();
    const at = parseUpstreamAvailablityType(day.availablityType);

    if (at === 3) {
      return disp ? `Waiting (${this.shortenDebugLabel(disp, 20)})` : 'Waiting';
    }
    if (at === 1) {
      return disp ? this.shortenDebugLabel(disp, 24) : 'Available';
    }

    if (isLegConfirmed(day)) {
      if (disp) return this.shortenDebugLabel(disp, 24);
      if (st.toUpperCase().startsWith('AVAILABLE')) {
        const tail = st
          .replace(/^AVAILABLE/i, '')
          .replace(/^[-#]/, '')
          .slice(0, 14);
        return tail ? `Avail ${tail}` : 'Available';
      }
      return ct ? this.shortenDebugLabel(ct, 24) : 'Confirmed';
    }

    const du = disp.toUpperCase();
    const su = st.toUpperCase();
    if (du.includes('WL') || du.includes('WAITLIST') || su.includes('WL')) {
      const num =
        disp.match(/WL\D*(\d+)/i)?.[1] ??
        st.match(/WL\D*(\d+)/i)?.[1] ??
        disp.match(/(\d+)/)?.[1];
      return num ? `WL-${num}` : 'WL';
    }
    if (du.includes('RAC') || su.includes('RAC')) {
      return disp ? this.shortenDebugLabel(disp, 24) : 'RAC';
    }
    if (du.includes('REGRET') || su.includes('REGRET')) {
      return 'Regret';
    }
    if (disp) return this.shortenDebugLabel(disp, 24);
    if (ct) return this.shortenDebugLabel(ct, 24);
    if (st) return this.shortenDebugLabel(st, 24);
    return '?';
  }

  private shortenDebugLabel(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(1, max - 1))}…`;
  }

  /** Build all confirmed class options sorted cheapest-first. */
  private buildConfirmedClassOptions(
    perClass: SegmentProbeRow[],
    classCodes: readonly string[],
  ): AlternatePathClassOption[] {
    const options: Array<AlternatePathClassOption & { fareN: number }> = [];
    for (let i = 0; i < perClass.length; i++) {
      const row = perClass[i];
      if (!row || !isLegConfirmed(row.day)) continue;
      const day = row.day;
      const fareN =
        typeof row.fare === 'number' && !Number.isNaN(row.fare)
          ? row.fare
          : Number.POSITIVE_INFINITY;
      options.push({
        travelClass: classCodes[i] ?? '',
        railDataStatus: day ? String(day.vendorPredictionStatus ?? '') : null,
        availablityStatus: day ? String(day.availablityStatus ?? '') : null,
        predictionPercentage: day
          ? String(day.predictionPercentage ?? '')
          : null,
        availabilityDisplayName: day
          ? String(day.availabilityDisplayName ?? '')
          : null,
        fare: row.fare,
        fareN,
      });
    }
    options.sort(
      (a, b) => a.fareN - b.fareN || a.travelClass.localeCompare(b.travelClass),
    );
    return options.map(({ fareN: _fareN, ...rest }) => rest);
  }

  private pickBestConfirmedClassIndex(
    perClass: SegmentProbeRow[],
  ): number | null {
    let best: { i: number; fare: number } | null = null;
    for (let i = 0; i < perClass.length; i++) {
      const row = perClass[i]?.day;
      if (!isLegConfirmed(row)) continue;
      const fare = perClass[i]?.fare;
      const fareN =
        typeof fare === 'number' && !Number.isNaN(fare)
          ? fare
          : Number.POSITIVE_INFINITY;
      if (
        best == null ||
        fareN < best.fare ||
        (fareN === best.fare && i < best.i)
      ) {
        best = { i, fare: fareN };
      }
    }
    return best?.i ?? null;
  }

  private async probeSegmentAllClasses(
    trainNo: string,
    fromStn: string,
    toStn: string,
    dateDdMmYyyy: string,
    classCodes: readonly string[],
    quota: string,
    segmentCache?: CacheService,
  ): Promise<MultiClassProbeResult> {
    const perClass = await Promise.all(
      classCodes.map((c) =>
        this.fetchSegmentAvailability(
          trainNo,
          fromStn,
          toStn,
          dateDdMmYyyy,
          c,
          quota,
          segmentCache,
        ),
      ),
    );
    const bestConfirmedClassIndex = this.pickBestConfirmedClassIndex(perClass);
    const displayRow = perClass.find((p) => p.day)?.day ?? null;
    return { perClass, bestConfirmedClassIndex, displayRow };
  }

  private async fetchSegmentAvailability(
    trainNo: string,
    fromStn: string,
    toStn: string,
    dateDdMmYyyy: string,
    travelClass: string,
    quota: string,
    segmentCache?: CacheService,
  ): Promise<{
    day: AvlDayRow | null;
    fare: number | null;
    fetchError?: string;
  }> {
    // The cron passes an in-memory cache so its probes never touch Postgres;
    // user requests fall through to the shared Postgres cache.
    const cache = segmentCache ?? this.cache;
    const cacheKey = `avl:${String(trainNo).trim()}:${fromStn.trim().toUpperCase()}:${toStn.trim().toUpperCase()}:${dateDdMmYyyy}:${travelClass.trim().toUpperCase()}:${(quota || 'GN').trim().toUpperCase()}`;
    const cached = await cache
      .get<{ day: AvlDayRow | null; fare: number | null }>(cacheKey)
      .catch(() => null);
    if (cached) return cached;

    try {
      const raw = await this.checkAvailability(
        trainNo,
        fromStn,
        toStn,
        dateDdMmYyyy,
        travelClass,
        quota,
      );
      const day = this.extractAvlDay(raw, dateDdMmYyyy);
      const fare = this.extractFare(raw);
      const result = { day, fare };
      // Cache only successful probes (never errors) for a short window.
      void cache
        .set(cacheKey, result, AVL_SEGMENT_TTL_MS)
        .catch(() => undefined);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[booking-v2] availability segment failed ${trainNo} ${fromStn}-${toStn}: ${msg}`,
      );
      return { day: null, fare: null, fetchError: msg };
    }
  }

  private extractAvlDay(raw: unknown, dateDdMmYyyy: string): AvlDayRow | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = (raw as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return null;
    const list = (data as Record<string, unknown>).avlDayList;
    if (!Array.isArray(list)) return null;
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const ad = r.availablityDate;
      if (
        typeof ad === 'string' &&
        avlDayMatchesJourneyDate(ad, dateDdMmYyyy)
      ) {
        return this.normalizeAvlDayRow(r);
      }
    }
    const first = list[0] as unknown;
    if (first && typeof first === 'object')
      return this.normalizeAvlDayRow(first as Record<string, unknown>);
    return null;
  }

  private extractFare(raw: unknown): number | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = (raw as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return null;
    const fi = (data as Record<string, unknown>).fareInfo;
    if (!fi || typeof fi !== 'object') return null;
    const tf = (fi as Record<string, unknown>).totalFare;
    if (typeof tf === 'number' && !Number.isNaN(tf)) return tf;
    if (typeof tf === 'string') {
      const n = parseFloat(tf);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  async getPnrStatus(pnr: string): Promise<any> {
    const key =
      process.env.RAPIDAPI_IRCTC_KEY ??
      process.env.IRCTC_RAPIDAPI_KEY ??
      process.env.RAPIDAPI_KEY ??
      '9e95d7e163msh2f68cfcffd3392ep1ee859jsnc3dc7e695e20';

    this.logger.log(`[pnr] Fetching PNR status for ${pnr}`);

    try {
      const response = await axios.get(
        'https://irctc1.p.rapidapi.com/api/v3/getPNRStatus',
        {
          params: { pnrNumber: pnr },
          headers: {
            'x-rapidapi-key': key,
            'x-rapidapi-host': 'irctc1.p.rapidapi.com',
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[pnr] Failed to fetch PNR status for ${pnr}: ${errMsg}`,
      );
      throw new Error(`Failed to fetch PNR status: ${errMsg}`);
    }
  }
}
