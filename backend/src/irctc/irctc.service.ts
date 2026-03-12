import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const IRCTC_TRAIN_LIST_URL = 'https://www.irctc.co.in/eticketing/trainList';
const IRCTC_SCHEDULE_URL =
  'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

// Headers matching working curl for schedule API (referer + browser-like headers)
const SCHEDULE_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  bmirak: 'webbm',
  dnt: '1',
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
    const headers = { ...SCHEDULE_HEADERS };
    const cookies = process.env.IRCTC_COOKIES;
    if (cookies?.trim()) headers['Cookie'] = cookies.trim();
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`IRCTC schedule failed: ${res.status}`);
    const data = (await res.json()) as TrainScheduleResponse;
    if (!data || !Array.isArray(data.stationList))
      throw new Error('Invalid schedule response');
    return data;
  }

  async getTrainList(): Promise<TrainOption[]> {
    const res = await fetch(IRCTC_TRAIN_LIST_URL, { headers: FETCH_HEADERS });

    if (!res.ok) {
      throw new Error(`IRCTC train list failed: ${res.status}`);
    }

    const raw = await res.text();
    const items = this.parseTrainListResponse(raw);
    return items.map((label) => {
      const number = label.includes(' - ')
        ? label.split(' - ')[0].trim()
        : label.trim();
      return { number, label };
    });
  }

  private parseTrainListResponse(raw: string): string[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      if (trimmed.startsWith('[')) {
        const arr = JSON.parse(trimmed) as unknown;
        return Array.isArray(arr)
          ? arr.map((x) => String(x ?? '')).filter(Boolean)
          : [];
      }
      if (trimmed.startsWith('"')) {
        const wrapped = `[${trimmed}]`;
        const arr = JSON.parse(wrapped) as unknown;
        return Array.isArray(arr)
          ? arr.map((x) => String(x ?? '')).filter(Boolean)
          : [];
      }
    } catch {
      // fallback: split by "," and trim quotes
    }

    const parts = trimmed.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    return parts.filter(Boolean);
  }
}
