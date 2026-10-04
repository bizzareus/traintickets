import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';
import { Throttle } from '@nestjs/throttler';

@Controller('api/irctc')
@Throttle({ global: { limit: 20, ttl: 60_000 } })
export class IrctcController {
  private readonly logger = new Logger(IrctcController.name);

  constructor(
    private irctc: IrctcService,
    private irctcChart: IrctcChartService,
    private browserUse: IrctcBrowserUseService,
  ) {}

  @Get('trains')
  async getTrains(@Query('q') q?: string) {
    try {
      if (q && q.trim().length >= 2) {
        return await this.irctc.searchTrains(q);
      }
      return await this.irctc.getTrainList();
    } catch {
      throw new ServiceUnavailableException(
        'Train list is temporarily unavailable.',
      );
    }
  }

  @Get('schedule/:trainNumber')
  async getSchedule(@Param('trainNumber') trainNumber: string) {
    const result = await this.irctc.getTrainSchedule(trainNumber);
    if (!result.ok) {
      if (result.reason === 'maintenance') {
        throw new ServiceUnavailableException(
          'IRCTC is temporarily unavailable (maintenance or downtime). Please try again later.',
        );
      }
      throw new ServiceUnavailableException(
        'Schedule for this train is not available.',
      );
    }
    return result.schedule;
  }

  @Get('browser-use/:trainNumber')
  async getChartV2(
    @Param('trainNumber') trainNumber: string,
    @Query('date') date: string,
    @Query('station') station: string,
  ) {
    try {
      return await this.browserUse.getTrainChart(trainNumber, date, station);
    } catch (error) {
      this.logger.error(
        `Failed to fetch train chart via Browser Use for train ${trainNumber}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Failed to fetch train chart via Browser Use.',
      );
    }
  }

  @Get('chart/:trainNumber')
  async getChart(
    @Param('trainNumber') trainNumber: string,
    @Query('date') date: string,
    @Query('station') station: string,
  ) {
    try {
      return await this.irctcChart.getTrainChart(trainNumber, date, station);
    } catch (error) {
      this.logger.error(
        `Failed to fetch train chart for train ${trainNumber}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Failed to fetch train chart.');
    }
  }

  @Post('train-composition')
  async getTrainComposition(
    @Body()
    body: {
      trainNo?: string;
      jDate?: string;
      boardingStation?: string;
    },
  ) {
    const trainNo = String(body?.trainNo ?? '').trim();
    const jDate = String(body?.jDate ?? '')
      .trim()
      .slice(0, 10);
    const boardingStation = String(body?.boardingStation ?? '')
      .trim()
      .toUpperCase();

    if (!trainNo || !jDate || !boardingStation) {
      throw new BadRequestException(
        'trainNo, jDate, and boardingStation are required',
      );
    }

    try {
      return await this.irctc.getTrainComposition(
        { trainNo, jDate, boardingStation },
        { allowChartNotPrepared: true, cacheByTrainNumber: true },
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch train composition for train ${trainNo}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Failed to fetch train composition.',
      );
    }
  }

  @Post('coach-composition')
  async getCoachComposition(
    @Body()
    body: {
      trainNo?: string;
      boardingStation?: string;
      remoteStation?: string;
      trainSourceStation?: string;
      jDate?: string;
      coach?: string;
      cls?: string;
    },
  ) {
    const trainNo = String(body?.trainNo ?? '').trim();
    const boardingStation = String(body?.boardingStation ?? '')
      .trim()
      .toUpperCase();
    const remoteStation =
      String(body?.remoteStation ?? '')
        .trim()
        .toUpperCase() || boardingStation;
    const trainSourceStation =
      String(body?.trainSourceStation ?? '')
        .trim()
        .toUpperCase() || boardingStation;
    const jDate = String(body?.jDate ?? '')
      .trim()
      .slice(0, 10);
    const coach = String(body?.coach ?? '')
      .trim()
      .toUpperCase();
    const cls = String(body?.cls ?? '').trim();

    if (!trainNo || !boardingStation || !jDate || !coach || !cls) {
      throw new BadRequestException(
        'trainNo, boardingStation, jDate, coach, and cls are required',
      );
    }

    try {
      return await this.irctc.getCoachComposition({
        trainNo,
        boardingStation,
        remoteStation,
        trainSourceStation,
        jDate,
        coach,
        cls,
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch coach composition for train ${trainNo}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Failed to fetch coach composition.',
      );
    }
  }
}
