import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Service2Service } from './service2.service';

function normalizeCheckBody(body: Record<string, unknown>) {
  return {
    trainNumber: String(body.trainNumber ?? '').trim(),
    stationCode: String(body.stationCode ?? '')
      .trim()
      .toUpperCase(),
    journeyDate: String(body.journeyDate ?? '').trim(),
    classCode: String(body.classCode ?? '3A')
      .trim()
      .toUpperCase(),
    destinationStation: body.destinationStation
      ? String(body.destinationStation).trim().toUpperCase()
      : undefined,
    passengerDetails: body.passengerDetails
      ? String(body.passengerDetails).trim()
      : undefined,
  };
}

@Controller('api/service2')
export class Service2Controller {
  constructor(private service2: Service2Service) {}

  @Post('check/stream')
  async checkStream(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: false }) res: Response,
  ) {
    const normalized = normalizeCheckBody(body ?? {});
    if (
      !normalized.trainNumber ||
      !normalized.stationCode ||
      !normalized.journeyDate
    ) {
      throw new BadRequestException(
        'trainNumber, stationCode and journeyDate are required',
      );
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const writeSse = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.service2.check(
        {
          trainNumber: normalized.trainNumber,
          stationCode: normalized.stationCode,
          journeyDate: normalized.journeyDate,
          classCode: normalized.classCode,
          destinationStation: normalized.destinationStation,
          passengerDetails: normalized.passengerDetails,
        },
        {
          onIrctcDataReady: (info) =>
            writeSse('progress', { phase: 'irctc_complete', ...info }),
          onAiStarted: () => writeSse('progress', { phase: 'ai_started' }),
        },
      );
      writeSse('result', result);
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeSse('error', { message });
      res.end();
    }
  }

  @Post('check')
  async check(
    @Body('trainNumber') trainNumber: string,
    @Body('stationCode') stationCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('classCode') classCode: string,
    @Body('destinationStation') destinationStation: string,
    @Body('passengerDetails') passengerDetails: string,
  ) {
    const normalized = normalizeCheckBody({
      trainNumber,
      stationCode,
      journeyDate,
      classCode,
      destinationStation,
      passengerDetails,
    });
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
