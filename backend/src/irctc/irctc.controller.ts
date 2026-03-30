import {
  Controller,
  Get,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IrctcService } from './irctc.service';

@Controller('api/irctc')
export class IrctcController {
  constructor(private irctc: IrctcService) {}

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
}
