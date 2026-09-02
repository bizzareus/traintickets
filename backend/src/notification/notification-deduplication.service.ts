import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationDeduplicationService {
  private readonly logger = new Logger(NotificationDeduplicationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a notification should be sent or if a duplicate notification was already
   * dispatched to the same recipient for the same train & journey date within windowHours.
   */
  async shouldSendNotification(params: {
    recipient?: string | null;
    channel: 'whatsapp' | 'email';
    trainNumber: string;
    journeyDate: Date | string;
    notificationType:
      | 'no_seats'
      | 'seats_found'
      | 'alt_trains'
      | 'chart_prepared_only';
    windowHours?: number;
  }): Promise<boolean> {
    const { recipient, channel, trainNumber, journeyDate, notificationType } =
      params;
    if (!recipient?.trim()) return true;

    const normalizedRecipient = recipient.trim().toLowerCase();
    const windowHours = params.windowHours ?? 4;
    const sinceDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const journeyDateStr =
      journeyDate instanceof Date
        ? journeyDate.toISOString().slice(0, 10)
        : String(journeyDate).slice(0, 10);
    const journeyDateObj = new Date(`${journeyDateStr}T00:00:00.000Z`);

    const notificationTypesToCheck =
      notificationType === 'seats_found'
        ? ['seats_found']
        : ['no_seats', 'alt_trains', 'seats_found'];

    try {
      const existing = await this.prisma.sentNotificationLog.findFirst({
        where: {
          recipient: normalizedRecipient,
          channel,
          trainNumber: trainNumber.trim(),
          journeyDate: journeyDateObj,
          notificationType: { in: notificationTypesToCheck },
          sentAt: { gte: sinceDate },
        },
      });

      if (existing) {
        this.logger.warn(
          `[Deduplication] Suppressing ${channel} ${notificationType} notification to ${normalizedRecipient} for train ${trainNumber} on ${journeyDateStr} (already sent ${existing.notificationType} at ${existing.sentAt.toISOString()})`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('Error checking notification deduplication log:', err);
      // On DB error, default to true so we don't break notifications
      return true;
    }
  }

  /**
   * Record a dispatched notification in the database to prevent duplicate alerts.
   */
  async recordNotificationSent(params: {
    recipient?: string | null;
    channel: 'whatsapp' | 'email';
    trainNumber: string;
    journeyDate: Date | string;
    notificationType:
      | 'no_seats'
      | 'seats_found'
      | 'alt_trains'
      | 'chart_prepared_only';
  }): Promise<void> {
    const { recipient, channel, trainNumber, journeyDate, notificationType } =
      params;
    if (!recipient?.trim()) return;

    const normalizedRecipient = recipient.trim().toLowerCase();
    const journeyDateStr =
      journeyDate instanceof Date
        ? journeyDate.toISOString().slice(0, 10)
        : String(journeyDate).slice(0, 10);
    const journeyDateObj = new Date(`${journeyDateStr}T00:00:00.000Z`);

    try {
      await this.prisma.sentNotificationLog.create({
        data: {
          recipient: normalizedRecipient,
          channel,
          trainNumber: trainNumber.trim(),
          journeyDate: journeyDateObj,
          notificationType,
        },
      });
    } catch (err) {
      this.logger.error('Failed to record sent notification log:', err);
    }
  }
}
