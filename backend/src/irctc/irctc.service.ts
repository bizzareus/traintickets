import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosError, isAxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const scheduleClient = axios.create();
axiosRetry(scheduleClient, {
  retries: 3,
  retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount),
  retryCondition: (err: AxiosError) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    (err.response?.status ?? 0) >= 500,
});

const IRCTC_SCHEDULE_URL =
  'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry';
const IRCTC_VACANT_BERTH_URL =
  'https://www.irctc.co.in/online-charts/api/vacantBerth';
const IRCTC_TRAIN_COMPOSITION_URL =
  'https://www.irctc.co.in/online-charts/api/trainComposition';

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

  constructor(private prisma: PrismaService) {}

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

    try {
      const data = await this.fetchScheduleFromIrctc(num);
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
  ): Promise<TrainScheduleResponse> {
    const url = `${IRCTC_SCHEDULE_URL}/${encodeURIComponent(trainNumber)}`;
    const headers = {
      ...SCHEDULE_HEADERS,
      greq: String(Date.now()),
    };
    const cookies = process.env.IRCTC_COOKIES;
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
      res = await scheduleClient.get<string>(url, {
        headers,
        responseType: 'text',
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

  async getTrainList(): Promise<TrainOption[]> {
    const rows = await this.prisma.trainList.findMany({
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
    const cookies = process.env.IRCTC_COOKIES;
    if (cookies?.trim()) headers['Cookie'] = cookies.trim();

    const t0 = Date.now();
    this.logger.log(
      `[irctc/vacantBerth] request_start trainNo=${payload.trainNo} cookies=${Boolean(cookies?.trim())}`,
    );

    let res: Response;
    try {
      res = await fetch(IRCTC_VACANT_BERTH_URL, {
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
        `[irctc/vacantBerth] network_error ms=${ms} trainNo=${payload.trainNo} ${cause}`,
      );
      throw new Error(`IRCTC request failed (network/connection): ${cause}`);
    }

    const text = await res.text();
    const ms = Date.now() - t0;
    this.logger.log(
      `[irctc/vacantBerth] response ms=${ms} status=${res.status} bytes=${text.length}`,
    );
    if (!res.ok) {
      this.logger.warn(
        `[irctc/vacantBerth] http_error status=${res.status} body_preview=${text.slice(0, 200).replace(/\s+/g, ' ')}`,
      );
      throw new Error(`IRCTC vacantBerth failed: ${res.status} ${text}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        `IRCTC vacantBerth returned non-JSON: ${text.slice(0, 200)}`,
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
  async postTrainComposition(
    payload: {
      trainNo: string;
      jDate: string;
      boardingStation: string;
    },
    opts?: { allowChartNotPrepared?: boolean },
  ): Promise<Record<string, unknown>> {
    const body = {
      trainNo: String(payload.trainNo).trim(),
      jDate: String(payload.jDate).trim().slice(0, 10),
      boardingStation: String(payload.boardingStation).trim().toUpperCase(),
    };

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      DNT: '1',
      Origin: 'https://www.irctc.co.in',
      Referer: 'https://www.irctc.co.in/online-charts/',
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
    const cookies = process.env.IRCTC_COOKIES;
    if (cookies?.trim()) headers['Cookie'] = cookies.trim();

    const t0 = Date.now();
    this.logger.log(
      `[irctc/trainComposition] request_start trainNo=${body.trainNo} jDate=${body.jDate} cookies=${Boolean(cookies?.trim())}`,
    );

    const res = await fetch(IRCTC_TRAIN_COMPOSITION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const ms = Date.now() - t0;
    this.logger.log(
      `[irctc/trainComposition] response ms=${ms} status=${res.status} bytes=${text.length}`,
    );
    if (!res.ok) {
      this.logger.warn(
        `[irctc/trainComposition] http_error status=${res.status} body_preview=${text.slice(0, 200).replace(/\s+/g, ' ')}`,
      );
      throw new Error(
        'Train composition is temporarily unavailable. Please try again later.',
      );
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        'Train composition is temporarily unavailable. Please try again later.',
      );
    }

    const errMsg =
      typeof data.error === 'string' && data.error.trim() !== ''
        ? data.error.trim()
        : '';

    const allowSoftChartPending =
      opts?.allowChartNotPrepared === true &&
      errMsg.length > 0 &&
      /chart\s*not\s*prepared|not\s+yet\s*prepared|chart\s*not\s*ready/i.test(
        errMsg,
      );

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
    if (!trainNoOk) {
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
    ctx: { jDate: string; boardingStation: string },
  ): Promise<TrainRunsOnJson | null> {
    try {
      const raw = await this.postTrainComposition({
        trainNo: trainNumber,
        jDate: ctx.jDate,
        boardingStation: ctx.boardingStation,
      });
      const typed = raw as unknown as TrainCompositionResponse;
      try {
        await this.persistChartTimesFromComposition(typed);
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
      jDate: string;
      boardingStation: string;
    },
    opts?: { allowChartNotPrepared?: boolean },
  ): Promise<TrainCompositionResponse> {
    const raw = await this.postTrainComposition(payload, opts);
    const data = raw as unknown as TrainCompositionResponse;
    try {
      await this.persistChartTimesFromComposition(data);
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
    chartTwoTime: string | null;
    chartTwoIsNextDay: boolean;
    chartRemoteStation: string | null;
    irctcError: string | null;
  } {
    if (!data) {
      return {
        chartOneTime: null,
        chartTwoTime: null,
        chartTwoIsNextDay: false,
        chartRemoteStation: null,
        irctcError: null,
      };
    }
    const chartOne = parseChartDateTime(data.chartOneDate);
    const chartTwo = parseChartDateTime(data.chartTwoDate);
    const trainStartDate = (data.trainStartDate ?? '').slice(0, 10);
    let chartTwoIsNextDay = false;
    if (chartTwo?.date && trainStartDate && chartTwo.date > trainStartDate) {
      chartTwoIsNextDay = true;
    }
    const remote =
      data.chartStatusResponseDto?.remoteStationCode ??
      data.remote?.trim().toUpperCase() ??
      null;
    const err = data.error?.trim() || null;
    return {
      chartOneTime: chartOne?.time ?? null,
      chartTwoTime: chartTwo?.time ?? null,
      chartTwoIsNextDay,
      chartRemoteStation: remote,
      irctcError: err,
    };
  }

  /**
   * Parse chartOneDate/chartTwoDate from composition response and store in DB.
   * First chart = same day + time; second chart = same or next day + time (chartTwoDayOffset).
   */
  private async persistChartTimesFromComposition(
    data: TrainCompositionResponse,
  ): Promise<void> {
    const remote =
      data.chartStatusResponseDto?.remoteStationCode ??
      data.remote?.trim().toUpperCase();
    if (!remote) return;

    const trainNo = String(data.trainNo ?? '').trim();
    if (!trainNo) return;

    const chartOne = parseChartDateTime(data.chartOneDate);
    if (!chartOne) return;

    const chartTwo = parseChartDateTime(data.chartTwoDate);
    const trainStartDate = (data.trainStartDate ?? '').slice(0, 10);
    let chartTwoDayOffset = 0;
    if (chartTwo?.date && trainStartDate) {
      if (chartTwo.date > trainStartDate) chartTwoDayOffset = 1;
    }

    await this.prisma.trainStationChartTime.upsert({
      where: {
        trainNumber_stationCode: {
          trainNumber: trainNo,
          stationCode: remote,
        },
      },
      create: {
        trainNumber: trainNo,
        stationCode: remote,
        chartTimeLocal: chartOne.time,
        chartTwoTimeLocal: chartTwo?.time ?? null,
        chartTwoDayOffset,
      },
      update: {
        chartTimeLocal: chartOne.time,
        chartTwoTimeLocal: chartTwo?.time ?? null,
        chartTwoDayOffset,
      },
    });
  }
}
