import { Injectable } from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
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
  constructor(private prisma: PrismaService) {}

  async getTrainSchedule(
    trainNumber: string,
    opts?: GetTrainScheduleOptions,
  ): Promise<GetTrainScheduleResult> {
    const num = String(trainNumber).trim();
    if (!num) return { ok: false, reason: 'unavailable' };

    const cached = await this.prisma.trainScheduleCache.findUnique({
      where: { trainNumber: num },
    });
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
      schedule = await this.maybeFillScheduleTrainRunsOn(num, schedule, opts);
      return { ok: true, schedule };
    }

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
        },
        update: {
          trainName: data.trainName,
          stationFrom: data.stationFrom,
          stationTo: data.stationTo,
          stationList: data.stationList as object,
          fetchedAt: new Date(),
          ...(runsPayload != null ? { trainRunsOn: runsPayload } : {}),
        },
      });

      let schedule = await this.maybeFillScheduleTrainRunsOn(num, data, opts);
      return { ok: true, schedule };
    } catch (err) {
      if (err instanceof IrctcScheduleMaintenanceError) {
        return {
          ok: false,
          reason: 'maintenance',
          message: err.irctcMessage,
        };
      }
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

    const res = await scheduleClient.get<string>(url, {
      headers,
      responseType: 'text',
    });

    const text = res.data;
    if (!text?.trim()) {
      throw new Error('Schedule for this train is not available.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
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
      throw new Error('Schedule for this train is not available.');
    }
    const trainRunsOn = extractTrainRunsOnFromIrctc(raw);
    const schedule: TrainScheduleResponse = {
      trainNumber: String(raw.trainNumber ?? ''),
      trainName: String(raw.trainName ?? ''),
      stationFrom: String(raw.stationFrom ?? ''),
      stationTo: String(raw.stationTo ?? ''),
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

    let res: Response;
    try {
      res = await fetch(IRCTC_VACANT_BERTH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
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
      throw new Error(`IRCTC request failed (network/connection): ${cause}`);
    }

    const text = await res.text();
    if (!res.ok) {
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
      },
    });
  }

  /**
   * POST trainComposition; returns parsed JSON after basic shape checks (same as getTrainComposition).
   */
  private async postTrainComposition(payload: {
    trainNo: string;
    jDate: string;
    boardingStation: string;
  }): Promise<Record<string, unknown>> {
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

    const res = await fetch(IRCTC_TRAIN_COMPOSITION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
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
    if (data?.error) throw new Error(String(data.error));
    const invalid =
      data.cdd == null || data.trainNo == null || data.remote == null;
    if (invalid) {
      throw new Error(
        'Train composition is temporarily unavailable. Please try again later.',
      );
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

  async getTrainComposition(payload: {
    trainNo: string;
    jDate: string;
    boardingStation: string;
  }): Promise<TrainCompositionResponse> {
    const raw = await this.postTrainComposition(payload);
    const data = raw as unknown as TrainCompositionResponse;
    try {
      await this.persistChartTimesFromComposition(data);
    } catch {
      // persist is best-effort; still return composition
    }
    return data;
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
