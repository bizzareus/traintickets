import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChartTimeService } from './chart-time.service';
import { BrowserUseService } from '../browser-use/browser-use.service';

@Controller('api/chart-time')
export class ChartTimeController {
  constructor(
    private chartTime: ChartTimeService,
    private browserUse: BrowserUseService,
  ) {}

  @Get('train/:trainNumber/station/:stationCode')
  async get(
    @Param('trainNumber') trainNumber: string,
    @Param('stationCode') stationCode: string,
    @Query('fetchIfMissing') fetchIfMissing: string,
    @Query('journeyDate') journeyDate: string,
  ) {
    const time = await this.chartTime.getChartTime(trainNumber, stationCode);
    if (time) {
      return {
        trainNumber,
        stationCode,
        chartTimeLocal: time,
        fromCache: true,
      };
    }
    if (fetchIfMissing === '1' || fetchIfMissing === 'true') {
      if (!journeyDate?.trim()) {
        return {
          error: 'journeyDate is required when fetchIfMissing is true',
          trainNumber,
          stationCode,
          chartTimeLocal: null,
        };
      }
      try {
        const result = await this.browserUse.executeFetchChartTime({
          trainNumber: trainNumber.trim(),
          stationCode: stationCode.trim().toUpperCase(),
          journeyDate: journeyDate.trim().slice(0, 10),
        });
        if (result.status === 'success' && result.chartTimeLocal) {
          await this.chartTime.setChartTime(
            trainNumber.trim(),
            stationCode.trim().toUpperCase(),
            result.chartTimeLocal,
          );
          return {
            trainNumber,
            stationCode,
            chartTimeLocal: result.chartTimeLocal,
            fromCache: false,
          };
        }
      } catch {
        // fall through to return null
      }
    }
    return { trainNumber, stationCode, chartTimeLocal: time ?? null };
  }

  @Post()
  async set(
    @Body('trainNumber') trainNumber: string,
    @Body('stationCode') stationCode: string,
    @Body('chartTimeLocal') chartTimeLocal: string,
  ) {
    if (!trainNumber || !stationCode || !chartTimeLocal) {
      return {
        error: 'trainNumber, stationCode and chartTimeLocal are required',
      };
    }
    return this.chartTime.setChartTime(
      trainNumber,
      stationCode,
      chartTimeLocal,
    );
  }

  @Get('train/:trainNumber')
  async listForTrain(
    @Param('trainNumber') trainNumber: string,
    @Query('stations') stations: string | undefined,
  ) {
    const codes = stations ? stations.split(',').map((s) => s.trim()) : [];
    const map = await this.chartTime.getChartTimesForTrain(trainNumber, codes);
    return Object.fromEntries(map);
  }

  /**
   * Fetch chart time from IRCTC via Browser Use (reservation chart page shows
   * "First Chart Creation: DD/MM/YYYY HH:MM Hrs." and "Charting Station: NAME (CODE)").
   * Stores the time in DB so we don't need to fetch again for this train/station.
   */
  @Post('fetch')
  async fetch(
    @Body('trainNumber') trainNumber: string,
    @Body('stationCode') stationCode: string,
    @Body('stationName') stationName: string,
    @Body('journeyDate') journeyDate: string,
  ) {
    const tn = String(trainNumber ?? '').trim();
    const sc = String(stationCode ?? '')
      .trim()
      .toUpperCase();
    const jd = String(journeyDate ?? '').trim();
    if (!tn || !sc || !jd) {
      return {
        error: 'trainNumber, stationCode and journeyDate are required',
      };
    }

    const existing = await this.chartTime.getChartTime(tn, sc);
    if (existing) {
      return {
        trainNumber: tn,
        stationCode: sc,
        chartTimeLocal: existing,
        fromCache: true,
      };
    }

    try {
      const result = await this.browserUse.executeFetchChartTime({
        trainNumber: tn,
        stationCode: sc,
        stationName: stationName ? String(stationName).trim() : undefined,
        journeyDate: jd,
      });

      if (result.status !== 'success' || !result.chartTimeLocal) {
        return {
          error: 'Could not extract chart time from IRCTC page',
          output: result.output,
        };
      }

      await this.chartTime.setChartTime(tn, sc, result.chartTimeLocal);
      return {
        trainNumber: tn,
        stationCode: sc,
        chartTimeLocal: result.chartTimeLocal,
        chartingStationCode: result.chartingStationCode,
        fromCache: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `Failed to fetch chart time: ${message}`,
      );
    }
  }
}
