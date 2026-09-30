import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import { TripmgtBookingService } from './tripmgt-booking.service';
import { validateBookingItinerary } from './split-booking.validation';
import { bookingDetails, bookingPnrFields } from './split-booking.helpers';
import { ManualBookingService } from './manual-booking.service';
import {
  bookingPrice,
  SPLIT_BOOKING_SERVICE_FEE_RUPEES,
} from './split-booking.pricing';
import type {
  CreateSplitBookingDto,
  SplitBookingStatusResponse,
} from './split-booking.types';

@Injectable()
export class SplitBookingService {
  private readonly logger = new Logger(SplitBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayClient,
    private readonly tripmgt: TripmgtBookingService,
    private readonly config: ConfigService,
    private readonly manualBooking: ManualBookingService,
  ) {}

  /**
   * Generates a unique, user-friendly booking reference.
   */
  private generateBookingRef(): string {
    const timePart = Date.now().toString(36).toUpperCase();
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `LB-SB-${timePart}-${randPart}`;
  }

  /**
   * Create a new split-ticket assisted booking request and prepare payment.
   */
  async createBooking(dto: CreateSplitBookingDto) {
    if (
      !dto.trainNumber?.trim() ||
      !dto.fromStationCode?.trim() ||
      !dto.toStationCode?.trim()
    ) {
      throw new BadRequestException(
        'trainNumber, fromStationCode, and toStationCode are required',
      );
    }
    if (!dto.journeyDate?.trim() || !dto.travelClass?.trim()) {
      throw new BadRequestException('journeyDate and travelClass are required');
    }
    if (!dto.passengers || dto.passengers.length === 0) {
      throw new BadRequestException('At least one passenger is required');
    }
    if (dto.passengers.length > 6) {
      throw new BadRequestException(
        'Maximum of 6 passengers allowed per booking',
      );
    }
    if (
      !dto.contactMobile?.trim() ||
      !/^\d{10}$/.test(dto.contactMobile.replace(/\D/g, '').slice(-10))
    ) {
      throw new BadRequestException(
        'A valid 10-digit mobile number is required',
      );
    }
    if (!dto.contactEmail?.trim() || !dto.contactEmail.includes('@')) {
      throw new BadRequestException('A valid email address is required');
    }

    try {
      validateBookingItinerary(dto);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid split itinerary',
      );
    }

    const bookingRef = this.generateBookingRef();
    const cleanDate = dto.journeyDate.slice(0, 10);
    const price = bookingPrice(dto.totalFare, SPLIT_BOOKING_SERVICE_FEE_RUPEES);
    const bookingMode =
      this.config.get<string>('SPLIT_BOOKING_MODE') === 'manual'
        ? 'MANUAL'
        : 'AI';
    const fromStationCode = dto.legs[0].from;
    const toStationCode = dto.legs[dto.legs.length - 1].to;

    const initialLogs = [
      {
        timestamp: new Date().toISOString(),
        step: 'CREATED',
        message: `Booking request registered for train ${dto.trainNumber} (${fromStationCode} → ${toStationCode}) on ${cleanDate}`,
      },
    ];

    // Persist booking record in PostgreSQL
    const booking = await this.prisma.splitTicketBooking.create({
      data: {
        bookingRef,
        bookingMode,
        trainNumber: dto.trainNumber.trim(),
        trainName: dto.trainName?.trim() || null,
        fromStationCode,
        toStationCode,
        journeyDate: new Date(cleanDate),
        travelClass: dto.travelClass.trim().toUpperCase(),
        quota: dto.quota?.trim() || 'GN',
        totalFare: price.totalFare,
        serviceFee: price.serviceFee,
        legsPayload: dto.legs as unknown as Prisma.InputJsonValue,
        passengers: {
          adults: dto.passengers,
          children: dto.childPassengers ?? [],
        } as unknown as Prisma.InputJsonValue,
        contactMobile: dto.contactMobile.trim(),
        contactEmail: dto.contactEmail.trim(),
        autoUpgrade: dto.autoUpgrade !== false,
        paymentStatus: 'PENDING',
        bookingStatus: 'IDLE',
        automationLogs: initialLogs as unknown as Prisma.InputJsonValue,
      },
    });

    // Create payment intent
    let orderId = `order_dev_${bookingRef}`;
    let qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`upi://pay?pa=pay@lastberth&pn=LastBerth&am=${price.amount}&tn=${bookingRef}`)}`;
    let upiIntent = `upi://pay?pa=pay@lastberth&pn=LastBerth&am=${price.amount}&tn=${bookingRef}&cu=INR`;
    let gpayIntent = upiIntent.replace(/^upi:/, 'tez:');
    let phonepeIntent = upiIntent.replace(/^upi:\/\/pay/, 'phonepe://pay');

    if (this.razorpay.isConfigured) {
      try {
        const order = await this.razorpay.createOrder({
          amountPaise: price.amount * 100,
          receipt: bookingRef,
          notes: {
            bookingRef,
            trainNumber: dto.trainNumber,
            mobile: dto.contactMobile,
          },
        });
        orderId = order.id;

        const qr = await this.razorpay.createUpiQr({
          amountPaise: price.amount * 100,
          name: 'LastBerth Booking',
          description: `Split tickets for ${bookingRef}`,
          notes: { bookingRef },
        });

        qrImageUrl = qr.imageUrl;
        const resolved = await this.razorpay.resolveQrIntents(qr.imageUrl);
        if (resolved.intent) {
          upiIntent = resolved.intent;
        }
        if (resolved.apps?.gpayIntent) {
          gpayIntent = resolved.apps.gpayIntent;
        }
        if (resolved.apps?.phonepeIntent) {
          phonepeIntent = resolved.apps.phonepeIntent;
        }

        await this.prisma.splitTicketBooking.update({
          where: { id: booking.id },
          data: { razorpayOrderId: orderId },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to create live Razorpay order for ${bookingRef}; falling back to standard intent: ${err}`,
        );
      }
    }

    return {
      bookingRef,
      bookingMode,
      ...price,
      orderId,
      qrImageUrl,
      upiIntent,
      gpayIntent,
      phonepeIntent,
    };
  }

  /**
   * Retrieves live booking and payment status.
   */
  async getStatus(bookingRef: string): Promise<SplitBookingStatusResponse> {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });

    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    const logs = Array.isArray(booking.automationLogs)
      ? (booking.automationLogs as unknown as Array<{
          timestamp: string;
          step: string;
          message: string;
        }>)
      : [];

    return {
      bookingRef: booking.bookingRef,
      trainNumber: booking.trainNumber,
      trainName: booking.trainName ?? undefined,
      fromStationCode: booking.fromStationCode,
      toStationCode: booking.toStationCode,
      journeyDate: booking.journeyDate.toISOString().slice(0, 10),
      travelClass: booking.travelClass,
      ...bookingPrice(booking.totalFare, booking.serviceFee),
      contactMobile: booking.contactMobile,
      contactEmail: booking.contactEmail,
      bookingMode: booking.bookingMode,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus,
      pnrs: booking.pnrs,
      pnrLeg1: booking.pnrLeg1,
      pnrLeg2: booking.pnrLeg2,
      bookingError: booking.bookingError,
      logs,
      paidAt: booking.paidAt?.toISOString() ?? null,
      completedAt: booking.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Mark payment paid (used by webhook or dev simulation) and trigger background fulfillment.
   */
  async confirmPayment(
    bookingRef: string,
    paymentId?: string,
    capturedPayment?: { amount: number; currency: string; orderId?: string },
  ) {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });
    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    const price = bookingPrice(booking.totalFare, booking.serviceFee);
    if (
      capturedPayment &&
      (capturedPayment.amount !== price.amount * 100 ||
        capturedPayment.currency !== 'INR' ||
        (capturedPayment.orderId &&
          capturedPayment.orderId !== booking.razorpayOrderId))
    ) {
      throw new BadRequestException(
        'Captured payment does not match this booking',
      );
    }

    if (booking.paymentStatus === 'PAID') {
      // A repeated callback can retry a failed manual delivery, but never an AI purchase.
      if (
        booking.bookingMode === 'MANUAL' &&
        booking.bookingStatus === 'MANUAL_PENDING' &&
        (!booking.manualEmailSentAt || !booking.manualWhatsappSentAt)
      ) {
        this.startFulfillment(bookingRef);
      }
      return this.getStatus(bookingRef);
    }

    const currentLogs = Array.isArray(booking.automationLogs)
      ? (booking.automationLogs as unknown as Array<{
          timestamp: string;
          step: string;
          message: string;
        }>)
      : [];

    const updatedLogs = [
      ...currentLogs,
      {
        timestamp: new Date().toISOString(),
        step: 'PAYMENT_RECEIVED',
        message: `Payment of ₹${price.amount} confirmed (tickets ₹${price.totalFare} + service fee ₹${price.serviceFee}). Starting booking fulfillment.`,
      },
    ];

    const claimed = await this.prisma.splitTicketBooking.updateMany({
      where: {
        id: booking.id,
        paymentStatus: 'PENDING',
        bookingStatus: 'IDLE',
      },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        razorpayPaymentId: paymentId || `pay_sim_${Date.now()}`,
        bookingStatus: 'QUEUED',
        automationLogs: updatedLogs as unknown as Prisma.InputJsonValue,
      },
    });

    // Only the winning payment transition may enqueue a reservation.
    if (claimed.count === 1) {
      this.startFulfillment(bookingRef);
    }

    return this.getStatus(bookingRef);
  }

  /**
   * Dispatches the fulfillment mode selected when the booking was created.
   */
  private startFulfillment(bookingRef: string): void {
    void this.dispatchFulfillment(bookingRef).catch((error: unknown) => {
      this.logger.error(
        `Could not dispatch booking ${bookingRef}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  private async dispatchFulfillment(bookingRef: string): Promise<void> {
    let booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });
    if (!booking) return;

    let ownsFulfillment = false;
    try {
      const claimed = await this.prisma.splitTicketBooking.updateMany({
        where: {
          id: booking.id,
          paymentStatus: 'PAID',
          bookingStatus:
            booking.bookingMode === 'MANUAL'
              ? { in: ['QUEUED', 'MANUAL_PENDING'] }
              : 'QUEUED',
          pnrLeg1: null,
          pnrLeg2: null,
          pnrs: { isEmpty: true },
        },
        data: { bookingStatus: 'IN_PROGRESS' },
      });
      if (claimed.count !== 1) return;
      ownsFulfillment = true;
      // A previous manual handoff may have finished between reading and claiming.
      // Refresh delivery receipts under our claim before deciding what to resend.
      booking = await this.prisma.splitTicketBooking.findUnique({
        where: { bookingRef },
      });
      if (!booking) return;
      const bookingId = booking.id;
      const pnrs = [...booking.pnrs];

      const logs = Array.isArray(booking.automationLogs)
        ? ([
            ...booking.automationLogs,
          ] as unknown as SplitBookingStatusResponse['logs'])
        : [];

      const onLog = async (
        logEntry: SplitBookingStatusResponse['logs'][number],
      ) => {
        logs.push(logEntry);
        await this.prisma.splitTicketBooking.update({
          where: { id: bookingId },
          data: { automationLogs: logs as unknown as Prisma.InputJsonValue },
        });
      };

      if (booking.bookingMode === 'MANUAL') {
        const delivery = await this.manualBooking.notify(booking);
        await onLog({
          timestamp: new Date().toISOString(),
          step: 'MANUAL_HANDOFF',
          message: `Manual booking requested. Email: ${delivery.emailSent ? 'sent' : 'pending'}; WhatsApp: ${delivery.whatsappSent ? 'sent' : 'pending'}. Awaiting reservation by the booking team.`,
        });
        await this.prisma.splitTicketBooking.update({
          where: { id: booking.id },
          data: {
            bookingStatus: 'MANUAL_PENDING',
            bookingError:
              delivery.emailSent && delivery.whatsappSent
                ? null
                : 'Your booking request is saved, but a notification could not be delivered. Contact support with your booking reference.',
          },
        });
        return;
      }

      const result = await this.tripmgt.executeBooking(
        bookingDetails(booking),
        {
          onLog,
          onPnr: async (legIndex, pnr) => {
            pnrs[legIndex] = pnr;
            await this.prisma.splitTicketBooking.update({
              where: { id: bookingId },
              data: bookingPnrFields(pnrs),
            });
          },
        },
      );

      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: result.success ? 'CONFIRMED' : 'FAILED',
          ...bookingPnrFields(result.pnrs),
          bookingError: result.error ?? null,
          completedAt: new Date(),
          automationLogs: logs as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error during fulfillment of ${bookingRef}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (!ownsFulfillment || !booking) return;
      await this.prisma.splitTicketBooking
        .update({
          where: { id: booking.id },
          data: {
            bookingStatus: 'FAILED',
            bookingError: msg,
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }
}
