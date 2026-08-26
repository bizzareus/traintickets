import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IrctcService, to5DigitTrainNo } from '../irctc/irctc.service';

const CHART_TIME_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_CHART_TIME_CACHE_SIZE = 2000;

export type ChartMetaEntry = {
  chartOne: { time: string; dayOffset: number | null };
  chartTwo?: { time: string; dayOffset: number | null };
  chartRemoteStation?: string | null;
  chartNextRemoteStation?: string | null;
};

/**
 * Chart preparation time per train/station (e.g. train 29251 from NDLS at 19:54).
 * Used to schedule availability checks at exact chart time.
 */
@Injectable()
export class ChartTimeService {
  private readonly logger = new Logger(ChartTimeService.name);
  private readonly memoryCache = new Map<
    string,
    { data: Map<string, ChartMetaEntry>; expiresAt: number }
  >();

  constructor(
    private prisma: PrismaService,
    private readonly irctc: IrctcService,
  ) {}

  /**
   * Get chart time for a station of a train. Returns HH:MM (24h) or null.
   */
  async getChartTime(
    trainNumber: string,
    stationCode: string,
  ): Promise<string | null> {
    const row = await this.prisma.trainStationChartTime.findUnique({
      where: {
        trainNumber_stationCode: {
          trainNumber: to5DigitTrainNo(trainNumber),
          stationCode: String(stationCode).trim().toUpperCase(),
        },
      },
    });
    return row?.chartTimeLocal ?? null;
  }

  /**
   * Set or update chart time for a train/station (e.g. "19:54").
   */
  async setChartTime(
    trainNumber: string,
    stationCode: string,
    chartTimeLocal: string,
  ): Promise<{ id: string }> {
    const raw = String(chartTimeLocal).trim();
    const match = raw.match(/^(\d{1,2}):?(\d{2})\s*(?:am|pm)?$/i);
    const chartTime = match
      ? `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`
      : raw;
    const normalized = {
      trainNumber: to5DigitTrainNo(trainNumber),
      stationCode: String(stationCode).trim().toUpperCase(),
      chartTimeLocal: chartTime,
    };
    const row = await this.prisma.trainStationChartTime.upsert({
      where: {
        trainNumber_stationCode: {
          trainNumber: normalized.trainNumber,
          stationCode: normalized.stationCode,
        },
      },
      create: normalized,
      update: { chartTimeLocal: normalized.chartTimeLocal },
    });
    this.memoryCache.delete(normalized.trainNumber);
    return { id: row.id };
  }

  /**
   * Get chart times for multiple stations of a train. Returns Map stationCode -> HH:MM.
   * If stationCodes is empty, returns all known chart times for that train.
   */
  async getChartTimesForTrain(
    trainNumber: string,
    stationCodes: string[],
  ): Promise<Map<string, string>> {
    const num = to5DigitTrainNo(trainNumber);
    const where: { trainNumber: string; stationCode?: { in: string[] } } = {
      trainNumber: num,
    };
    if (stationCodes.length > 0) {
      where.stationCode = {
        in: stationCodes.map((c) => String(c).trim().toUpperCase()),
      };
    }
    const rows = await this.prisma.trainStationChartTime.findMany({
      where,
    });
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.stationCode, r.chartTimeLocal);
    }
    return map;
  }

  /**
   * Get chart one and chart two (with day offset) per station for a train.
   * Used to create one task per chart event (chart one and optionally chart two).
   */
  /**
   * Chart one (and optional chart two) for one train + station from DB.
   */
  async getChartMetaForTrainStation(
    trainNumber: string,
    stationCode: string,
  ): Promise<{
    chartOne: { time: string; dayOffset: number | null };
    chartTwo?: { time: string; dayOffset: number | null };
    chartRemoteStation?: string | null;
    chartNextRemoteStation?: string | null;
  } | null> {
    const code = String(stationCode).trim().toUpperCase();
    const map = await this.getChartTimesWithSecondChartForTrain(trainNumber, [
      code,
    ]);
    return map.get(code) ?? null;
  }

  async getChartTimesWithSecondChartForTrain(
    trainNumber: string,
    stationCodes: string[],
    _jDate?: Date | string,
  ): Promise<Map<string, ChartMetaEntry>> {
    const num = to5DigitTrainNo(trainNumber);
    const normalizedCodes = stationCodes.map((c) =>
      String(c).trim().toUpperCase(),
    );

    const cached = this.memoryCache.get(num);
    if (cached && cached.expiresAt > Date.now()) {
      if (normalizedCodes.length === 0) {
        return new Map(cached.data);
      }
      const allPresent = normalizedCodes.every((c) => cached.data.has(c));
      if (allPresent) {
        const out = new Map<string, ChartMetaEntry>();
        for (const code of normalizedCodes) {
          const val = cached.data.get(code);
          if (val) out.set(code, val);
        }
        return out;
      }
    }

    const where: { trainNumber: string; stationCode?: { in: string[] } } = {
      trainNumber: num,
    };
    if (normalizedCodes.length > 0) {
      where.stationCode = {
        in: normalizedCodes,
      };
    }
    const rows = await this.prisma.trainStationChartTime.findMany({ where });
    const map = new Map<string, ChartMetaEntry>();
    for (const r of rows) {
      const entry: ChartMetaEntry = {
        chartOne: {
          time: r.chartTimeLocal,
          dayOffset: (r as any).chartOneDayOffset,
        },
        chartRemoteStation: (r as any).chartRemoteStation,
        chartNextRemoteStation: (r as any).chartNextRemoteStation,
      };
      if (r.chartTwoTimeLocal?.trim()) {
        entry.chartTwo = {
          time: r.chartTwoTimeLocal.trim(),
          dayOffset: r.chartTwoDayOffset,
        };
      }
      map.set(r.stationCode, entry);
    }

    // Merge into memory cache
    const existingCache = this.memoryCache.get(num);
    const mergedData =
      existingCache && existingCache.expiresAt > Date.now()
        ? new Map([...existingCache.data, ...map])
        : new Map(map);

    if (this.memoryCache.size >= MAX_CHART_TIME_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(num, {
      data: mergedData,
      expiresAt: Date.now() + CHART_TIME_CACHE_TTL_MS,
    });

    return map;
  }
}
