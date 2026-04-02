import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ChartTimeIngestionService } from './chart-time-ingestion.service';

@Injectable()
export class ChartTimeIngestionCronService {
  private readonly logger = new Logger(ChartTimeIngestionCronService.name);
  private running = false;

  /** Every 10 minutes: ingest next 50 pending train-list rows. */
  @Cron('*/10 * * * *')
  async runTrainListIngestionBatchCron(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        '[chart-time-ingestion/cron] previous run still active; skipping tick',
      );
      return;
    }
    this.running = true;
    const t0 = Date.now();
    try {
      const out = await this.ingestion.runTrainListBatchIngestion();
      this.logger.log(
        `[chart-time-ingestion/cron] done picked=${out.summary.pickedFromTrainList} ingested=${out.summary.ingestedCount} skipped_existing=${out.summary.skippedExistingDbCount} failed=${out.summary.failedCount} remaining=${out.summary.remainingPendingTrainList} elapsedMs=${Date.now() - t0}`,
      );
    } catch (err) {
      this.logger.error(
        `[chart-time-ingestion/cron] failed ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  constructor(private readonly ingestion: ChartTimeIngestionService) {}
}
