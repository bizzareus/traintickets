import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH,
  ChartTimeIngestionService,
} from './chart-time-ingestion.service';
import {
  ADMIN_PASSWORD_HEADER,
  assertAdminAuth,
  buildAdminSessionCookieValue,
  buildAdminSessionSetCookie,
} from '../common/admin-auth';

@Controller('api/chart-time-ingestion')
export class ChartTimeIngestionController {
  constructor(private readonly ingestion: ChartTimeIngestionService) {}

  @Post('verify')
  verify(
    @Body() body: { adminPassword: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const adminPassword = String(body.adminPassword ?? '');
    if (!adminPassword) {
      throw new BadRequestException('adminPassword is required.');
    }
    const result = this.ingestion.verifyAdminPassword(adminPassword);
    const cookieValue = buildAdminSessionCookieValue();
    if (cookieValue) {
      res.setHeader('Set-Cookie', buildAdminSessionSetCookie(cookieValue));
    }
    return result;
  }

  @Post('run')
  async run(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body()
    body: Record<string, unknown> & {
      journeyDate?: string;
      trainNumber?: string;
      trainNumbers?: string[];
      trainNumbersText?: string;
    },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const journeyDate = String(body.journeyDate ?? '').trim();
    const unique = this.ingestion.collectTrainNumbersForIngestionRun(body);
    if (!journeyDate) {
      throw new BadRequestException('journeyDate is required.');
    }
    if (unique.length === 0) {
      throw new BadRequestException(
        'Could not parse any train numbers. Use e.g. 22637 or quoted lines like "22637 - WEST COAST EXP", (see train list export).',
      );
    }
    if (unique.length > CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH) {
      throw new BadRequestException(
        `At most ${CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH} trains per request.`,
      );
    }
    return this.ingestion.runIngestionBatch({
      trainNumbers: unique,
      journeyDate,
    });
  }

  /** Next batch of pending `TrainList` rows (500): IST today, then tomorrow if no chart data. */
  @Post('run-train-list')
  runTrainList(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.ingestion.runTrainListBatchIngestion();
  }

  @Get('chart-time-tasks')
  listChartTimeTasks(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.ingestion.listChartTimeAvailabilityTasks({
      limit: limit ? Number(limit) : undefined,
      status: status ?? undefined,
    });
  }
}
