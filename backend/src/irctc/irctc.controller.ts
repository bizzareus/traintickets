import {
  Controller,
  Get,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';

@Controller('api/irctc')
export class IrctcController {
  constructor(
    private irctc: IrctcService,
    private irctcChart: IrctcChartService,
    private browserUse: IrctcBrowserUseService,
  ) {}

  @Get('trains')
  async getTrains() {
    try {
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
      throw new ServiceUnavailableException(
        `Failed to fetch train chart via Browser Use: ${error.message}`,
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
      throw new ServiceUnavailableException(
        `Failed to fetch train chart: ${error.message}`,
      );
    }
  }
}
