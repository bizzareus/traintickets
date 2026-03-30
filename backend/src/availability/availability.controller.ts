import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JourneyTaskService } from './journey-task.service';
import { NotificationService } from '../notification/notification.service';

@Controller('api/availability')
export class AvailabilityController {
  constructor(
    private availability: AvailabilityService,
    private journeyTask: JourneyTaskService,
    private notification: NotificationService,
  ) {}

  @Post('check')
  async startCheck(
    @Body('trainNumber') trainNumber: string,
    @Body('trainName') trainName: string,
    @Body('stationCode') stationCode: string,
    @Body('fromStationName') fromStationName: string,
    @Body('toStationCode') toStationCode: string,
    @Body('toStationName') toStationName: string,
    @Body('classCode') classCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('passengerDetails') passengerDetails: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? '').trim(),
      trainName: String(trainName ?? '').trim(),
      stationCode: String(stationCode ?? '')
        .trim()
        .toUpperCase(),
      fromStationName: String(fromStationName ?? '').trim(),
      toStationCode:
        String(toStationCode ?? '')
          .trim()
          .toUpperCase() || undefined,
      toStationName: String(toStationName ?? '').trim(),
      classCode: String(classCode ?? '3A')
        .trim()
        .toUpperCase(),
      journeyDate: String(journeyDate ?? '').trim(),
      passengerDetails: passengerDetails
        ? String(passengerDetails).trim()
        : undefined,
    };
    if (
      !normalized.trainNumber ||
      !normalized.stationCode ||
      !normalized.journeyDate
    ) {
      return { error: 'trainNumber, stationCode and journeyDate are required' };
    }
    try {
      return await this.availability.startCheck(normalized);
    } catch {
      throw new ServiceUnavailableException(
        'Availability check service is temporarily unavailable. Please try again later.',
      );
    }
  }

  @Get('check/:jobId')
  async getCheck(@Param('jobId') jobId: string) {
    const check = await this.availability.getByJobId(jobId);
    if (!check) return { error: 'Not found', status: null };
    return {
      id: check.id,
      jobId: check.jobId,
      status: check.status,
      trainNumber: check.trainNumber,
      stationCode: check.stationCode,
      classCode: check.classCode,
      journeyDate: check.journeyDate?.toISOString?.()?.slice(0, 10),
      resultPayload: check.resultPayload,
      completedAt: check.completedAt?.toISOString?.() ?? null,
    };
  }

  /**
   * Poll this endpoint with the jobId returned from POST /check to get status and output.
   * When status is 'success' or 'failed', polling can stop.
   */
  @Get('job/:jobId/status')
  async getJobStatus(@Param('jobId') jobId: string) {
    try {
      return await this.availability.getJobStatus(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        output: null,
        resultPayload: { error: message },
      };
    }
  }

  /**
   * Get stations between from and to that have chart times (for monitor station selection).
   * Query: trainNumber, fromStationCode, toStationCode. Optional: journeyDate.
   */
  @Get('journey/stations')
  async getJourneyStations(
    @Query('trainNumber') trainNumber: string,
    @Query('fromStationCode') fromStationCode: string,
    @Query('toStationCode') toStationCode: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? '').trim(),
      fromStationCode: String(fromStationCode ?? '')
        .trim()
        .toUpperCase(),
      toStationCode: String(toStationCode ?? '')
        .trim()
        .toUpperCase(),
    };
    if (
      !normalized.trainNumber ||
      !normalized.fromStationCode ||
      !normalized.toStationCode
    ) {
      return {
        error: 'trainNumber, fromStationCode and toStationCode are required',
        stations: [],
      };
    }
    try {
      const stations =
        await this.journeyTask.getStationsWithChartTimesForRoute(normalized);
      return { stations };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(message);
    }
  }

  /**
   * Create journey tasks: one per (user-confirmed) station and per chart one/chart two, scheduled at each chart time.
   * If stationCodesToMonitor is provided, only those stations are used; otherwise all stations in route with chart times.
   * If chart time for that date is already past, runs Browser Use immediately.
   */
  @Post('journey')
  async createJourney(
    @Body('trainNumber') trainNumber: string,
    @Body('trainName') trainName: string,
    @Body('fromStationCode') fromStationCode: string,
    @Body('toStationCode') toStationCode: string,
    @Body('journeyDate') journeyDate: string,
    @Body('classCode') classCode: string,
    @Body('stationCodesToMonitor') stationCodesToMonitor?: string[],
    @Body('email') email?: string,
    @Body('mobile') mobile?: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? '').trim(),
      trainName: trainName ? String(trainName).trim() : undefined,
      fromStationCode: String(fromStationCode ?? '')
        .trim()
        .toUpperCase(),
      toStationCode: String(toStationCode ?? '')
        .trim()
        .toUpperCase(),
      journeyDate: String(journeyDate ?? '').trim(),
      classCode: String(classCode ?? '3A')
        .trim()
        .toUpperCase(),
      stationCodesToMonitor:
        Array.isArray(stationCodesToMonitor) && stationCodesToMonitor.length > 0
          ? stationCodesToMonitor.map((c) => String(c).trim().toUpperCase())
          : undefined,
      email: email ? String(email).trim() : undefined,
      mobile: mobile ? String(mobile).trim() : undefined,
    };
    if (
      !normalized.trainNumber ||
      !normalized.fromStationCode ||
      !normalized.toStationCode ||
      !normalized.journeyDate
    ) {
      return {
        error:
          'trainNumber, fromStationCode, toStationCode and journeyDate are required',
      };
    }
    try {
      const result = await this.journeyTask.createJourneyTasks(normalized);
      void this.notification
        .sendAdminMonitoringRequestEmail({
          journeyRequestId: result.journeyRequestId,
          taskCount: result.tasks.length,
          trainNumber: normalized.trainNumber,
          trainName: normalized.trainName,
          fromStationCode: normalized.fromStationCode,
          toStationCode: normalized.toStationCode,
          journeyDate: normalized.journeyDate,
          classCode: normalized.classCode,
          stationCodesToMonitor: normalized.stationCodesToMonitor,
          userEmail: normalized.email,
          userMobile: normalized.mobile,
        })
        .catch((err) =>
          console.error('Admin monitoring request notification failed', err),
        );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(message);
    }
  }

  @Get('journey/:journeyRequestId')
  async getJourneyTasks(@Param('journeyRequestId') journeyRequestId: string) {
    const tasks =
      await this.journeyTask.getTasksByJourneyRequestId(journeyRequestId);
    if (!tasks.length) return { error: 'Not found', tasks: [] };
    return {
      journeyRequestId,
      tasks: tasks.map((t) => ({
        id: t.id,
        stationCode: t.stationCode,
        chartAt: t.chartAt.toISOString(),
        status: t.status,
        resultPayload: t.resultPayload,
        completedAt: t.completedAt?.toISOString?.() ?? null,
      })),
    };
  }
}
