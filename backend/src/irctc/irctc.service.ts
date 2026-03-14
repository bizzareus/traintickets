import { Injectable } from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
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

export type TrainScheduleResponse = {
  trainNumber: string;
  trainName: string;
  stationFrom: string;
  stationTo: string;
  stationList: ScheduleStation[];
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
  ): Promise<TrainScheduleResponse | null> {
    const num = String(trainNumber).trim();
    if (!num) return null;

    const cached = await this.prisma.trainScheduleCache.findUnique({
      where: { trainNumber: num },
    });
    if (cached) {
      return {
        trainNumber: cached.trainNumber,
        trainName: cached.trainName,
        stationFrom: cached.stationFrom,
        stationTo: cached.stationTo,
        stationList: (cached.stationList as ScheduleStation[]) ?? [],
      };
    }

    try {
      const data = await this.fetchScheduleFromIrctc(num);
      if (!data?.stationList?.length) return null;

      await this.prisma.trainScheduleCache.upsert({
        where: { trainNumber: num },
        create: {
          trainNumber: data.trainNumber,
          trainName: data.trainName,
          stationFrom: data.stationFrom,
          stationTo: data.stationTo,
          stationList: data.stationList as object,
        },
        update: {
          trainName: data.trainName,
          stationFrom: data.stationFrom,
          stationTo: data.stationTo,
          stationList: data.stationList as object,
          fetchedAt: new Date(),
        },
      });

      return data;
    } catch {
      return null;
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
    let data: TrainScheduleResponse;
    try {
      data = JSON.parse(text) as TrainScheduleResponse;
    } catch {
      throw new Error('Schedule for this train is not available.');
    }
    if (!data || !Array.isArray(data.stationList)) {
      throw new Error('Schedule for this train is not available.');
    }
    return data;
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

  async getTrainComposition(payload: {
    trainNo: string;
    jDate: string;
    boardingStation: string;
  }): Promise<TrainCompositionResponse> {
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
    let data: TrainCompositionResponse;
    try {
      data = JSON.parse(text) as TrainCompositionResponse;
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
