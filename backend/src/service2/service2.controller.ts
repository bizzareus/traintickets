import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { IrctcService } from '../irctc/irctc.service';
import { captureSentryException } from '../common/sentry-report';
import {
  getTrainDoesNotRunOnDateError,
  parseJourneyYmdForValidation,
} from '../common/train-run-day.validation';
import { Service2Service } from './service2.service';

/** Avoids String(object) → '[object Object]' for request body fields. */
function unknownToTrimmedString(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return fallback;
}

function unknownToOptionalTrimmedString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return undefined;
}

function normalizeCheckBody(body: Record<string, unknown>) {
  const destinationRaw = unknownToOptionalTrimmedString(
    body.destinationStation,
  );
  return {
    trainNumber: unknownToTrimmedString(body.trainNumber),
    stationCode: unknownToTrimmedString(body.stationCode).toUpperCase(),
    journeyDate: unknownToTrimmedString(body.journeyDate),
    classCode: unknownToTrimmedString(body.classCode, '3A').toUpperCase(),
    destinationStation: destinationRaw
      ? destinationRaw.toUpperCase()
      : undefined,
    passengerDetails: unknownToOptionalTrimmedString(body.passengerDetails),
    forceVacantBerth: body.forceVacantBerth === true || body.forceVacantBerth === 'true',
  };
}

@Controller('api/service2')
export class Service2Controller {
  private readonly logger = new Logger(Service2Controller.name);

  constructor(
    private service2: Service2Service,
    private irctc: IrctcService,
  ) {}

  @Post('check/stream')
  async checkStream(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: false }) res: Response,
  ) {
    const normalized = normalizeCheckBody(body ?? {});
    this.logger.log(
      `[service2/check/stream] step=request body=${JSON.stringify({
        trainNumber: normalized.trainNumber,
        stationCode: normalized.stationCode,
        journeyDate: normalized.journeyDate,
        classCode: normalized.classCode,
        hasDestination: Boolean(normalized.destinationStation),
        hasPassengerDetails: Boolean(normalized.passengerDetails),
      })}`,
    );
    if (
      !normalized.trainNumber ||
      !normalized.stationCode ||
      !normalized.journeyDate
    ) {
      this.logger.warn(
        `[service2/check/stream] step=validation_failed missing required fields`,
      );
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
      (res as { flush?: () => void }).flush?.();
    };

    try {
      this.logger.log(
        `[service2/check/stream] step=sse_pipeline_start train=${normalized.trainNumber} station=${normalized.stationCode} date=${normalized.journeyDate}`,
      );
      writeSse('progress', {
        phase: 'started',
        trainNumber: normalized.trainNumber,
        stationCode: normalized.stationCode,
      });

      const jYmd = parseJourneyYmdForValidation(normalized.journeyDate);
      if (!jYmd) {
        this.logger.warn(
          `[service2/check/stream] step=validation_failed invalid_journey_date`,
        );
        writeSse('error', {
          code: 'INVALID_JOURNEY_DATE',
          message: 'Journey date must be a valid YYYY-MM-DD.',
        });
        res.end();
        return;
      }

      const scheduleResult = await this.irctc.getTrainSchedule(
        normalized.trainNumber,
        {
          fillRunsOnFromComposition: {
            jDate: jYmd,
            boardingStation: normalized.stationCode,
          },
        },
      );
      if (!scheduleResult.ok) {
        if (scheduleResult.reason === 'maintenance') {
          this.logger.warn(
            `[service2/check/stream] step=validation_failed irctc_maintenance`,
          );
          writeSse('error', {
            code: 'IRCTC_MAINTENANCE',
            message:
              'IRCTC is temporarily unavailable (maintenance or downtime). Please try again later.',
          });
        } else {
          this.logger.warn(
            `[service2/check/stream] step=validation_failed schedule_unavailable`,
          );
          writeSse('error', {
            code: 'SCHEDULE_UNAVAILABLE',
            message:
              'Train schedule not found. Please try again after the route is loaded.',
          });
        }
        res.end();
        return;
      }

      const schedule = scheduleResult.schedule;
      if (!schedule.stationList?.length) {
        this.logger.warn(
          `[service2/check/stream] step=validation_failed empty_station_list`,
        );
        writeSse('error', {
          code: 'SCHEDULE_UNAVAILABLE',
          message:
            'Train schedule not found. Please try again after the route is loaded.',
        });
        res.end();
        return;
      }

      const runDayErr = getTrainDoesNotRunOnDateError(
        jYmd,
        schedule.trainRunsOn,
      );
      if (runDayErr) {
        this.logger.warn(
          `[service2/check/stream] step=validation_failed train_does_not_run_on_date code=${runDayErr.code}`,
        );
        writeSse('error', runDayErr);
        res.end();
        return;
      }

      const result = await this.service2.check(
        {
          trainNumber: normalized.trainNumber,
          stationCode: normalized.stationCode,
          journeyDate: normalized.journeyDate,
          classCode: normalized.classCode,
          destinationStation: normalized.destinationStation,
          passengerDetails: normalized.passengerDetails,
          triggerSource: 'manual',
          forceVacantBerth: normalized.forceVacantBerth,
        },
        {
          onIrctcDataReady: (info) => {
            this.logger.log(
              `[service2/check/stream] step=irctc_data_ready vacantSegmentCount=${info.vacantSegmentCount} dest=${info.destinationStation} vacantBerthApiError=${info.vacantBerthApiError ?? 'null'}`,
            );
            writeSse('progress', { phase: 'irctc_complete', ...info });
          },
          onAiStarted: (info) => {
            this.logger.log(
              `[service2/check/stream] step=openai_started dest=${info.destinationStation}`,
            );
            writeSse('progress', { phase: 'ai_started', ...info });
          },
          onPartialOpenAiResult: (info) => {
            this.logger.log(
              `[service2/check/stream] step=partial_openai nextBoarding=${info.nextBoardingStation} chainRound=${info.chainRound}`,
            );
            writeSse('progress', { phase: 'partial_ai_result', ...info });
          },
        },
      );
      this.logger.log(
        `[service2/check/stream] step=finished status=${result.status} chartStatus=${result.chartStatus ? JSON.stringify(result.chartStatus) : 'none'} hasOpenAiSummary=${Boolean(result.openAiSummary)}`,
      );
      writeSse('result', result);
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[service2/check/stream] step=error ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      captureSentryException(err, {
        tags: { route: 'POST /api/service2/check/stream' },
      });
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
    this.logger.log(
      `[service2/check] step=request body=${JSON.stringify({
        trainNumber: normalized.trainNumber,
        stationCode: normalized.stationCode,
        journeyDate: normalized.journeyDate,
        classCode: normalized.classCode,
        hasDestination: Boolean(normalized.destinationStation),
        hasPassengerDetails: Boolean(normalized.passengerDetails),
      })}`,
    );
    if (
      !normalized.trainNumber ||
      !normalized.stationCode ||
      !normalized.journeyDate
    ) {
      this.logger.warn(`[service2/check] step=validation_failed`);
      return {
        status: 'failed',
        error: 'trainNumber, stationCode and journeyDate are required',
      };
    }
    try {
      const out = await this.service2.check({
        trainNumber: normalized.trainNumber,
        stationCode: normalized.stationCode,
        journeyDate: normalized.journeyDate,
        classCode: normalized.classCode,
        destinationStation: normalized.destinationStation,
        passengerDetails: normalized.passengerDetails,
        triggerSource: 'manual',
        forceVacantBerth: normalized.forceVacantBerth,
      });
      this.logger.log(
        `[service2/check] step=finished status=${out.status} chartStatus=${out.chartStatus ? JSON.stringify(out.chartStatus) : 'none'} hasOpenAiSummary=${Boolean(out.openAiSummary)} debugLines=${out.debugLog?.length ?? 0}`,
      );
      return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[service2/check] step=error ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ServiceUnavailableException(
        `Service 2 (IRCTC) check failed: ${message}`,
      );
    }
  }
}
