import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SplitTicketBooking } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { escapeHtml } from '../notification/notification.helpers';
import { WasenderProvider } from '../notification/whatsapp-providers/wasender.provider';
import { PrismaService } from '../prisma/prisma.service';
import { manualBookingMessage } from './split-booking.helpers';

@Injectable()
export class ManualBookingService {
  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly wasender: WasenderProvider,
    private readonly prisma: PrismaService,
  ) {}

  async notify(
    booking: SplitTicketBooking,
  ): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    if (booking.bookingMode !== 'MANUAL' || booking.paymentStatus !== 'PAID') {
      throw new Error('Manual notifications require a paid manual booking');
    }
    const text = manualBookingMessage(booking);
    const channels = [
      {
        field: 'manualEmailSentAt' as const,
        send: () =>
          this.notifications.sendEmail(
            this.config.get<string>('SPLIT_BOOKING_ADMIN_EMAIL') ||
              'me@kartikarora.in',
            `[Manual Booking] ${booking.bookingRef} — Train ${booking.trainNumber}`,
            `<h1>Manual train booking request</h1><pre>${escapeHtml(text)}</pre>`,
            { skipFailureReport: true },
          ),
      },
      {
        field: 'manualWhatsappSentAt' as const,
        // Manual bookings always use Wasender, independent of WHATSAPP_PROVIDER.
        send: () =>
          this.wasender.sendWhatsApp({
            mobile:
              this.config.get<string>('SPLIT_BOOKING_ADMIN_WHATSAPP') ||
              '+919999224767',
            text,
          }),
      },
    ];
    const [emailSent, whatsappSent] = await Promise.all(
      channels.map(async ({ field, send }) => {
        if (booking[field]) return true;
        const accepted = await send().catch(() => false);
        if (accepted) {
          await this.prisma.splitTicketBooking.update({
            where: { id: booking.id },
            data: { [field]: new Date() },
          });
        }
        return accepted;
      }),
    );
    return { emailSent, whatsappSent };
  }
}
