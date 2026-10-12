import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SearchCreditsService } from './search-credits.service';

/**
 * Reconciles asynchronously-settled search debits. Only fires in the worker
 * process (the only context with ScheduleModule). The API path also settles
 * best-effort right after completion; this cron is the crash-recovery net.
 */
@Injectable()
export class SearchCreditsSettlerService {
  private readonly logger = new Logger(SearchCreditsSettlerService.name);

  constructor(private readonly credits: SearchCreditsService) {}

  @Cron('*/30 * * * * *')
  async settleDueSearches(): Promise<void> {
    try {
      const result = await this.credits.settlePendingLogs();
      if (result.settled > 0 || result.overLimit > 0) {
        this.logger.log(
          `Settled search debits: settled=${result.settled} overLimit=${result.overLimit} skipped=${result.skipped}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Search debit settle tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
