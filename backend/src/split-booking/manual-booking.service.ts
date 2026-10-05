import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SplitTicketBooking } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { escapeHtml } from '../notification/notification.helpers';
import { WasenderProvider } from '../notification/whatsapp-providers/wasender.provider';
import { WhatsAppProviderFactory } from '../notification/whatsapp-providers/whatsapp.provider-factory';
import { PrismaService } from '../prisma/prisma.service';
import { bookingDetails, manualBookingMessage } from './split-booking.helpers';
import { bookingPrice } from './split-booking.pricing';

@Injectable()
export class ManualBookingService {
  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly wasender: WasenderProvider,
    private readonly prisma: PrismaService,
    @Optional() private readonly whatsappFactory?: WhatsAppProviderFactory,
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
        send: async () => {
          const mobile =
            this.config.get<string>('SPLIT_BOOKING_ADMIN_WHATSAPP') ||
            '+919999224767';
          // Matches MSG91 `manual_booking_admin`: {{1}} ref, {{2}} train,
          // {{3}} route, {{4}} date, {{5}} class/quota, {{6}} amount,
          // {{7}} customer contact.
          const details = bookingDetails(booking);
          const price = bookingPrice(booking.totalFare, booking.serviceFee);
          if (this.whatsappFactory) {
            const sent = await this.whatsappFactory
              .sendWhatsApp({
                mobile,
                text,
                templateName: 'manual_booking_admin',
                parameters: [
                  { name: 'booking_ref', value: booking.bookingRef },
                  {
                    name: 'train',
                    value: `${booking.trainNumber}${booking.trainName ? ` - ${booking.trainName}` : ''}`,
                  },
                  {
                    name: 'route',
                    value: `${booking.fromStationCode} → ${booking.toStationCode}`,
                  },
                  { name: 'journey_date', value: details.journeyDate },
                  {
                    name: 'class_quota',
                    value: `${booking.travelClass}, ${booking.quota}`,
                  },
                  { name: 'amount', value: String(price.amount) },
                  {
                    name: 'customer',
                    value: `${booking.contactMobile} / ${booking.contactEmail}`,
                  },
                ],
              })
              .catch(() => false);
            if (sent) return true;
            // Fall back to freeform Wasender while the MSG91 template is
            // pending Meta approval or erroring.
            if (this.whatsappFactory.providerName !== 'msg91') return false;
          }
          return this.wasender
            .sendWhatsApp({ mobile, text })
            .catch(() => false);
        },
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
