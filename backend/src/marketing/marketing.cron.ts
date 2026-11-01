import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketingService } from './marketing.service';

@Injectable()
export class MarketingCronService {
  private readonly logger = new Logger(MarketingCronService.name);

  constructor(private readonly marketingService: MarketingService) {}

  /**
   * Cron runs every 15 minutes to find abandoned booking attempts and email
   * single recovery reminders.
   */
  @Cron(process.env.MARKETING_CRON_SCHEDULE ?? '*/15 * * * *')
  async handleAbandonedBookingCron() {
    this.logger.log(
      'Starting 15-minute abandoned booking recovery cron tick...',
    );
    try {
      const result = await this.marketingService.processAbandonedBookingsCron();
      this.logger.log(
        `Abandoned booking cron tick completed: scanned=${result.scanned}, eligible=${result.eligible}, sent=${result.sent}, skipped=${result.skipped}`,
      );
    } catch (err) {
      this.logger.error('Error in abandoned booking marketing cron', err);
    }
  }
}
