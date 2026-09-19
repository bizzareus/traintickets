import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import { TripmgtBookingService } from './tripmgt-booking.service';
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

    const bookingRef = this.generateBookingRef();
    const cleanDate = dto.journeyDate.slice(0, 10);
    const totalFareRupees = Math.max(dto.totalFare, 1);

    const initialLogs = [
      {
        timestamp: new Date().toISOString(),
        step: 'CREATED',
        message: `Booking request registered for train ${dto.trainNumber} (${dto.fromStationCode} → ${dto.toStationCode}) on ${cleanDate}`,
      },
    ];

    // Persist booking record in PostgreSQL
    const booking = await this.prisma.splitTicketBooking.create({
      data: {
        bookingRef,
        trainNumber: dto.trainNumber.trim(),
        trainName: dto.trainName?.trim() || null,
        fromStationCode: dto.fromStationCode.trim().toUpperCase(),
        toStationCode: dto.toStationCode.trim().toUpperCase(),
        journeyDate: new Date(cleanDate),
        travelClass: dto.travelClass.trim().toUpperCase(),
        quota: dto.quota?.trim() || 'GN',
        totalFare: totalFareRupees,
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
    let qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`upi://pay?pa=pay@lastberth&pn=LastBerth&am=${totalFareRupees}&tn=${bookingRef}`)}`;
    let upiIntent = `upi://pay?pa=pay@lastberth&pn=LastBerth&am=${totalFareRupees}&tn=${bookingRef}&cu=INR`;
    let gpayIntent = upiIntent.replace(/^upi:/, 'tez:');
    let phonepeIntent = upiIntent.replace(/^upi:\/\/pay/, 'phonepe://pay');

    if (this.razorpay.isConfigured) {
      try {
        const order = await this.razorpay.createOrder({
          amountPaise: totalFareRupees * 100,
          receipt: bookingRef,
          notes: {
            bookingRef,
            trainNumber: dto.trainNumber,
            mobile: dto.contactMobile,
          },
        });
        orderId = order.id;

        const qr = await this.razorpay.createUpiQr({
          amountPaise: totalFareRupees * 100,
          name: 'LastBerth Booking',
          description: `Split tickets for ${bookingRef}`,
          notes: { bookingRef },
        });

        qrImageUrl = qr.imageUrl;

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
      amount: totalFareRupees,
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
      totalFare: booking.totalFare,
      contactMobile: booking.contactMobile,
      contactEmail: booking.contactEmail,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus,
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
  async confirmPayment(bookingRef: string, paymentId?: string) {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });
    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    if (booking.paymentStatus === 'PAID') {
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
        message: `Payment of ₹${booking.totalFare} confirmed successfully. Starting booking fulfillment.`,
      },
    ];

    await this.prisma.splitTicketBooking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        razorpayPaymentId: paymentId || `pay_sim_${Date.now()}`,
        bookingStatus: 'QUEUED',
        automationLogs: updatedLogs as unknown as Prisma.InputJsonValue,
      },
    });

    // Asynchronously dispatch Playwright fulfillment in the background
    void this.dispatchFulfillment(booking.bookingRef);

    return this.getStatus(bookingRef);
  }

  /**
   * Background runner that launches the TripMgt Playwright automation.
   */
  private async dispatchFulfillment(bookingRef: string): Promise<void> {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });
    if (!booking) return;

    try {
      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: { bookingStatus: 'IN_PROGRESS' },
      });

      const passengersData =
        (booking.passengers as Record<string, unknown>) || {};
      const adults =
        (passengersData.adults as CreateSplitBookingDto['passengers']) || [];
      const children =
        (passengersData.children as CreateSplitBookingDto['childPassengers']) ||
        [];
      const legs =
        (booking.legsPayload as unknown as CreateSplitBookingDto['legs']) || [];

      const result = await this.tripmgt.executeBooking(
        {
          bookingRef: booking.bookingRef,
          trainNumber: booking.trainNumber,
          trainName: booking.trainName ?? undefined,
          fromStationCode: booking.fromStationCode,
          toStationCode: booking.toStationCode,
          journeyDate: booking.journeyDate.toISOString().slice(0, 10),
          travelClass: booking.travelClass,
          quota: booking.quota,
          legs,
          passengers: adults,
          childPassengers: children,
          autoUpgrade: booking.autoUpgrade,
          contactMobile: booking.contactMobile,
          contactEmail: booking.contactEmail,
        },
        async (logEntry) => {
          // Push real-time log to database
          const b = await this.prisma.splitTicketBooking.findUnique({
            where: { id: booking.id },
          });
          if (b) {
            const l = Array.isArray(b.automationLogs)
              ? (b.automationLogs as unknown as typeof result.logs)
              : [];
            await this.prisma.splitTicketBooking.update({
              where: { id: booking.id },
              data: {
                automationLogs: [
                  ...l,
                  logEntry,
                ] as unknown as Prisma.InputJsonValue,
              },
            });
          }
        },
      );

      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: result.success ? 'CONFIRMED' : 'FAILED',
          pnrLeg1: result.pnrLeg1 ?? null,
          pnrLeg2: result.pnrLeg2 ?? null,
          bookingError: result.error ?? null,
          completedAt: new Date(),
          automationLogs: result.logs as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error during fulfillment of ${bookingRef}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
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
