import { Injectable, Logger } from '@nestjs/common';
import type { SplitTicketBooking } from '@prisma/client';
import moment from 'moment';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { PrismaService } from '../prisma/prisma.service';
import { bookingNotificationMarkdown } from './split-booking.helpers';

export const BOOKING_NTFY_URL =
  'https://ntfy.sh/lastberth_booking_confirmation';

@Injectable()
export class BookingNtfyService {
  private readonly logger = new Logger(BookingNtfyService.name);
  private readonly client = createRetryingAxiosClient({
    serviceName: 'booking-ntfy',
    retries: 2,
    retryPost: true,
    timeoutMs: 5000,
  });

  constructor(private readonly prisma: PrismaService) {}

  async publish(booking: SplitTicketBooking): Promise<boolean> {
    if (booking.paymentStatus !== 'PAID') return false;
    if (booking.ntfyNotifiedAt) return true;
    const lockedAt = new Date();
    const claimed = await this.prisma.splitTicketBooking.updateMany({
      where: {
        id: booking.id,
        paymentStatus: 'PAID',
        ntfyNotifiedAt: null,
        OR: [
          { ntfyLockedAt: null },
          {
            ntfyLockedAt: {
              lt: moment(lockedAt).subtract(1, 'minute').toDate(),
            },
          },
        ],
      },
      data: { ntfyLockedAt: lockedAt },
    });
    if (!claimed.count) return false;
    try {
      const title = `[Manual Booking] ${booking.bookingRef} — Train ${booking.trainNumber}`;
      const { data } = await this.client.post<{ id?: string }>(
        BOOKING_NTFY_URL,
        bookingNotificationMarkdown(booking),
        {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'X-Markdown': 'true',
            // ntfy accepts RFC 2047 headers; Node HTTP headers cannot carry an em dash directly.
            'X-Title': `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`,
            // Retried requests update one notification instead of creating another.
            'X-Sequence-ID': booking.id,
          },
        },
      );
      if (!data?.id) throw new Error('ntfy did not return a notification ID');
      await this.prisma.splitTicketBooking.updateMany({
        where: { id: booking.id, ntfyLockedAt: lockedAt },
        data: { ntfyNotifiedAt: new Date(), ntfyLockedAt: null },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Booking notification failed for ${booking.bookingRef}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.splitTicketBooking.updateMany({
        where: { id: booking.id, ntfyLockedAt: lockedAt },
        data: { ntfyLockedAt: null },
      });
      return false;
    }
  }
}
