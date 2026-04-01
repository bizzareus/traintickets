import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH,
  ChartTimeIngestionService,
} from './chart-time-ingestion.service';

@Controller('api/chart-time-ingestion')
export class ChartTimeIngestionController {
  constructor(private readonly ingestion: ChartTimeIngestionService) {}

  @Post('verify')
  verify(@Body() body: { adminPassword: string }) {
    const adminPassword = String(body.adminPassword ?? '');
    if (!adminPassword) {
      throw new BadRequestException('adminPassword is required.');
    }
    return this.ingestion.verifyAdminPassword(adminPassword);
  }

  @Post('run')
  async run(
    @Body()
    body: Record<string, unknown> & {
      journeyDate?: string;
      trainNumber?: string;
      trainNumbers?: string[];
      trainNumbersText?: string;
    },
  ) {
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

  /** Next batch of pending `TrainList` rows (50): IST today, then tomorrow if no chart data. */
  @Post('run-train-list')
  runTrainList() {
    return this.ingestion.runTrainListBatchIngestion();
  }

  @Get('chart-time-tasks')
  listChartTimeTasks(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.ingestion.listChartTimeAvailabilityTasks({
      limit: limit ? Number(limit) : undefined,
      status: status ?? undefined,
    });
  }
}
