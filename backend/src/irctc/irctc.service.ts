import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { captureSentryException } from '../common/sentry-report';
import moment from 'moment';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { fetchWithTimeout } from '../common/fetch-with-timeout';
import { buildCurl, curlLogEnabled } from '../common/curl-log';
import { IrctcBrowserFallbackService } from './irctc-browser-fallback.service';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';

const scheduleClient = createRetryingAxiosClient({
  serviceName: 'irctc/schedule',
});
const rapidApiScheduleClient = createRetryingAxiosClient({
  serviceName: 'rapidapi/train-search',
  retries: 2,
  retryTimeouts: true,
});
// trainCompositionClient is replaced by gotScraping

const IRCTC_SCHEDULE_URL =
  'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry';
const IRCTC_VACANT_BERTH_URL =
  'https://www.irctc.co.in/online-charts/api/vacantBerth';
const IRCTC_COACH_COMPOSITION_URL =
  'https://www.irctc.co.in/online-charts/api/coachComposition';
const IRCTC_TRAIN_COMPOSITION_URL =
  'https://www.irctc.co.in/online-charts/api/trainComposition';
const RAPIDAPI_TRAIN_SEARCH_URL =
  'https://irctc1.p.rapidapi.com/api/v1/getTrainSchedule';
const RAPIDAPI_SEARCH_STATION_URL =
  'https://irctc1.p.rapidapi.com/api/v1/searchStation';
const RAPIDAPI_TRAIN_CLASSES_URL =
  'https://irctc1.p.rapidapi.com/api/v1/getTrainClasses';
const IRCTC_SCHEDULE_TIMEOUT_MS = 5_000;
const RAPIDAPI_TRAIN_SEARCH_TIMEOUT_MS = 10_000;
const RAPIDAPI_SEARCH_STATION_TIMEOUT_MS = 8_000;
const RAPIDAPI_TRAIN_CLASSES_TIMEOUT_MS = 8_000;
const IRCTC_TRAIN_COMPOSITION_TIMEOUT_MS = 30_000;

/**
 * TrainScheduleCache row fields used here (`train_runs_on` in DB).
 * Keeps typings aligned with prisma/schema.prisma if the TS server picks up an older generated client.
 */
type TrainScheduleCacheScheduleRow = {
  trainNumber: string;
  trainName: string;
  stationFrom: string;
  stationTo: string;
  stationList: Prisma.JsonValue;
  trainRunsOn: Prisma.JsonValue | null;
};

function strFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  return '';
}

/** Parse "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" to { date, time } (time as HH:MM). */
function parseChartDateTime(
  value: string | null | undefined,
): { date: string; time: string } | null {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const time = `${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`;
  return { date: m[1], time };
}

// Headers matching working curl for schedule API (same order/values as browser)
const SCHEDULE_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  bmirak: 'webbm',
  dnt: '1',
  priority: 'u=1, i',
  referer: 'https://www.irctc.co.in/online-charts/',
  'sec-ch-ua':
    '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

/**
 * Indian Railways train numbers are 5 digits, so a leading-zero number like
 * "01921" can get stored/passed around as "1921". IRCTC's trainComposition API
 * only recognises the 5-digit form, so normalize 1–4 digit numbers by left-
 * padding with zeros. 5+ digit or non-numeric values pass through unchanged.
 */
export function to5DigitTrainNo(trainNo: string | number | null | undefined): string {
  const t = String(trainNo ?? '').trim();
  return /^\d{1,4}$/.test(t) ? t.padStart(5, '0') : t;
}

export type TrainOption = { number: string; label: string };

export type ScheduleStation = {
  stationCode: string;
  stationName: string;
  arrivalTime?: string;
  departureTime?: string;
  [k: string]: unknown;
};

/** IRCTC `trnscheduleenquiry` weekday flags (Y/N). */
export type TrainRunsOnJson = Partial<
  Record<
    | 'trainRunsOnMon'
    | 'trainRunsOnTue'
    | 'trainRunsOnWed'
    | 'trainRunsOnThu'
    | 'trainRunsOnFri'
    | 'trainRunsOnSat'
    | 'trainRunsOnSun',
    string
  >
>;

const TRAIN_RUNS_ON_KEYS = [
  'trainRunsOnMon',
  'trainRunsOnTue',
  'trainRunsOnWed',
  'trainRunsOnThu',
  'trainRunsOnFri',
  'trainRunsOnSat',
  'trainRunsOnSun',
] as const satisfies readonly (keyof TrainRunsOnJson)[];

function extractTrainRunsOnFromIrctc(
  raw: Record<string, unknown>,
): TrainRunsOnJson | undefined {
  const out: TrainRunsOnJson = {};
  for (const k of TRAIN_RUNS_ON_KEYS) {
    const v = raw[k];
    if (v === 'Y' || v === 'N') {
      out[k] = v;
      continue;
    }
    if (typeof v === 'string') {
      const t = v.trim().toUpperCase();
      if (t === 'Y' || t === 'N') out[k] = t;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type TrainScheduleResponse = {
  trainNumber: string;
  trainName: string;
  stationFrom: string;
  stationTo: string;
  stationList: ScheduleStation[];
  trainRunsOn?: TrainRunsOnJson;
};

/** IRCTC schedule API returned `errorMessage` (maintenance / downtime). */
export class IrctcScheduleMaintenanceError extends Error {
  readonly code = 'IRCTC_MAINTENANCE' as const;
  constructor(public readonly irctcMessage: string) {
    super(irctcMessage);
    this.name = 'IrctcScheduleMaintenanceError';
  }
}

export type GetTrainScheduleResult =
  | { ok: true; schedule: TrainScheduleResponse }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'maintenance'; message: string };

export type GetTrainScheduleOptions = {
  forceRefresh?: boolean;
  /** When `TrainScheduleCache` has no weekday flags, call trainComposition and persist `train_runs_on`. */
  fillRunsOnFromComposition?: {
    jDate: string;
    boardingStation: string;
  };
};

export type TrainCompositionCddItem = {
  coachName: string;
  classCode: string;
  positionFromEngine: number;
  vacantBerths: number;
};

export type TrainCompositionResponse = {
  cdd: TrainCompositionCddItem[];
  trainNo: string;
  trainName: string;
  from: string;
  to: string;
  trainStartDate: string;
  remoteLocationChartDate: string;
  remote: string;
  nextRemote: string | null;
  avlRemoteForBooking: string | null;
  destinationStation: string | null;
  chartOneDate: string | null;
  chartTwoDate: string | null;
  error: string | null;
  chartStatusResponseDto?: {
    messageIndex?: number;
    chartOneFlag?: number;
    chartTwoFlag?: number;
    trainStartDate?: string;
    remoteStationCode?: string;
    messageType?: string;
  };
};

@Injectable()
export class IrctcService {
  private readonly logger = new Logger(IrctcService.name);

  constructor(
    private prisma: PrismaService,
    private irctcBrowserFallback: IrctcBrowserFallbackService,
    private cookieStore: IrctcCookieStoreService,
  ) {}

  async getTrainSchedule(
    trainNumber: string,
    opts?: GetTrainScheduleOptions,
  ): Promise<GetTrainScheduleResult> {
    const num = String(trainNumber).trim();
    if (!num) return { ok: false, reason: 'unavailable' };

    const cached = (await this.prisma.trainScheduleCache.findUnique({
      where: { trainNumber: num },
    })) as TrainScheduleCacheScheduleRow | null;
    if (cached && !opts?.forceRefresh) {
      const trainRunsOn =
        cached.trainRunsOn != null &&
        typeof cached.trainRunsOn === 'object' &&
        !Array.isArray(cached.trainRunsOn)
          ? (cached.trainRunsOn as TrainRunsOnJson)
          : undefined;
      let schedule: TrainScheduleResponse = {
        trainNumber: cached.trainNumber,
        trainName: cached.trainName,
        stationFrom: cached.stationFrom,
        stationTo: cached.stationTo,
        stationList: (cached.stationList as ScheduleStation[]) ?? [],
        ...(trainRunsOn && Object.keys(trainRunsOn).length > 0
          ? { trainRunsOn }
          : {}),
      };
      this.logger.log(
        `[irctc/schedule] cache_hit train=${num} stations=${schedule.stationList.length}`,
      );
      schedule = await this.maybeFillScheduleTrainRunsOn(num, schedule, opts);
      return { ok: true, schedule };
    }

    this.logger.log(
      `[irctc/schedule] cache_miss train=${num} forceRefresh=${Boolean(opts?.forceRefresh)}`,
    );

    // 1. Try fetching from ConfirmTkt first
    try {
      this.logger.log(`[irctc/schedule] trying confirmtkt scraper for train=${num}`);
      const data = await this.fetchScheduleFromConfirmTkt(num);
      if (data && data.stationList?.length > 0) {
        const runsPayload =
          data.trainRunsOn && Object.keys(data.trainRunsOn).length > 0
            ? (data.trainRunsOn as Prisma.InputJsonValue)
            : undefined;

        await this.prisma.trainScheduleCache.upsert({
          where: { trainNumber: num },
          create: {
            trainNumber: data.trainNumber,
            trainName: data.trainName,
            stationFrom: data.stationFrom,
            stationTo: data.stationTo,
            stationList: data.stationList as object,
            ...(runsPayload != null ? { trainRunsOn: runsPayload } : {}),
          } as Prisma.TrainScheduleCacheCreateInput,
          update: {
            trainName: data.trainName,
            stationFrom: data.stationFrom,
            stationTo: data.stationTo,
            stationList: data.stationList as object,
            fetchedAt: new Date(),
            ...(runsPayload != null ? { trainRunsOn: runsPayload } : {}),
          } as Prisma.TrainScheduleCacheUpdateInput,
        });

        const schedule = await this.maybeFillScheduleTrainRunsOn(num, data, opts);
        this.logger.log(
          `[irctc/schedule] confirmtkt_success train=${num} stations=${schedule.stationList.length}`,
        );
        return { ok: true, schedule };
      }
    } catch (confirmTktErr) {
      this.logger.warn(
        `[irctc/schedule] confirmtkt scraper failed for train=${num}, falling back: ${
          confirmTktErr instanceof Error ? confirmTktErr.message : String(confirmTktErr)
        }`,
      );
    }

    // 2. Fall back to IRCTC schedule API / RapidAPI
    try {
      const data = await this.fetchScheduleFromIrctc(
        num,
        opts?.fillRunsOnFromComposition?.jDate,
      );
      if (!data?.stationList?.length) {
        return { ok: false, reason: 'unavailable' };
      }

      const runsPayload: Prisma.InputJsonValue | undefined =
        data.trainRunsOn && Object.keys(data.trainRunsOn).length > 0
          ? (data.trainRunsOn as Prisma.InputJsonValue)
          : undefined;

      await this.prisma.trainScheduleCache.upsert({
        where: { trainNumber: num },
        create: {
          trainNumber: data.trainNumber,
          trainName: data.trainName,
          stationFrom: data.stationFrom,
          stationTo: data.stationTo,
          stationList: data.stationList as object,
          ...(runsPayload != null ? { trainRunsOn: runsPayload } : {}),
        } as Prisma.TrainScheduleCacheCreateInput,
        update: {
          trainName: data.trainName,
          stationFrom: data.stationFrom,
          stationTo: data.stationTo,
          stationList: data.stationList as object,
          fetchedAt: new Date(),
          ...(runsPayload != null ? { trainRunsOn: runsPayload } : {}),
        } as Prisma.TrainScheduleCacheUpdateInput,
      });

      const schedule = await this.maybeFillScheduleTrainRunsOn(num, data, opts);
      this.logger.log(
        `[irctc/schedule] ok train=${num} stations=${schedule.stationList.length}`,
      );
      return { ok: true, schedule };
    } catch (err) {
      if (err instanceof IrctcScheduleMaintenanceError) {
        this.logger.warn(
          `[irctc/schedule] maintenance train=${num} message=${err.irctcMessage}`,
        );
        return {
          ok: false,
          reason: 'maintenance',
          message: err.irctcMessage,
        };
      }
      this.logger.warn(
        `[irctc/schedule] failed train=${num} ${err instanceof Error ? err.message : String(err)}`,
      );
      return { ok: false, reason: 'unavailable' };
    }
  }

  private async fetchScheduleFromIrctc(
    trainNumber: string,
    journeyDateYmd?: string,
  ): Promise<TrainScheduleResponse> {
    const url = `${IRCTC_SCHEDULE_URL}/${encodeURIComponent(trainNumber)}`;
    const headers = {
      ...SCHEDULE_HEADERS,
      greq: String(Date.now()),
    };
    const cookies = this.cookieStore.getCookie();
    if (cookies?.trim()) {
      headers['Cookie'] = cookies.trim();
    }

    const hasCookies = Boolean(cookies?.trim());
    const t0 = Date.now();
    this.logger.log(
      `[irctc/schedule] irctc_request_start train=${trainNumber} cookies=${hasCookies}`,
    );

    let res: { status: number; data: string };
    try {
      if (curlLogEnabled()) {
        this.logger.log(
          `[irctc/schedule] curl: ${buildCurl({ method: 'GET', url, headers })}`,
        );
      }
      res = await scheduleClient.get<string>(url, {
        headers,
        responseType: 'text',
        timeout: IRCTC_SCHEDULE_TIMEOUT_MS,
      });
    } catch (err) {
      const ms = Date.now() - t0;
      if (isAxiosError(err)) {
        this.logger.warn(
          `[irctc/schedule] irctc_http_error train=${trainNumber} ms=${ms} code=${err.code ?? 'n/a'} status=${err.response?.status ?? 'n/a'} message=${err.message}`,
        );
      } else {
        this.logger.warn(
          `[irctc/schedule] irctc_http_error train=${trainNumber} ms=${ms} ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (this.isScheduleTimeoutError(err)) {
        this.logger.warn(
          `[irctc/schedule] irctc_timeout_fallback train=${trainNumber} timeoutMs=${IRCTC_SCHEDULE_TIMEOUT_MS}`,
        );
        try {
          this.logger.log(
            `[irctc/schedule] using rapidapi fallback train=${trainNumber}`,
          );
          return await this.fetchScheduleFromRapidApi(trainNumber);
        } catch (fallbackErr) {
          this.logger.warn(
            `[irctc/schedule] rapidapi_fallback_failed train=${trainNumber} ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
          captureSentryException(fallbackErr, {
            tags: { service: 'rapidapi', endpoint: 'trainSearch' },
            extra: {
              trainNumber,
              journeyDateYmd,
              primaryErrorCode: isAxiosError(err) ? err.code : undefined,
            },
          });
        }
      }

      captureSentryException(err, {
        tags: { service: 'irctc', endpoint: 'schedule' },
        extra: {
          ms,
          trainNumber,
          code: isAxiosError(err) ? err.code : undefined,
          status: isAxiosError(err) ? err.response?.status : undefined,
        },
      });
      throw err;
    }

    const msHttp = Date.now() - t0;
    const text = res.data;
    const bytes = typeof text === 'string' ? text.length : 0;
    this.logger.log(
      `[irctc/schedule] irctc_http_ok train=${trainNumber} ms=${msHttp} status=${res.status} bytes=${bytes}`,
    );

    if (!text?.trim()) {
      this.logger.warn(
        `[irctc/schedule] empty_body train=${trainNumber} ms=${msHttp}`,
      );
      throw new Error('Schedule for this train is not available.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const preview = text.slice(0, 160).replace(/\s+/g, ' ');
      this.logger.warn(
        `[irctc/schedule] json_parse_error train=${trainNumber} preview=${preview}`,
      );
      throw new Error('Schedule for this train is not available.');
    }
    if (parsed && typeof parsed === 'object') {
      const em = (parsed as { errorMessage?: unknown }).errorMessage;
      if (typeof em === 'string' && em.trim()) {
        throw new IrctcScheduleMaintenanceError(em.trim());
      }
    }
    const raw = parsed as Record<string, unknown>;
    if (!raw || !Array.isArray(raw.stationList)) {
      this.logger.warn(
        `[irctc/schedule] bad_shape train=${trainNumber} hasStationList=${Array.isArray((raw as { stationList?: unknown })?.stationList)}`,
      );
      throw new Error('Schedule for this train is not available.');
    }
    const trainRunsOn = extractTrainRunsOnFromIrctc(raw);
    const schedule: TrainScheduleResponse = {
      trainNumber:
        typeof raw.trainNumber === 'string'
          ? raw.trainNumber
          : typeof raw.trainNumber === 'number' &&
              Number.isFinite(raw.trainNumber)
            ? String(raw.trainNumber)
            : '',
      trainName:
        typeof raw.trainName === 'string'
          ? raw.trainName
          : typeof raw.trainName === 'number' && Number.isFinite(raw.trainName)
            ? String(raw.trainName)
            : '',
      stationFrom:
        typeof raw.stationFrom === 'string'
          ? raw.stationFrom
          : typeof raw.stationFrom === 'number' &&
              Number.isFinite(raw.stationFrom)
            ? String(raw.stationFrom)
            : '',
      stationTo:
        typeof raw.stationTo === 'string'
          ? raw.stationTo
          : typeof raw.stationTo === 'number' && Number.isFinite(raw.stationTo)
            ? String(raw.stationTo)
            : '',
      stationList: raw.stationList as ScheduleStation[],
      ...(trainRunsOn ? { trainRunsOn } : {}),
    };
    return schedule;
  }

  private isScheduleTimeoutError(err: unknown): boolean {
    if (!isAxiosError(err)) return false;
    if (err.response?.status === 408 || err.response?.status === 504) {
      return true;
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
    return /timeout/i.test(err.message);
  }

  private rapidApiKey(): string | null {
    const raw =
      process.env.RAPIDAPI_IRCTC_KEY ??
      process.env.IRCTC_RAPIDAPI_KEY ??
      process.env.RAPIDAPI_KEY;
    const key = raw?.trim();
    return key ? key : null;
  }

  private async fetchScheduleFromConfirmTkt(
    trainNumber: string,
  ): Promise<TrainScheduleResponse> {
    const url = `https://www.confirmtkt.com/train-schedule/${encodeURIComponent(trainNumber)}`;
    const t0 = Date.now();
    this.logger.log(`[irctc/schedule] confirmtkt_request_start train=${trainNumber}`);

    const res = await scheduleClient.get<string>(url, {
      responseType: 'text',
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = res.data;
    if (!html?.trim()) {
      throw new Error('ConfirmTkt returned empty response');
    }

    const match = html.match(/var data\s*=\s*'([^']*)'/);
    if (!match) {
      throw new Error('Could not find train schedule data on ConfirmTkt page');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(match[1]);
    } catch (err) {
      throw new Error(`Failed to parse ConfirmTkt JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('ConfirmTkt schedule is empty or malformed');
    }

    const stationList = (parsed.Schedule || []).map((s: any) => ({
      stationCode: String(s.StationCode || '').trim().toUpperCase(),
      stationName: String(s.StationName || '').trim(),
      arrivalTime: String(s.ArrivalTime || '').trim(),
      departureTime: String(s.DepartureTime || '').trim(),
      haltMinutes: String(s.HaltMinutes || '').trim(),
      distance: String(s.Distance || '0.0').trim(),
      day: Number(s.Day) || 1,
      expectedPlatformNo: String(s.ExpectedPlatformNo || '').trim(),
    }));

    if (stationList.length === 0) {
      throw new Error('ConfirmTkt schedule stationList is empty');
    }

    const daysOfRun = parsed.DaysOfRun || {};
    const trainRunsOn: TrainRunsOnJson = {
      trainRunsOnMon: daysOfRun.Mon === true ? 'Y' : 'N',
      trainRunsOnTue: daysOfRun.Tue === true ? 'Y' : 'N',
      trainRunsOnWed: daysOfRun.Wed === true ? 'Y' : 'N',
      trainRunsOnThu: daysOfRun.Thu === true ? 'Y' : 'N',
      trainRunsOnFri: daysOfRun.Fri === true ? 'Y' : 'N',
      trainRunsOnSat: daysOfRun.Sat === true ? 'Y' : 'N',
      trainRunsOnSun: daysOfRun.Sun === true ? 'Y' : 'N',
    };

    const ms = Date.now() - t0;
    this.logger.log(
      `[irctc/schedule] confirmtkt_ok train=${trainNumber} ms=${ms} stations=${stationList.length}`,
    );

    return {
      trainNumber: String(parsed.TrainNo || trainNumber).trim(),
      trainName: String(parsed.TrainName || '').trim(),
      stationFrom: String(parsed.SourceCode || '').trim().toUpperCase(),
      stationTo: String(parsed.DestinationCode || '').trim().toUpperCase(),
      stationList,
      trainRunsOn,
    };
  }

  /**
   * Station autocomplete fallback via RapidAPI (irctc1.p.rapidapi.com).
   * Used only when the local station_cache misses. Fast and reliable, unlike
   * the IRCTC rail-API station endpoint. Never throws — returns [] on any error
   * so the caller can degrade gracefully.
   */
  async searchStationsViaRapidApi(
    query: string,
  ): Promise<Array<{ stationCode: string; stationName: string }>> {
    const q = query.trim();
    if (q.length < 2) return [];
    const key = this.rapidApiKey();
    if (!key) {
      this.logger.warn(
        '[irctc/searchStation] RapidAPI key missing; skipping station fallback.',
      );
      return [];
    }
    try {
      const res = await rapidApiScheduleClient.get<unknown>(
        RAPIDAPI_SEARCH_STATION_URL,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Rapidapi-Host': 'irctc1.p.rapidapi.com',
            'X-Rapidapi-Key': key,
          },
          params: { query: q },
          timeout: RAPIDAPI_SEARCH_STATION_TIMEOUT_MS,
        },
      );
      const root =
        res.data && typeof res.data === 'object' && !Array.isArray(res.data)
          ? (res.data as Record<string, unknown>)
          : {};
      const list = Array.isArray(root.data) ? root.data : [];
      const out: Array<{ stationCode: string; stationName: string }> = [];
      for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const code = strFromUnknown(r.code).trim().toUpperCase();
        const name = (strFromUnknown(r.eng_name) || strFromUnknown(r.name))
          .trim()
          .toUpperCase();
        if (code && name) out.push({ stationCode: code, stationName: name });
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `[irctc/searchStation] RapidAPI station search failed for "${q}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /**
   * Travel classes a train offers (e.g. ["SL","3A","2A","1A"]). DB-first
   * (TrainScheduleCache.availableClasses); on a miss, falls back to RapidAPI
   * getTrainClasses and persists the result. Used to probe only real classes in
   * alternate-paths instead of every possible class. Never throws — returns []
   * when unknown so the caller falls back to the full class list.
   */
  async getTrainClasses(trainNo: string): Promise<string[]> {
    const num = String(trainNo).trim();
    if (!num) return [];

    // DB-first.
    try {
      const row = await this.prisma.trainScheduleCache.findUnique({
        where: { trainNumber: num },
        select: { availableClasses: true },
      });
      if (row?.availableClasses && row.availableClasses.length > 0) {
        return row.availableClasses;
      }
    } catch {
      // Column may not exist yet (pre-migration) — fall through to RapidAPI.
    }

    const key = this.rapidApiKey();
    if (!key) return [];
    try {
      const res = await rapidApiScheduleClient.get<unknown>(
        RAPIDAPI_TRAIN_CLASSES_URL,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Rapidapi-Host': 'irctc1.p.rapidapi.com',
            'X-Rapidapi-Key': key,
          },
          params: { trainNo: num },
          timeout: RAPIDAPI_TRAIN_CLASSES_TIMEOUT_MS,
        },
      );
      const root =
        res.data && typeof res.data === 'object' && !Array.isArray(res.data)
          ? (res.data as Record<string, unknown>)
          : {};
      const data = Array.isArray(root.data) ? root.data : [];
      const classes = [
        ...new Set(
          data
            .map((c) => strFromUnknown(c).trim().toUpperCase())
            .filter(Boolean),
        ),
      ];
      if (classes.length > 0) {
        // Persist back (only updates if the schedule row exists; no-op otherwise).
        await this.prisma.trainScheduleCache
          .updateMany({
            where: { trainNumber: num },
            data: { availableClasses: classes },
          })
          .catch(() => undefined);
      }
      return classes;
    } catch (err) {
      this.logger.warn(
        `[irctc/getTrainClasses] RapidAPI failed for ${num}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async fetchScheduleFromRapidApi(
    trainNumber: string,
  ): Promise<TrainScheduleResponse> {
    const key = this.rapidApiKey();
    if (!key) {
      throw new Error(
        'RapidAPI key missing. Set RAPIDAPI_IRCTC_KEY to enable schedule fallback.',
      );
    }

    const t0 = Date.now();
    this.logger.log(
      `[irctc/schedule] rapidapi_request_start train=${trainNumber}`,
    );
    const res = await rapidApiScheduleClient.get<unknown>(
      RAPIDAPI_TRAIN_SEARCH_URL,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Rapidapi-Host': 'irctc1.p.rapidapi.com',
          'X-Rapidapi-Key': key,
        },
        params: {
          trainNo: trainNumber,
        },
        timeout: RAPIDAPI_TRAIN_SEARCH_TIMEOUT_MS,
      },
    );

    const schedule = this.normalizeRapidApiSchedule(trainNumber, res.data);
    const ms = Date.now() - t0;
    this.logger.log(
      `[irctc/schedule] rapidapi_ok train=${trainNumber} ms=${ms} status=${res.status} stations=${schedule.stationList.length}`,
    );
    return schedule;
  }

  private normalizeRapidApiSchedule(
    trainNumber: string,
    payload: unknown,
  ): TrainScheduleResponse {
    const root =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};

    if (root.status === false) {
      throw new Error(
        `RapidAPI train search failed: ${strFromUnknown(root.message)}`,
      );
    }

    const data = root.data as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('RapidAPI schedule for this train is not available.');
    }

    const rawRoute = Array.isArray(data.route) ? data.route : [];

    const formatMinutes = (minutes: unknown): string => {
      const mins = Number(minutes);
      if (isNaN(mins)) return '--:--';
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const stationList: ScheduleStation[] = rawRoute
      .filter(
        (station): station is Record<string, unknown> =>
          station != null &&
          typeof station === 'object' &&
          !Array.isArray(station),
      )
      .map((station) => {
        const stationCode = strFromUnknown(station.station_code)
          .trim()
          .toUpperCase();
        const stationName = strFromUnknown(station.station_name).trim();
        return {
          ...station,
          stationCode,
          stationName,
          arrivalTime: formatMinutes(station.sta_min),
          departureTime: formatMinutes(station.std_min),
          distance: strFromUnknown(station.distance_from_source).trim() || '0',
          dayCount: typeof station.day === 'number' ? station.day : 1,
          haltTime:
            typeof station.halt === 'number' && station.halt > 0
              ? `${station.halt} min`
              : '--',
        };
      })
      .filter((station) => station.stationCode.length > 0);

    if (stationList.length === 0) {
      throw new Error('RapidAPI schedule for this train is not available.');
    }

    let trainRunsOn: TrainRunsOnJson | undefined = undefined;
    const runDays = data.runDays as Record<string, boolean>;
    if (runDays && typeof runDays === 'object' && !Array.isArray(runDays)) {
      trainRunsOn = {
        trainRunsOnSun: runDays.sun ? 'Y' : 'N',
        trainRunsOnMon: runDays.mon ? 'Y' : 'N',
        trainRunsOnTue: runDays.tue ? 'Y' : 'N',
        trainRunsOnWed: runDays.wed ? 'Y' : 'N',
        trainRunsOnThu: runDays.thu ? 'Y' : 'N',
        trainRunsOnFri: runDays.fri ? 'Y' : 'N',
        trainRunsOnSat: runDays.sat ? 'Y' : 'N',
      };
    }

    return {
      trainNumber:
        strFromUnknown(data.trainNumber).trim() || trainNumber.trim(),
      trainName: strFromUnknown(data.trainName).trim(),
      stationFrom: stationList[0].stationCode,
      stationTo: stationList[stationList.length - 1].stationCode,
      stationList,
      ...(trainRunsOn ? { trainRunsOn } : {}),
    };
  }

  async getTrainList(): Promise<TrainOption[]> {
    const rows = await this.prisma.trainList.findMany({
      orderBy: { label: 'asc' },
    });
    return rows.map((row) => ({
      number: row.trainNumber,
      label: row.label,
    }));
  }

  async searchTrains(query: string): Promise<TrainOption[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    // Train search is served entirely from the TrainList table (seeded from
    // prisma/trainlist.txt). We intentionally do NOT fall back to IRCTC's live
    // trainList endpoint: it is slow/flaky and would hang the request (it was
    // timing out at ~12s and returning empty). If a query misses, the fix is to
    // (re)seed TrainList, not to call IRCTC.
    const rows = await this.prisma.trainList.findMany({
      where: {
        OR: [
          { trainNumber: { contains: q, mode: 'insensitive' } },
          { label: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { label: 'asc' },
    });

    return rows.map((row) => ({
      number: row.trainNumber,
      label: row.label,
    }));
  }

  async getVacantBerth(payload: {
    trainNo: string;
    boardingStation: string;
    remoteStation: string;
    trainSourceStation: string;
    jDate: string;
    cls: string;
    chartType?: number;
  }): Promise<unknown> {
    const body = {
      trainNo: payload.trainNo,
      boardingStation: payload.boardingStation,
      remoteStation: payload.remoteStation,
      trainSourceStation: payload.trainSourceStation,
      jDate: payload.jDate,
      cls: payload.cls,
      chartType: payload.chartType ?? 1,
    };

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      DNT: '1',
      Origin: 'https://www.irctc.co.in',
      Referer: 'https://www.irctc.co.in/online-charts/traincomposition',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'sec-ch-ua':
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    };
    const cookies = this.cookieStore.getCookie();
    if (cookies?.trim()) headers['Cookie'] = cookies.trim();

    const t0 = Date.now();
    this.logger.log(
      `[irctc/vacantBerth] request_start trainNo=${payload.trainNo} cookies=${Boolean(cookies?.trim())}`,
    );

    let res: Response;
    try {
      if (curlLogEnabled()) {
        this.logger.log(
          `[irctc/vacantBerth] curl: ${buildCurl({ method: 'POST', url: IRCTC_VACANT_BERTH_URL, headers, body: JSON.stringify(body) })}`,
        );
      }
      res = await fetchWithTimeout(IRCTC_VACANT_BERTH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      const ms = Date.now() - t0;
      const cause: string =
        err instanceof Error
          ? err.cause != null
            ? err.cause instanceof Error
              ? err.cause.message
              : typeof err.cause === 'string'
                ? err.cause
                : 'Unknown error'
            : err.message
          : String(err);
      const isFallbackEnabled =
        process.env.IRCTC_BROWSER_FALLBACK_ENABLED !== 'false';
      this.logger.warn(
        `[irctc/vacantBerth] network_error ms=${ms} trainNo=${payload.trainNo} ${cause}.${isFallbackEnabled ? ' Falling back to browser...' : ''}`,
      );
      // Report the network error to Sentry for monitoring
      captureSentryException(err, {
        tags: { service: 'irctc', endpoint: 'vacantBerth' },
        extra: { ms, trainNo: payload.trainNo, cause },
      });
      if (isFallbackEnabled) {
        try {
          return await this.irctcBrowserFallback.getVacantBerthViaBrowser(
            payload.trainNo,
            payload.jDate,
            payload.boardingStation,
            payload.cls,
          );
        } catch (fallbackErr) {
          this.logger.error(
            `[irctc/vacantBerth] browser fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
      throw new Error(`IRCTC request failed (network/connection): ${cause}`);
    }

    const text = await res.text();
    const ms = Date.now() - t0;
    this.logger.log(
      `[irctc/vacantBerth] response ms=${ms} status=${res.status} bytes=${text.length}`,
    );
    if (!res.ok) {
      const isFallbackEnabled =
        process.env.IRCTC_BROWSER_FALLBACK_ENABLED !== 'false';
      this.logger.warn(
        `[irctc/vacantBerth] http_error status=${res.status} body_preview=${text.slice(0, 200).replace(/\s+/g, ' ')}.${isFallbackEnabled ? ' Falling back to browser...' : ''}`,
      );
      if (isFallbackEnabled) {
        try {
          return await this.irctcBrowserFallback.getVacantBerthViaBrowser(
            payload.trainNo,
            payload.jDate,
            payload.boardingStation,
            payload.cls,
          );
        } catch (fallbackErr) {
          this.logger.error(
            `[irctc/vacantBerth] browser fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
      throw new Error(`IRCTC vacantBerth failed: ${res.status} ${text}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      const isFallbackEnabled =
        process.env.IRCTC_BROWSER_FALLBACK_ENABLED !== 'false';
      this.logger.warn(
        `[irctc/vacantBerth] json_parse_error.${isFallbackEnabled ? ' Falling back to browser...' : ''}`,
      );
      if (isFallbackEnabled) {
        try {
          return await this.irctcBrowserFallback.getVacantBerthViaBrowser(
            payload.trainNo,
            payload.jDate,
            payload.boardingStation,
            payload.cls,
          );
        } catch (fallbackErr) {
          this.logger.error(
            `[irctc/vacantBerth] browser fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
      throw new Error(
        `IRCTC vacantBerth returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  async getCoachComposition(payload: {
    trainNo: string;
    boardingStation: string;
    remoteStation: string;
    trainSourceStation: string;
    jDate: string;
    coach: string;
    cls: string;
  }): Promise<unknown> {
    const body = {
      trainNo: payload.trainNo,
      boardingStation: payload.boardingStation,
      remoteStation: payload.remoteStation,
      trainSourceStation: payload.trainSourceStation,
      jDate: payload.jDate,
      coach: payload.coach,
      cls: payload.cls,
    };

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      DNT: '1',
      Origin: 'https://www.irctc.co.in',
      Referer: 'https://www.irctc.co.in/online-charts/traincomposition',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'sec-ch-ua':
        '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    };
    const cookies = this.cookieStore.getCookie();
    if (cookies?.trim()) headers['Cookie'] = cookies.trim();

    const t0 = Date.now();
    this.logger.log(
      `[irctc/coachComposition] request_start trainNo=${payload.trainNo} coach=${payload.coach} cookies=${Boolean(cookies?.trim())}`,
    );

    let res: Response;
    try {
      if (curlLogEnabled()) {
        this.logger.log(
          `[irctc/coachComposition] curl: ${buildCurl({ method: 'POST', url: IRCTC_COACH_COMPOSITION_URL, headers, body: JSON.stringify(body) })}`,
        );
      }
      res = await fetchWithTimeout(IRCTC_COACH_COMPOSITION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      const ms = Date.now() - t0;
      const cause: string =
        err instanceof Error
          ? err.cause != null
            ? err.cause instanceof Error
              ? err.cause.message
              : typeof err.cause === 'string'
                ? err.cause
                : 'Unknown error'
            : err.message
          : String(err);
      this.logger.warn(
        `[irctc/coachComposition] network_error ms=${ms} trainNo=${payload.trainNo} coach=${payload.coach} ${cause}`,
      );
      captureSentryException(err, {
        tags: { service: 'irctc', endpoint: 'coachComposition' },
        extra: { ms, trainNo: payload.trainNo, coach: payload.coach, cause },
      });
      throw new Error(`IRCTC request failed (network/connection): ${cause}`);
    }

    const text = await res.text();
    const ms = Date.now() - t0;
    this.logger.log(
      `[irctc/coachComposition] response ms=${ms} status=${res.status} bytes=${text.length}`,
    );
    if (!res.ok) {
      this.logger.warn(
        `[irctc/coachComposition] http_error status=${res.status} body_preview=${text.slice(0, 200).replace(/\s+/g, ' ')}`,
      );
      throw new Error(
        `IRCTC coachComposition failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      this.logger.warn(
        `[irctc/coachComposition] json_parse_error body_preview=${text.slice(0, 200)}`,
      );
      throw new Error(
        `IRCTC coachComposition returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  private scheduleTrainRunsOnEmpty(schedule: TrainScheduleResponse): boolean {
    const r = schedule.trainRunsOn;
    return !r || Object.keys(r).length === 0;
  }

  private async maybeFillScheduleTrainRunsOn(
    trainNumber: string,
    schedule: TrainScheduleResponse,
    opts?: GetTrainScheduleOptions,
  ): Promise<TrainScheduleResponse> {
    if (
      !this.scheduleTrainRunsOnEmpty(schedule) ||
      !opts?.fillRunsOnFromComposition
    ) {
      return schedule;
    }
    this.logger.log(
      `[irctc/schedule] hydrate_runs_on train=${trainNumber} jDate=${opts.fillRunsOnFromComposition.jDate} station=${opts.fillRunsOnFromComposition.boardingStation}`,
    );
    const runs = await this.tryHydrateTrainRunsOnFromComposition(
      trainNumber,
      opts.fillRunsOnFromComposition,
    );
    if (!runs) return schedule;
    return { ...schedule, trainRunsOn: runs };
  }

  /** Weekday flags on trainComposition JSON (root or nested DTO), same keys as schedule API. */
  private extractTrainRunsOnFromCompositionBody(
    raw: Record<string, unknown>,
  ): TrainRunsOnJson | undefined {
    let runs = extractTrainRunsOnFromIrctc(raw);
    if (runs && Object.keys(runs).length > 0) return runs;
    const dto = raw.chartStatusResponseDto;
    if (dto && typeof dto === 'object' && !Array.isArray(dto)) {
      runs = extractTrainRunsOnFromIrctc(dto as Record<string, unknown>);
      if (runs && Object.keys(runs).length > 0) return runs;
    }
    return undefined;
  }

  private async persistTrainRunsOnToScheduleCache(
    trainNumber: string,
    runs: TrainRunsOnJson,
  ): Promise<void> {
    const num = String(trainNumber).trim();
    const existing = await this.prisma.trainScheduleCache.findUnique({
      where: { trainNumber: num },
    });
    if (!existing) return;
    await this.prisma.trainScheduleCache.update({
      where: { trainNumber: num },
      data: {
        trainRunsOn: runs as Prisma.InputJsonValue,
        fetchedAt: new Date(),
      } as Prisma.TrainScheduleCacheUpdateInput,
    });
  }

  /**
   * POST trainComposition; returns parsed JSON after basic shape checks (same as getTrainComposition).
   */
  /**
   * 1-indexed day on which the train reaches `stationCode` (origin = day 1),
   * read from the cached schedule. Used to map a boarding date to the train's
   * start date for IRCTC's composition API. Returns null when the schedule or
   * station is unknown (caller falls back to a blind retry).
   */
  private async boardingStationDay(
    trainNo: string,
    stationCode: string,
  ): Promise<number | null> {
    try {
      const result = await this.getTrainSchedule(trainNo);
      if (!result.ok) return null;
      const code = String(stationCode).trim().toUpperCase();
      const stop = result.schedule.stationList.find(
        (s) => String(s.stationCode).trim().toUpperCase() === code,
      );
      if (!stop) return null;
      const raw =
        (stop as { day?: unknown }).day ??
        (stop as { dayCount?: unknown }).dayCount;
      const day = Number(raw);
      return Number.isFinite(day) && day >= 1 ? day : null;
    } catch {
      return null;
    }
  }

  async postTrainComposition(
    payload: {
      trainNo: string;
      jDate: Date | string;
      boardingStation: string;
    },
    opts?: {
      allowChartNotPrepared?: boolean;
      /** Internal: schedule-aware retry already stepped to the train start date. */
      _retriedStartDate?: boolean;
      /** Internal: blind fallback retry state (used only when schedule unknown). */
      _retriedPreviousDay?: boolean;
      _retriedTwoDays?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const jDateStr =
      payload.jDate instanceof Date
        ? payload.jDate.toISOString().slice(0, 10)
        : String(payload.jDate).trim().slice(0, 10);
    const body = {
      trainNo: to5DigitTrainNo(payload.trainNo),
      jDate: jDateStr,
      boardingStation: String(payload.boardingStation).trim().toUpperCase(),
    };
    console.log('postTrainComposition >> body', body);

    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      dnt: '1',
      origin: 'https://www.irctc.co.in',
      priority: 'u=1, i',
      referer: 'https://www.irctc.co.in/online-charts/',
      'sec-ch-ua':
        '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    };
    const cookies = this.cookieStore.getCookie();
    if (cookies?.trim()) headers['Cookie'] = cookies.trim();

    const t0 = Date.now();
    let status = 0;
    let text = '';
    try {
      if (curlLogEnabled()) {
        this.logger.log(
          `[irctc/trainComposition] curl: ${buildCurl({ method: 'POST', url: IRCTC_TRAIN_COMPOSITION_URL, headers, body: JSON.stringify(body) })}`,
        );
      }
      const { gotScraping } = await import('got-scraping');
      const res = await gotScraping.post(IRCTC_TRAIN_COMPOSITION_URL, {
        headers,
        json: body,
        timeout: { request: IRCTC_TRAIN_COMPOSITION_TIMEOUT_MS },
        retry: { limit: 2 },
      });
      status = res.statusCode;
      text = res.body;
    } catch (err: any) {
      if (err.response) {
        status = err.response.statusCode;
        text =
          typeof err.response.body === 'string'
            ? err.response.body
            : JSON.stringify(err.response.body);
      } else {
        const ms = Date.now() - t0;
        const cause = err instanceof Error ? err.message : String(err);
        const isFallbackEnabled =
          process.env.IRCTC_BROWSER_FALLBACK_ENABLED !== 'false';
        this.logger.warn(
          `[irctc/trainComposition] network_error ms=${ms} trainNo=${body.trainNo} boarding=${body.boardingStation} date=${body.jDate} ${cause}.${isFallbackEnabled ? ' Falling back to browser...' : ''}`,
        );
        captureSentryException(err, {
          tags: { service: 'irctc', endpoint: 'trainComposition' },
          extra: {
            ms,
            trainNo: body.trainNo,
            boardingStation: body.boardingStation,
            jDate: body.jDate,
            cause,
          },
        });
        if (isFallbackEnabled) {
          try {
            return await this.irctcBrowserFallback.getTrainCompositionViaBrowser(
              body.trainNo,
              body.jDate,
              body.boardingStation,
            );
          } catch (fallbackErr) {
            this.logger.error(
              `[irctc/trainComposition] browser fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
            );
          }
        }
        throw new Error(
          'We are unable to contact rail systems. Please try again later.',
        );
      }
    }
    if (status < 200 || status >= 300) {
      const ms = Date.now() - t0;
      const isFallbackEnabled =
        process.env.IRCTC_BROWSER_FALLBACK_ENABLED !== 'false';
      this.logger.warn(
        `[irctc/trainComposition] http_error status=${status} ms=${ms} trainNo=${body.trainNo} boarding=${body.boardingStation} date=${body.jDate}.${isFallbackEnabled ? ' Falling back to browser...' : ''}`,
      );
      captureSentryException(new Error(`HTTP error status ${status}`), {
        tags: { service: 'irctc', endpoint: 'trainComposition' },
        extra: {
          status,
          ms,
          trainNo: body.trainNo,
          boardingStation: body.boardingStation,
          jDate: body.jDate,
          response: text.slice(0, 1000),
        },
      });
      if (isFallbackEnabled) {
        try {
          return await this.irctcBrowserFallback.getTrainCompositionViaBrowser(
            body.trainNo,
            body.jDate,
            body.boardingStation,
          );
        } catch (fallbackErr) {
          this.logger.error(
            `[irctc/trainComposition] browser fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
      throw new Error(
        'Train composition is temporarily unavailable. Please try again later.',
      );
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch (parseErr) {
      const ms = Date.now() - t0;
      const isFallbackEnabled =
        process.env.IRCTC_BROWSER_FALLBACK_ENABLED !== 'false';
      this.logger.warn(
        `[irctc/trainComposition] json_parse_error ms=${ms} trainNo=${body.trainNo} boarding=${body.boardingStation} date=${body.jDate}.${isFallbackEnabled ? ' Falling back to browser...' : ''}`,
      );
      captureSentryException(
        parseErr instanceof Error ? parseErr : new Error('JSON parse failed'),
        {
          tags: { service: 'irctc', endpoint: 'trainComposition' },
          extra: {
            ms,
            trainNo: body.trainNo,
            boardingStation: body.boardingStation,
            jDate: body.jDate,
            rawText: text.slice(0, 1000),
          },
        },
      );
      if (isFallbackEnabled) {
        try {
          return await this.irctcBrowserFallback.getTrainCompositionViaBrowser(
            body.trainNo,
            body.jDate,
            body.boardingStation,
          );
        } catch (fallbackErr) {
          this.logger.error(
            `[irctc/trainComposition] browser fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
      throw new Error(
        'Train composition is temporarily unavailable. Please try again later.',
      );
    }

    const errMsg =
      typeof data.error === 'string' && data.error.trim() !== ''
        ? data.error.trim()
        : '';

    const isChartNotPreparedError =
      errMsg.length > 0 &&
      /chart\s*not\s*prepared|not\s+yet\s*prepared|chart\s*not\s*ready/i.test(
        errMsg,
      );

    // Handle "chart not prepared". IRCTC's composition is keyed to the train's
    // START date, but a boarding station can be on day 2/3/4 of a multi-day run
    // (e.g. 12958 starts NDLS day 1, reaches Ajmer on day 2). So map the
    // boarding date to the train start date using the schedule's day-offset and
    // retry once with the correct start date. At the origin (day 1) there's
    // nothing to step back to — the chart simply isn't prepared yet, so we
    // surface that honestly instead of returning the previous (already-departed)
    // run's composition.
    if (isChartNotPreparedError && !opts?._retriedStartDate) {
      const day = await this.boardingStationDay(
        payload.trainNo,
        body.boardingStation,
      );
      if (day != null) {
        const stepsBack = day - 1;
        if (stepsBack > 0) {
          const startDate = moment(body.jDate)
            .subtract(stepsBack, 'days')
            .format('YYYY-MM-DD');
          return this.postTrainComposition(
            { ...payload, jDate: startDate },
            { ...opts, _retriedStartDate: true },
          );
        }
        // day === 1 (origin): do not step back to a prior run.
      } else {
        // Schedule unavailable — fall back to the old blind retry (today -> -1
        // -> -2), stepping back exactly one day at a time.
        const alreadyRetried =
          (opts?._retriedTwoDays ? 2 : 0) +
          (opts?._retriedPreviousDay && !opts?._retriedTwoDays ? 1 : 0);
        if (alreadyRetried < 2) {
          const prevDate = moment(body.jDate)
            .subtract(1, 'days')
            .format('YYYY-MM-DD');
          return this.postTrainComposition(
            { ...payload, jDate: prevDate },
            {
              ...opts,
              _retriedPreviousDay: alreadyRetried === 0,
              _retriedTwoDays: alreadyRetried >= 1,
            },
          );
        }
      }
    }

    const allowSoftChartPending =
      opts?.allowChartNotPrepared === true && isChartNotPreparedError;

    if (errMsg && !allowSoftChartPending) {
      throw new Error(errMsg);
    }

    const trainNoRaw = data.trainNo;
    const trainNoStr =
      typeof trainNoRaw === 'string'
        ? trainNoRaw.trim()
        : typeof trainNoRaw === 'number' && Number.isFinite(trainNoRaw)
          ? String(trainNoRaw)
          : '';
    const trainNoOk = trainNoStr.length > 0;
    if (!trainNoOk && !allowSoftChartPending) {
      throw new Error(
        errMsg || 'Train composition is temporarily unavailable.',
      );
    }

    if (!allowSoftChartPending) {
      const invalid = data.cdd == null || data.remote == null;
      if (invalid) {
        throw new Error(
          'Train composition is temporarily unavailable. Please try again later.',
        );
      }
    }

    return data;
  }

  private async tryHydrateTrainRunsOnFromComposition(
    trainNumber: string,
    ctx: { jDate: Date | string; boardingStation: string },
  ): Promise<TrainRunsOnJson | null> {
    try {
      const raw = await this.postTrainComposition({
        trainNo: trainNumber,
        jDate: ctx.jDate,
        boardingStation: ctx.boardingStation,
      });
      const typed = raw as unknown as TrainCompositionResponse;
      try {
        await this.persistChartTimesFromComposition(typed, ctx.boardingStation);
      } catch {
        // best-effort chart times
      }
      const runs = this.extractTrainRunsOnFromCompositionBody(raw);
      if (!runs || Object.keys(runs).length === 0) return null;
      await this.persistTrainRunsOnToScheduleCache(trainNumber, runs);
      return runs;
    } catch {
      return null;
    }
  }

  async getTrainComposition(
    payload: {
      trainNo: string;
      jDate: Date | string;
      boardingStation: string;
    },
    opts?: { allowChartNotPrepared?: boolean },
  ): Promise<TrainCompositionResponse> {
    const raw = await this.postTrainComposition(payload, opts);
    const data = raw as unknown as TrainCompositionResponse;
    try {
      await this.persistChartTimesFromComposition(
        data,
        payload.boardingStation,
      );
    } catch {
      // persist is best-effort; still return composition
    }
    return data;
  }

  /**
   * Human-readable chart times from a trainComposition JSON (same parsing as DB persist).
   */
  chartTimesFromCompositionResponse(
    data: TrainCompositionResponse | null | undefined,
  ): {
    chartOneTime: string | null;
    chartOneDayOffset: number | null;
    chartTwoTime: string | null;
    chartTwoDayOffset: number | null;
    chartRemoteStation: string | null;
    chartNextRemoteStation: string | null;
    irctcError: string | null;
  } {
    if (!data) {
      return {
        chartOneTime: null,
        chartOneDayOffset: null,
        chartTwoTime: null,
        chartTwoDayOffset: null,
        chartRemoteStation: null,
        chartNextRemoteStation: null,
        irctcError: null,
      };
    }
    const chartOne = parseChartDateTime(data.chartOneDate);
    const chartTwo = parseChartDateTime(data.chartTwoDate);
    const trainStartDate = (data.trainStartDate ?? '').slice(0, 10);

    let chartOneDayOffset: number | null = null;
    if (chartOne?.date && trainStartDate) {
      chartOneDayOffset = moment(chartOne.date).diff(trainStartDate, 'days');
    }

    let chartTwoDayOffset: number | null = null;
    if (chartTwo?.date && trainStartDate) {
      chartTwoDayOffset = moment(chartTwo.date).diff(trainStartDate, 'days');
    }

    const remote =
      data.chartStatusResponseDto?.remoteStationCode ??
      data.remote?.trim().toUpperCase() ??
      null;
    const nextRemote = data.nextRemote?.trim().toUpperCase() || null;
    const err = data.error?.trim() || null;
    return {
      chartOneTime: chartOne?.time ?? null,
      chartOneDayOffset,
      chartTwoTime: chartTwo?.time ?? null,
      chartTwoDayOffset,
      chartRemoteStation: remote,
      chartNextRemoteStation: nextRemote,
      irctcError: err,
    };
  }

  /**
   * Parse chartOneDate/chartTwoDate from composition response and store in DB.
   * First chart = same day + time; second chart = same or next day + time (chartTwoDayOffset).
   */
  private async persistChartTimesFromComposition(
    data: TrainCompositionResponse,
    boardingStation: string,
  ): Promise<void> {
    const remote =
      data.chartStatusResponseDto?.remoteStationCode ??
      data.remote?.trim().toUpperCase();
    if (!remote) return;

    const trainNo = to5DigitTrainNo(data.trainNo);
    if (!trainNo) return;

    const chartOne = parseChartDateTime(data.chartOneDate);
    if (!chartOne) return;

    const chartTwo = parseChartDateTime(data.chartTwoDate);
    const trainStartDate = (data.trainStartDate ?? '').slice(0, 10);

    let chartOneDayOffset: number | null = null;
    if (chartOne?.date && trainStartDate) {
      chartOneDayOffset = moment(chartOne.date).diff(trainStartDate, 'days');
    }

    let chartTwoDayOffset: number | null = null;
    if (chartTwo?.date && trainStartDate) {
      chartTwoDayOffset = moment(chartTwo.date).diff(trainStartDate, 'days');
    }

    const nextRemote = data.nextRemote?.trim().toUpperCase() || null;

    await this.prisma.trainStationChartTime.upsert({
      where: {
        trainNumber_stationCode: {
          trainNumber: trainNo,
          stationCode: boardingStation,
        },
      },
      create: {
        trainNumber: trainNo,
        stationCode: boardingStation,
        chartTimeLocal: chartOne.time,
        chartOneDayOffset,
        chartTwoTimeLocal: chartTwo?.time ?? null,
        chartTwoDayOffset,
        chartRemoteStation: remote,
        chartNextRemoteStation: nextRemote,
      },
      update: {
        chartTimeLocal: chartOne.time,
        chartOneDayOffset,
        chartTwoTimeLocal: chartTwo?.time ?? null,
        chartTwoDayOffset,
        chartRemoteStation: remote,
        chartNextRemoteStation: nextRemote,
      },
    });
  }
}
