import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chart preparation time per train/station (e.g. train 29251 from NDLS at 19:54).
 * Used to schedule availability checks at exact chart time.
 */
@Injectable()
export class ChartTimeService {
  constructor(private prisma: PrismaService) {}

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
          trainNumber: String(trainNumber).trim(),
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
      trainNumber: String(trainNumber).trim(),
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
    const num = String(trainNumber).trim();
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
  async getChartTimesWithSecondChartForTrain(
    trainNumber: string,
    stationCodes: string[],
  ): Promise<
    Map<string, { chartOne: string; chartTwo?: { time: string; dayOffset: number } }>
  > {
    const num = String(trainNumber).trim();
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
    const map = new Map<
      string,
      { chartOne: string; chartTwo?: { time: string; dayOffset: number } }
    >();
    for (const r of rows) {
      const entry: { chartOne: string; chartTwo?: { time: string; dayOffset: number } } = {
        chartOne: r.chartTimeLocal,
      };
      if (r.chartTwoTimeLocal?.trim()) {
        entry.chartTwo = {
          time: r.chartTwoTimeLocal.trim(),
          dayOffset: r.chartTwoDayOffset ?? 0,
        };
      }
      map.set(r.stationCode, entry);
    }
    return map;
  }
}
