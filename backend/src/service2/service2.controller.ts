import {
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Service2Service } from './service2.service';

@Controller('api/service2')
export class Service2Controller {
  constructor(private service2: Service2Service) {}

  @Post('check')
  async check(
    @Body('trainNumber') trainNumber: string,
    @Body('stationCode') stationCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('classCode') classCode: string,
    @Body('destinationStation') destinationStation: string,
    @Body('passengerDetails') passengerDetails: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? '').trim(),
      stationCode: String(stationCode ?? '')
        .trim()
        .toUpperCase(),
      journeyDate: String(journeyDate ?? '').trim(),
      classCode: String(classCode ?? '3A')
        .trim()
        .toUpperCase(),
      destinationStation: destinationStation
        ? String(destinationStation).trim().toUpperCase()
        : undefined,
      passengerDetails: passengerDetails
        ? String(passengerDetails).trim()
        : undefined,
    };
    if (
      !normalized.trainNumber ||
      !normalized.stationCode ||
      !normalized.journeyDate
    ) {
      return {
        status: 'failed',
        error: 'trainNumber, stationCode and journeyDate are required',
      };
    }
    try {
      return await this.service2.check({
        trainNumber: normalized.trainNumber,
        stationCode: normalized.stationCode,
        journeyDate: normalized.journeyDate,
        classCode: normalized.classCode,
        destinationStation: normalized.destinationStation,
        passengerDetails: normalized.passengerDetails,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `Service 2 (IRCTC) check failed: ${message}`,
      );
    }
  }
}
