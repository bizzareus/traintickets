import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CancellationRequestStatus,
  Prisma,
  SplitBookingFulfillmentStatus,
  SplitBookingPaymentStatus,
  SplitTicketBooking,
} from '@prisma/client';
import { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import { isURL } from 'class-validator';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMuzoboxClient,
  muzoboxAuthHeaders,
  type MuzoboxPaymentLink,
  type MuzoboxPaymentStatus,
} from '../common/muzobox-client';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import { TripmgtBookingService } from './tripmgt-booking.service';
import { validateBookingItinerary } from './split-booking.validation';
import { bookingDetails, bookingPnrFields } from './split-booking.helpers';
import { ManualBookingService } from './manual-booking.service';
import { NotificationService } from '../notification/notification.service';
import { WasenderProvider } from '../notification/whatsapp-providers/wasender.provider';
import { escapeHtml } from '../notification/notification.helpers';
import { PostHogAnalyticsService } from '../common/posthog-analytics.service';
import { S3StorageService } from '../common/s3-storage.service';
import {
  bookingPrice,
  getSplitBookingServiceFeeRate,
} from './split-booking.pricing';
import type {
  CreateSplitBookingDto,
  SplitBookingStatusResponse,
} from './split-booking.types';

@Injectable()
export class SplitBookingService {
  private readonly logger = new Logger(SplitBookingService.name);
  private readonly muzoboxClient: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripmgt: TripmgtBookingService,
    private readonly config: ConfigService,
    private readonly manualBooking: ManualBookingService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly wasender?: WasenderProvider,
    @Optional() private readonly posthog?: PostHogAnalyticsService,
    @Optional() private readonly s3Storage?: S3StorageService,
    @Optional() private readonly razorpay?: RazorpayClient,
  ) {
    this.muzoboxClient = createMuzoboxClient(config);
  }

  /**
   * Generates a unique, user-friendly booking reference in the format LB-{5 random characters}.
   */
  private generateBookingRef(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(5);
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return `LB-${code}`;
  }

  private getServiceFeeRate(): number {
    const configured = this.config.get<string | number>(
      'SPLIT_BOOKING_SERVICE_FEE_RATE',
    );
    if (configured !== undefined && configured !== '') {
      const parsed = Number(configured);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return getSplitBookingServiceFeeRate();
  }

  /**
   * Create a new split-ticket assisted booking request and prepare payment.
   */
  async createBooking(dto: CreateSplitBookingDto) {
    if (
      this.config.get<string>('SPLIT_BOOKING_MODE') === 'disabled' ||
      this.config.get<string>('SPLIT_BOOKING_ENABLED') === 'false' ||
      this.config.get<boolean>('SPLIT_BOOKING_ENABLED') === false
    ) {
      throw new ServiceUnavailableException(
        'Assisted booking is currently disabled',
      );
    }

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
    const rate = this.getServiceFeeRate();
    const price = bookingPrice(dto.totalFare, undefined, rate);
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

    try {
      const apiUrl = this.config
        .get<string>('API_URL')
        ?.trim()
        .replace(/\/$/, '');
      const { data } = await this.muzoboxClient.post<MuzoboxPaymentLink>(
        'proxy-payments/create-link',
        {
          amount: price.amount,
          referenceId: bookingRef,
          redirectUri: `split-booking/payment-complete?ref=${encodeURIComponent(bookingRef)}`,
          // Hosted Muzobox cannot call localhost; local checkout uses polling.
          callbackUrl: isURL(apiUrl ?? '', { require_protocol: true })
            ? `${apiUrl}/api/split-booking/muzobox-callback`
            : undefined,
          description: `Train ${dto.trainNumber} ${fromStationCode}->${toStationCode} ${cleanDate} (tickets + payment service charge)`,
          customerName: dto.passengers[0].name.trim(),
          customerEmail: dto.contactEmail.trim(),
          customerMobile: dto.contactMobile.trim(),
        },
        { headers: muzoboxAuthHeaders(this.config) },
      );
      if (
        !data?.id ||
        !data.payUrl ||
        data.amount !== price.amount ||
        data.referenceId !== bookingRef
      ) {
        throw new Error('Muzobox returned an invalid payment link');
      }
      const payUrl = new URL(data.payUrl, 'https://muzobox.com');
      if (!['https:', 'http:'].includes(payUrl.protocol)) {
        throw new Error('Muzobox returned an invalid payment URL');
      }
      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: {
          muzoboxPaymentId: data.id,
          payUrl: payUrl.href,
          razorpayOrderId: data.razorpayOrderId ?? null,
        },
      });
      this.posthog?.capture(
        'split_booking_created',
        {
          booking_ref: bookingRef,
          booking_mode: bookingMode,
          train_number: dto.trainNumber.trim(),
          train_name: dto.trainName?.trim() || null,
          from_station: fromStationCode,
          to_station: toStationCode,
          journey_date: cleanDate,
          travel_class: dto.travelClass.trim().toUpperCase(),
          total_fare: price.totalFare,
          service_fee: price.serviceFee,
          amount: price.amount,
          passenger_count: dto.passengers.length,
          leg_count: dto.legs.length,
        },
        bookingRef,
      );
      return { bookingRef, bookingMode, ...price, payUrl: payUrl.href };
    } catch (error) {
      this.posthog?.capture(
        'split_booking_intent_failed',
        {
          booking_ref: bookingRef,
          train_number: dto.trainNumber.trim(),
          error: error instanceof Error ? error.message : String(error),
        },
        bookingRef,
      );
      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: { paymentStatus: 'FAILED' },
      });
      this.logger.error(
        `Muzobox checkout failed for ${bookingRef}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Payment system is currently unavailable. Please try again later.',
      );
    }
  }

  /**
   * Retrieves live booking and payment status.
   */
  async getStatus(bookingRef: string): Promise<SplitBookingStatusResponse> {
    const booking = await this.findBooking(bookingRef);
    if (booking.paymentStatus === 'PENDING' && booking.muzoboxPaymentId) {
      let remote: MuzoboxPaymentStatus;
      try {
        const response = await this.muzoboxClient.get<MuzoboxPaymentStatus>(
          `proxy-payments/${encodeURIComponent(booking.muzoboxPaymentId)}/status`,
          { headers: muzoboxAuthHeaders(this.config) },
        );
        remote = response.data;
      } catch (error) {
        this.logger.warn(
          `Muzobox status check failed for ${bookingRef}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return this.toStatusResponse(booking);
      }
      const price = bookingPrice(booking.totalFare, booking.serviceFee);
      if (
        remote?.referenceId !== bookingRef ||
        remote.amount !== price.amount ||
        (booking.razorpayOrderId &&
          remote.razorpayOrderId !== booking.razorpayOrderId)
      ) {
        this.logger.warn(
          `Muzobox payment does not match booking ${bookingRef}`,
        );
        return this.toStatusResponse(booking);
      }
      if (remote.status === 'paid' && remote.razorpayPaymentId) {
        return this.confirmPayment(bookingRef, remote.razorpayPaymentId, {
          amount: remote.amount * 100,
          currency: 'INR',
          orderId: booking.razorpayOrderId ?? undefined,
        });
      }
      if (remote.status === 'failed') {
        this.posthog?.capture(
          'split_booking_payment_failed',
          {
            booking_ref: bookingRef,
            train_number: booking.trainNumber,
          },
          bookingRef,
        );
        await this.prisma.splitTicketBooking.updateMany({
          where: {
            id: booking.id,
            paymentStatus: 'PENDING',
            bookingStatus: 'IDLE',
          },
          data: { paymentStatus: 'FAILED' },
        });
        return this.toStatusResponse(await this.findBooking(bookingRef));
      }
    }
    return this.toStatusResponse(booking);
  }

  /** Callback data is only a hint: re-read the stored payment from Muzobox. */
  async handleMuzoboxCallback(paymentId: string, bookingRef: string) {
    const booking = await this.findBooking(bookingRef);
    if (booking.muzoboxPaymentId !== paymentId) {
      throw new BadRequestException('Payment does not match this booking');
    }
    await this.getStatus(bookingRef);
    return { received: true };
  }

  private async findBooking(bookingRef: string): Promise<SplitTicketBooking> {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });

    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    return booking;
  }

  private toStatusResponse(
    booking: SplitTicketBooking,
  ): SplitBookingStatusResponse {
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
      payUrl: booking.payUrl,
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
    const booking = await this.findBooking(bookingRef);

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
      return this.toStatusResponse(booking);
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
        message: `Payment of ₹${price.amount} confirmed (tickets ₹${price.totalFare} + payment service charge ₹${price.serviceFee}). Starting booking fulfillment.`,
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
      this.posthog?.capture(
        'split_booking_paid',
        {
          booking_ref: bookingRef,
          payment_id: paymentId || 'simulated',
          train_number: booking.trainNumber,
          from_station: booking.fromStationCode,
          to_station: booking.toStationCode,
          amount: price.amount,
          total_fare: price.totalFare,
          service_fee: price.serviceFee,
        },
        bookingRef,
      );
      this.startFulfillment(bookingRef);
      void this.sendCustomerPaymentReceivedNotification(booking.id).catch(
        (err) =>
          this.logger.error(
            `Failed to send customer payment notification for ${bookingRef}: ${err instanceof Error ? err.message : String(err)}`,
          ),
      );
    }

    return this.toStatusResponse(await this.findBooking(bookingRef));
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
        this.posthog?.capture(
          'split_booking_manual_queued',
          {
            booking_ref: bookingRef,
            train_number: booking.trainNumber,
            email_sent: delivery.emailSent,
            whatsapp_sent: delivery.whatsappSent,
          },
          bookingRef,
        );
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

      this.posthog?.capture(
        result.success ? 'split_booking_confirmed' : 'split_booking_failed',
        {
          booking_ref: bookingRef,
          train_number: booking.trainNumber,
          leg_count: pnrs.length,
          pnr_count: result.pnrs.filter(Boolean).length,
          error: result.error ?? null,
        },
        bookingRef,
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
      this.posthog?.capture(
        'split_booking_failed',
        {
          booking_ref: bookingRef,
          train_number: booking?.trainNumber,
          error: msg,
        },
        bookingRef,
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

  // --- Admin portal operations ------------------------------------------------

  async adminListBookings() {
    const bookings = await this.prisma.splitTicketBooking.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bookingRef: true,
        trainNumber: true,
        trainName: true,
        fromStationCode: true,
        toStationCode: true,
        journeyDate: true,
        travelClass: true,
        quota: true,
        totalFare: true,
        serviceFee: true,
        legsPayload: true,
        passengers: true,
        contactMobile: true,
        contactEmail: true,
        autoUpgrade: true,
        paymentStatus: true,
        muzoboxPaymentId: true,
        payUrl: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        paidAt: true,
        bookingMode: true,
        bookingStatus: true,
        manualEmailSentAt: true,
        manualWhatsappSentAt: true,
        customerEmailSentAt: true,
        customerWhatsappSentAt: true,
        pnrs: true,
        pnrLeg1: true,
        pnrLeg2: true,
        ticketPdfFilename: true,
        ticketPdfContentType: true,
        ticketPdfUploadedAt: true,
        ticketPdfS3Key: true,
        bookingError: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        automationLogs: true,
      },
    });

    return {
      entries: bookings.map((b) => ({
        ...b,
        hasTicketPdf: Boolean(b.ticketPdfUploadedAt || b.ticketPdfS3Key),
        journeyDate: b.journeyDate.toISOString().slice(0, 10),
      })),
    };
  }

  async adminUpdateBooking(
    id: string,
    updates: {
      bookingStatus?: SplitBookingFulfillmentStatus;
      paymentStatus?: SplitBookingPaymentStatus;
      razorpayPaymentId?: string;
      pnrs?: string[];
      pnrLeg1?: string;
      pnrLeg2?: string;
      bookingError?: string | null;
    },
  ) {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { id },
    });
    if (!booking) {
      throw new NotFoundException(`Booking "${id}" not found`);
    }

    const data: Prisma.SplitTicketBookingUpdateInput = {};

    if (updates.bookingStatus) {
      data.bookingStatus = updates.bookingStatus;
      if (updates.bookingStatus === 'CONFIRMED' && !booking.completedAt) {
        data.completedAt = new Date();
      }
    }

    if (updates.paymentStatus) {
      data.paymentStatus = updates.paymentStatus;
      if (updates.paymentStatus === 'PAID' && !booking.paidAt) {
        data.paidAt = new Date();
      }
    }

    if (updates.razorpayPaymentId !== undefined) {
      data.razorpayPaymentId = updates.razorpayPaymentId.trim() || null;
    }

    if (updates.bookingError !== undefined) {
      data.bookingError = updates.bookingError;
    }

    const currentPnrs = [...booking.pnrs];
    if (Array.isArray(updates.pnrs)) {
      currentPnrs.splice(
        0,
        currentPnrs.length,
        ...updates.pnrs.map((p) => p.trim()),
      );
    }
    if (updates.pnrLeg1 !== undefined) {
      currentPnrs[0] = updates.pnrLeg1.trim();
    }
    if (updates.pnrLeg2 !== undefined) {
      currentPnrs[1] = updates.pnrLeg2.trim();
    }

    if (
      updates.pnrs !== undefined ||
      updates.pnrLeg1 !== undefined ||
      updates.pnrLeg2 !== undefined
    ) {
      Object.assign(data, bookingPnrFields(currentPnrs));
    }

    const updated = await this.prisma.splitTicketBooking.update({
      where: { id },
      data,
    });

    this.posthog?.capture(
      'split_booking_admin_updated',
      {
        booking_ref: updated.bookingRef,
        booking_status: updated.bookingStatus,
        payment_status: updated.paymentStatus,
        previous_booking_status: booking.bookingStatus,
        previous_payment_status: booking.paymentStatus,
      },
      updated.bookingRef,
    );

    if (updated.paymentStatus === 'PAID' && booking.paymentStatus !== 'PAID') {
      void this.sendCustomerPaymentReceivedNotification(updated.id).catch(
        (err) =>
          this.logger.error(
            `Failed to send customer payment notification for ${updated.bookingRef}: ${err instanceof Error ? err.message : String(err)}`,
          ),
      );
    }

    return { ok: true, booking: updated };
  }

  async adminUploadTicketPdf(
    id: string,
    file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    body?: { base64?: string; filename?: string; contentType?: string },
  ) {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { id },
    });
    if (!booking) {
      throw new NotFoundException(`Booking "${id}" not found`);
    }

    let buffer: Buffer;
    const filename =
      file?.originalname ||
      body?.filename ||
      `ticket-${booking.bookingRef}.pdf`;
    const contentType =
      file?.mimetype || body?.contentType || 'application/pdf';

    if (file?.buffer) {
      buffer = file.buffer;
    } else if (body?.base64) {
      const cleanBase64 = body.base64
        .replace(/^data:application\/pdf;base64,/, '')
        .trim();
      buffer = Buffer.from(cleanBase64, 'base64');
    } else {
      throw new BadRequestException('A PDF file or base64 data is required');
    }

    let s3Key: string | null = null;
    if (this.s3Storage) {
      s3Key = await this.s3Storage.uploadTicketPdf(
        booking.bookingRef,
        buffer,
        filename,
        contentType,
      );
    }

    await this.prisma.splitTicketBooking.update({
      where: { id },
      data: {
        ticketPdfS3Key: s3Key,
        ticketPdfFilename: filename,
        ticketPdfContentType: contentType,
        ticketPdfUploadedAt: new Date(),
        ticketPdf: s3Key ? null : new Uint8Array(buffer),
      },
    });

    return {
      ok: true,
      filename,
      s3Key,
      uploadedAt: new Date().toISOString(),
    };
  }

  async getTicketPdf(
    bookingRefOrId: string,
  ): Promise<
    | { redirectUrl: string; filename?: string; s3Key?: string }
    | { buffer: Uint8Array; filename: string; contentType: string }
  > {
    const booking = await this.prisma.splitTicketBooking.findFirst({
      where: {
        OR: [{ bookingRef: bookingRefOrId }, { id: bookingRefOrId }],
      },
      select: {
        bookingRef: true,
        ticketPdf: true,
        ticketPdfS3Key: true,
        ticketPdfFilename: true,
        ticketPdfContentType: true,
      },
    });

    if (!booking || (!booking.ticketPdfS3Key && !booking.ticketPdf)) {
      throw new NotFoundException('Ticket PDF not found');
    }

    const filename =
      booking.ticketPdfFilename || `ticket-${booking.bookingRef}.pdf`;

    if (booking.ticketPdfS3Key && this.s3Storage) {
      const redirectUrl = await this.s3Storage.getSignedTicketPdfUrl(
        booking.ticketPdfS3Key,
        filename,
      );
      return { redirectUrl, filename, s3Key: booking.ticketPdfS3Key };
    }

    if (booking.ticketPdf) {
      return {
        buffer: booking.ticketPdf,
        filename,
        contentType: booking.ticketPdfContentType || 'application/pdf',
      };
    }

    throw new NotFoundException('Ticket PDF not found');
  }

  async adminNotifyCustomer(
    id: string,
    options: {
      channel?: 'email' | 'whatsapp' | 'both';
      message?: string;
      pnrLeg1?: string;
      pnrLeg2?: string;
      pnrs?: string[];
      pdf?: {
        base64: string;
        filename?: string;
        contentType?: string;
      };
    },
  ) {
    if (
      options.pnrLeg1 !== undefined ||
      options.pnrLeg2 !== undefined ||
      options.pnrs !== undefined
    ) {
      const existing = await this.prisma.splitTicketBooking.findUnique({
        where: { id },
        select: { bookingStatus: true },
      });
      const autoConfirm =
        existing &&
        (existing.bookingStatus === 'MANUAL_PENDING' ||
          existing.bookingStatus === 'IDLE');
      await this.adminUpdateBooking(id, {
        pnrLeg1: options.pnrLeg1,
        pnrLeg2: options.pnrLeg2,
        pnrs: options.pnrs,
        bookingStatus: autoConfirm ? 'CONFIRMED' : undefined,
      });
    }

    if (options.pdf?.base64) {
      await this.adminUploadTicketPdf(id, undefined, options.pdf);
    }

    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { id },
    });
    if (!booking) {
      throw new NotFoundException(`Booking "${id}" not found`);
    }

    const channel = options.channel || 'both';
    const details = bookingDetails(booking);
    const journeyDateStr = booking.journeyDate.toISOString().slice(0, 10);
    const apiUrl =
      this.config.get<string>('API_URL') || 'https://api-v2.lastberth.com';

    const hasPdf = Boolean(
      booking.ticketPdfUploadedAt ||
      booking.ticketPdfS3Key ||
      booking.ticketPdf,
    );
    const pdfUrl = hasPdf
      ? `${apiUrl}/api/split-booking/ticket-pdf/${booking.bookingRef}`
      : null;

    const legPnrs = details.legs.map((leg, i) => {
      const pnr =
        booking.pnrs[i] ||
        (i === 0 ? booking.pnrLeg1 : i === 1 ? booking.pnrLeg2 : null) ||
        'Confirmed';
      return {
        step: `Leg ${i + 1}`,
        route: `${leg.from} → ${leg.to}`,
        travelClass: leg.travelClass,
        boardingDate: leg.boardingDate,
        departureTime: leg.departureTime,
        pnr,
      };
    });

    let emailSent = false;
    let whatsappSent = false;

    // Send customer email if requested
    if (channel === 'email' || channel === 'both') {
      if (this.notifications && booking.contactEmail) {
        const subject = `Confirmed: Tickets for Train ${booking.trainNumber} (${booking.bookingRef})`;
        const pnrListHtml = legPnrs
          .map(
            (l) => `
            <div style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
              <div style="font-weight: 600; color: #1e293b;">${escapeHtml(l.step)}: ${escapeHtml(l.route)} (${escapeHtml(l.travelClass)})</div>
              <div style="font-size: 13px; color: #64748b;">Boarding: ${escapeHtml(l.boardingDate)}${l.departureTime ? ` at ${escapeHtml(l.departureTime)}` : ''}</div>
              <div style="font-size: 14px; margin-top: 4px;"><span style="color: #059669; font-weight: bold;">PNR:</span> <strong style="font-family: monospace; letter-spacing: 1px; color: #0f172a;">${escapeHtml(l.pnr)}</strong></div>
            </div>`,
          )
          .join('');

        const passengerListHtml = details.passengers
          .map(
            (p) =>
              `<li style="margin-bottom: 4px;">${escapeHtml(p.name)} (${escapeHtml(p.gender)}, Age ${p.age}${p.berthPreference ? ` - ${escapeHtml(p.berthPreference)}` : ''})</li>`,
          )
          .join('');

        const pdfDownloadHtml = pdfUrl
          ? `<div style="text-align: center; margin: 24px 0;">
              <a href="${pdfUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                Download Confirmed Ticket PDF
              </a>
            </div>`
          : '';

        const customNoteHtml = options.message
          ? `<div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px; margin: 16px 0; font-size: 13px; color: #334155;">
              <strong>Note from Booking Team:</strong><br/>
              ${escapeHtml(options.message)}
            </div>`
          : '';

        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
            <div style="background: #2563eb; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Ticket Confirmation</h1>
              <p style="color: #dbeafe; margin: 6px 0 0 0; font-size: 14px;">Booking Ref: ${escapeHtml(booking.bookingRef)}</p>
            </div>
            <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background: white;">
              <p style="font-size: 16px; margin-top: 0;">Dear Passenger,</p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                Great news! Your ticket reservation for <strong>Train ${escapeHtml(booking.trainNumber)} ${escapeHtml(booking.trainName || '')}</strong> from <strong>${escapeHtml(booking.fromStationCode)}</strong> to <strong>${escapeHtml(booking.toStationCode)}</strong> on <strong>${escapeHtml(journeyDateStr)}</strong> has been confirmed.
              </p>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <h3 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Confirmed PNR Details</h3>
                ${pnrListHtml}
              </div>

              <div style="margin: 16px 0;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #475569;">Passengers:</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155;">
                  ${passengerListHtml}
                </ul>
              </div>

              ${pdfDownloadHtml}
              ${customNoteHtml}

              <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; line-height: 1.5;">
                Need assistance? Contact LastBerth support at <a href="mailto:support@lastberth.com" style="color: #2563eb;">support@lastberth.com</a> or WhatsApp +91 99992 24767.<br/>
                Have a safe and comfortable journey!
              </p>
            </div>
          </div>`;

        emailSent = await this.notifications
          .sendEmail(booking.contactEmail, subject, html, {
            skipFailureReport: true,
          })
          .catch(() => false);

        if (emailSent) {
          await this.prisma.splitTicketBooking.update({
            where: { id },
            data: { customerEmailSentAt: new Date() },
          });
        }
      }
    }

    // Send customer WhatsApp if requested
    if (channel === 'whatsapp' || channel === 'both') {
      if (this.wasender && booking.contactMobile) {
        const pnrListText = legPnrs
          .map(
            (l) => `• *${l.step}* (${l.route} - ${l.travelClass}): *${l.pnr}*`,
          )
          .join('\n');

        const passengerListText = details.passengers
          .map((p) => `• ${p.name} (${p.gender}, Age ${p.age})`)
          .join('\n');

        const pdfText = pdfUrl ? `\n*Download Ticket PDF:*\n${pdfUrl}\n` : '';
        const noteText = options.message
          ? `\n*Note from Booking Team:*\n${options.message}\n`
          : '';

        const whatsappText = `*Confirmed: Ticket Reservation for Train ${booking.trainNumber}*
Booking Ref: ${booking.bookingRef}
Train: ${booking.trainNumber} ${booking.trainName || ''}
Route: ${booking.fromStationCode} → ${booking.toStationCode}
Date: ${journeyDateStr}

*Confirmed PNR Details:*
${pnrListText}

*Passengers:*
${passengerListText}
${pdfText}${noteText}
Thank you for choosing LastBerth! Have a safe and pleasant journey.`;

        whatsappSent = await this.wasender
          .sendWhatsApp({
            mobile: booking.contactMobile,
            text: whatsappText,
          })
          .catch(() => false);

        if (whatsappSent) {
          await this.prisma.splitTicketBooking.update({
            where: { id },
            data: { customerWhatsappSentAt: new Date() },
          });
        }
      }
    }

    this.posthog?.capture(
      'split_booking_customer_notified',
      {
        booking_ref: booking.bookingRef,
        channel,
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
        has_pdf: Boolean(hasPdf || options.pdf?.base64),
        pnr_count: legPnrs.filter((l) => l.pnr && l.pnr !== 'Confirmed').length,
      },
      booking.bookingRef,
    );

    return {
      ok: true,
      emailSent,
      whatsappSent,
      customerEmail: booking.contactEmail,
      customerMobile: booking.contactMobile,
    };
  }

  /**
   * Sends customer notification (Email & WhatsApp) when payment is confirmed.
   */
  async sendCustomerPaymentReceivedNotification(
    bookingId: string,
  ): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking || booking.paymentStatus !== 'PAID') {
      return { emailSent: false, whatsappSent: false };
    }

    const needsEmail =
      !booking.customerPaymentEmailSentAt && Boolean(booking.contactEmail);
    const needsWhatsapp =
      !booking.customerPaymentWhatsappSentAt && Boolean(booking.contactMobile);

    if (!needsEmail && !needsWhatsapp) {
      return { emailSent: false, whatsappSent: false };
    }

    const journeyDateStr = booking.journeyDate.toISOString().slice(0, 10);
    const price = bookingPrice(booking.totalFare, booking.serviceFee);
    let emailSent = false;
    let whatsappSent = false;

    if (needsEmail && this.notifications && booking.contactEmail) {
      const subject = `Payment Received — Booking Ref: ${booking.bookingRef} (Train ${booking.trainNumber})`;
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: #0f172a; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Payment Confirmed</h1>
            <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 14px;">Booking Ref: <strong style="color: #38bdf8;">${escapeHtml(booking.bookingRef)}</strong></p>
          </div>
          <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background: white;">
            <p style="font-size: 15px; margin-top: 0; color: #334155;">Dear Passenger,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              We have received your payment of <strong>₹${price.amount}</strong> for <strong>Train ${escapeHtml(booking.trainNumber)} ${escapeHtml(booking.trainName || '')}</strong> (${escapeHtml(booking.fromStationCode)} → ${escapeHtml(booking.toStationCode)}) on <strong>${escapeHtml(journeyDateStr)}</strong>.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Booking Information</h3>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Booking Reference:</strong> <span style="font-family: monospace; font-size: 14px; font-weight: bold; color: #0f172a;">${escapeHtml(booking.bookingRef)}</span></p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Train:</strong> ${escapeHtml(booking.trainNumber)} ${escapeHtml(booking.trainName || '')}</p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Route:</strong> ${escapeHtml(booking.fromStationCode)} → ${escapeHtml(booking.toStationCode)}</p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Journey Date:</strong> ${escapeHtml(journeyDateStr)}</p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Amount Paid:</strong> ₹${price.amount} (tickets ₹${price.totalFare} + payment service charge ₹${price.serviceFee})</p>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              Your ticket reservation is in progress. Once confirmed, you will receive another update with your confirmed PNR details and ticket PDF.
            </p>
            <div style="margin: 20px 0; padding: 12px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe; font-size: 13px; color: #1e40af;">
              <strong>Need to cancel?</strong> For cancellations, please visit <a href="https://v2.lastberth.com/cancel-booking?ref=${encodeURIComponent(booking.bookingRef)}" style="color: #2563eb; text-decoration: underline; font-weight: 600;">Cancel Booking</a> anytime using your booking reference and mobile number.
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; line-height: 1.5;">
              Need assistance? Contact LastBerth support at <a href="mailto:support@lastberth.com" style="color: #2563eb;">support@lastberth.com</a> or WhatsApp +91 99992 24767.
            </p>
          </div>
        </div>`;

      emailSent = await this.notifications
        .sendEmail(booking.contactEmail, subject, html, {
          skipFailureReport: true,
        })
        .catch(() => false);
    }

    if (needsWhatsapp && this.wasender && booking.contactMobile) {
      const whatsappText = `*Payment Received — LastBerth*
Booking Ref: *${booking.bookingRef}*
Train: ${booking.trainNumber} ${booking.trainName || ''}
Route: ${booking.fromStationCode} → ${booking.toStationCode}
Date: ${journeyDateStr}
Amount Paid: ₹${price.amount}

We have received your payment! Your ticket reservation is currently in progress. We will send your confirmed PNR details and ticket PDF as soon as issued.

*For cancellations, please click here:*
https://v2.lastberth.com/cancel-booking?ref=${encodeURIComponent(booking.bookingRef)}

Need help? Contact us on WhatsApp at +91 99992 24767.`;

      whatsappSent = await this.wasender
        .sendWhatsApp({
          mobile: booking.contactMobile,
          text: whatsappText,
        })
        .catch(() => false);
    }

    const updates: Prisma.SplitTicketBookingUpdateInput = {};
    if (emailSent) updates.customerPaymentEmailSentAt = new Date();
    if (whatsappSent) updates.customerPaymentWhatsappSentAt = new Date();

    if (Object.keys(updates).length > 0) {
      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: updates,
      });
    }

    this.posthog?.capture(
      'split_booking_customer_payment_notified',
      {
        booking_ref: booking.bookingRef,
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
      },
      booking.bookingRef,
    );

    return { emailSent, whatsappSent };
  }

  /**
   * Looks up a booking by reference and mobile number for cancellation.
   */
  async lookupBookingForCancellation(bookingRef: string, mobile: string) {
    const cleanRef = bookingRef.trim().toUpperCase();
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

    if (!cleanRef) {
      throw new BadRequestException('Booking reference is required');
    }
    if (cleanMobile.length !== 10) {
      throw new BadRequestException(
        'A valid 10-digit mobile number is required',
      );
    }

    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef: cleanRef },
    });

    if (!booking) {
      throw new NotFoundException('No booking found with this reference');
    }

    const bookingMobileDigits = booking.contactMobile
      .replace(/\D/g, '')
      .slice(-10);
    if (bookingMobileDigits !== cleanMobile) {
      throw new BadRequestException(
        'Mobile number does not match the contact number on this booking',
      );
    }

    const existingCancellation =
      await this.prisma.bookingCancellationRequest.findFirst({
        where: {
          bookingId: booking.id,
          status: { in: ['PENDING', 'PROCESSED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

    const price = bookingPrice(booking.totalFare, booking.serviceFee);

    return {
      bookingRef: booking.bookingRef,
      trainNumber: booking.trainNumber,
      trainName: booking.trainName,
      fromStationCode: booking.fromStationCode,
      toStationCode: booking.toStationCode,
      journeyDate: booking.journeyDate.toISOString().slice(0, 10),
      travelClass: booking.travelClass,
      quota: booking.quota,
      ...price,
      passengers: booking.passengers,
      legsPayload: booking.legsPayload,
      bookingStatus: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
      pnrs: booking.pnrs,
      pnrLeg1: booking.pnrLeg1,
      pnrLeg2: booking.pnrLeg2,
      createdAt: booking.createdAt.toISOString(),
      existingCancellation: existingCancellation
        ? {
            id: existingCancellation.id,
            status: existingCancellation.status,
            createdAt: existingCancellation.createdAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Records a cancellation request and notifies admin via Email & WhatsApp.
   */
  async createCancellationRequest(
    bookingRef: string,
    mobile: string,
    reason?: string,
  ) {
    const cleanRef = bookingRef.trim().toUpperCase();
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

    if (!cleanRef) {
      throw new BadRequestException('Booking reference is required');
    }
    if (cleanMobile.length !== 10) {
      throw new BadRequestException(
        'A valid 10-digit mobile number is required',
      );
    }

    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef: cleanRef },
    });

    if (!booking) {
      throw new NotFoundException('No booking found with this reference');
    }

    const bookingMobileDigits = booking.contactMobile
      .replace(/\D/g, '')
      .slice(-10);
    if (bookingMobileDigits !== cleanMobile) {
      throw new BadRequestException(
        'Mobile number does not match the contact number on this booking',
      );
    }

    const pending = await this.prisma.bookingCancellationRequest.findFirst({
      where: {
        bookingId: booking.id,
        status: 'PENDING',
      },
    });

    if (pending) {
      throw new BadRequestException(
        'A cancellation request is already pending review for this booking',
      );
    }

    const request = await this.prisma.bookingCancellationRequest.create({
      data: {
        bookingId: booking.id,
        bookingRef: booking.bookingRef,
        mobile: cleanMobile,
        reason: reason?.trim() || null,
        status: 'PENDING',
      },
    });

    const adminEmail =
      this.config.get<string>('SPLIT_BOOKING_ADMIN_EMAIL') ||
      this.config.get<string>('MONITORING_ADMIN_EMAIL') ||
      'me@kartikarora.in';

    const adminMobile =
      this.config.get<string>('SPLIT_BOOKING_ADMIN_WHATSAPP') ||
      '+919999224767';

    const journeyDateStr = booking.journeyDate.toISOString().slice(0, 10);
    const price = bookingPrice(booking.totalFare, booking.serviceFee);
    const pnrList =
      [booking.pnrLeg1, booking.pnrLeg2, ...booking.pnrs]
        .filter((p): p is string => Boolean(p && p.trim()))
        .join(', ') || 'None issued yet';

    let adminEmailSent = false;
    let adminWhatsappSent = false;

    if (this.notifications) {
      const emailSubject = `⚠️ [CANCELLATION REQUEST] Booking Ref: ${booking.bookingRef} — Train ${booking.trainNumber}`;
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">⚠️ New Cancellation Request Received</h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Booking Ref: <strong>${escapeHtml(booking.bookingRef)}</strong></p>
          </div>
          <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none; background: white; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 6px 0; color: #64748b;">Train:</td><td style="font-weight: 600;">${escapeHtml(booking.trainNumber)} ${escapeHtml(booking.trainName || '')}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Route:</td><td style="font-weight: 600;">${escapeHtml(booking.fromStationCode)} → ${escapeHtml(booking.toStationCode)}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Journey Date:</td><td>${escapeHtml(journeyDateStr)}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Customer Mobile:</td><td><a href="tel:${escapeHtml(booking.contactMobile)}">${escapeHtml(booking.contactMobile)}</a></td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Customer Email:</td><td>${escapeHtml(booking.contactEmail)}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Total Amount Paid:</td><td style="font-weight: 600; color: #047857;">₹${price.amount}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Issued PNRs:</td><td style="font-family: monospace;">${escapeHtml(pnrList)}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Booking Status:</td><td>${escapeHtml(booking.bookingStatus)}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Reason for Cancellation:</td><td style="font-style: italic; color: #b91c1c;">${escapeHtml(reason || 'None provided')}</td></tr>
            </table>
            <div style="margin-top: 20px; text-align: center;">
              <a href="https://v2.lastberth.com/admin/split-bookings?tab=cancellations" style="display: inline-block; background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">Open Admin Cancellation Table</a>
            </div>
          </div>
        </div>`;

      adminEmailSent = await this.notifications
        .sendEmail(adminEmail, emailSubject, emailHtml, {
          skipFailureReport: true,
        })
        .catch(() => false);
    }

    if (this.wasender) {
      const whatsappText = `⚠️ *NEW CANCELLATION REQUEST*
Booking Ref: *${booking.bookingRef}*
Train: ${booking.trainNumber} ${booking.trainName || ''}
Route: ${booking.fromStationCode} → ${booking.toStationCode}
Date: ${journeyDateStr}
Customer Mobile: ${booking.contactMobile}
Customer Email: ${booking.contactEmail}
Amount: ₹${price.amount}
PNRs: ${pnrList}
Status: ${booking.bookingStatus}
Reason: ${reason || 'None provided'}

Open Admin: https://v2.lastberth.com/admin/split-bookings?tab=cancellations`;

      adminWhatsappSent = await this.wasender
        .sendWhatsApp({
          mobile: adminMobile,
          text: whatsappText,
        })
        .catch(() => false);
    }

    const updates: Prisma.BookingCancellationRequestUpdateInput = {};
    if (adminEmailSent) updates.adminEmailSentAt = new Date();
    if (adminWhatsappSent) updates.adminWhatsappSentAt = new Date();
    if (Object.keys(updates).length > 0) {
      await this.prisma.bookingCancellationRequest.update({
        where: { id: request.id },
        data: updates,
      });
    }

    this.posthog?.capture(
      'split_booking_cancellation_requested',
      {
        booking_ref: booking.bookingRef,
        customer_mobile: cleanMobile,
        has_reason: Boolean(reason),
        admin_email_sent: adminEmailSent,
        admin_whatsapp_sent: adminWhatsappSent,
      },
      booking.bookingRef,
    );

    return {
      success: true,
      requestId: request.id,
      message: 'Cancellation request received successfully.',
    };
  }

  /**
   * Lists all cancellation requests for the admin portal.
   */
  async adminListCancellations(status?: CancellationRequestStatus) {
    const where: Prisma.BookingCancellationRequestWhereInput = status
      ? { status }
      : {};

    const items = await this.prisma.bookingCancellationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            id: true,
            bookingRef: true,
            trainNumber: true,
            trainName: true,
            fromStationCode: true,
            toStationCode: true,
            journeyDate: true,
            travelClass: true,
            totalFare: true,
            serviceFee: true,
            contactMobile: true,
            contactEmail: true,
            bookingStatus: true,
            paymentStatus: true,
            pnrs: true,
            pnrLeg1: true,
            pnrLeg2: true,
            passengers: true,
          },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      bookingId: item.bookingId,
      bookingRef: item.bookingRef,
      mobile: item.mobile,
      reason: item.reason,
      status: item.status,
      adminNotes: item.adminNotes,
      adminEmailSentAt: item.adminEmailSentAt?.toISOString() ?? null,
      adminWhatsappSentAt: item.adminWhatsappSentAt?.toISOString() ?? null,
      processedAt: item.processedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      booking: item.booking
        ? {
            ...item.booking,
            journeyDate: item.booking.journeyDate.toISOString().slice(0, 10),
            amount: item.booking.totalFare + item.booking.serviceFee,
          }
        : null,
    }));
  }

  /**
   * Admin update cancellation request status and notes.
   */
  async adminUpdateCancellation(
    id: string,
    dto: { status?: CancellationRequestStatus; adminNotes?: string },
  ) {
    const existing = await this.prisma.bookingCancellationRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Cancellation request "${id}" not found`);
    }

    const data: Prisma.BookingCancellationRequestUpdateInput = {};
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'PROCESSED' && !existing.processedAt) {
        data.processedAt = new Date();
      }
    }
    if (dto.adminNotes !== undefined) {
      data.adminNotes = dto.adminNotes.trim() || null;
    }

    const updated = await this.prisma.bookingCancellationRequest.update({
      where: { id },
      data,
    });

    return { ok: true, cancellation: updated };
  }

  /**
   * Cancels a split-ticket booking, initiates a full refund to the user via
   * Muzobox or Razorpay, updates request records, and sends an automated
   * cancellation & refund confirmation email to the user with the refund ID.
   */
  async adminCancelAndRefundBooking(
    bookingIdOrRef: string,
    opts?: { reason?: string },
  ) {
    const rawId = bookingIdOrRef?.trim();
    if (!rawId) {
      throw new BadRequestException('Booking ID or reference is required');
    }

    const booking = await this.prisma.splitTicketBooking.findFirst({
      where: {
        OR: [{ id: rawId }, { bookingRef: rawId.toUpperCase() }],
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking "${rawId}" not found`);
    }

    if (booking.bookingStatus === 'CANCELLED') {
      throw new BadRequestException(
        `Booking ${booking.bookingRef} is already cancelled`,
      );
    }

    if (booking.paymentStatus !== 'PAID') {
      throw new BadRequestException(
        `Cannot refund booking ${booking.bookingRef} because payment status is ${booking.paymentStatus}`,
      );
    }

    const price = bookingPrice(booking.totalFare, booking.serviceFee);
    const refundAmount = price.amount;
    const userReason =
      opts?.reason?.trim() ||
      `Admin cancelled and initiated full refund for ${booking.bookingRef}`;

    const muzoboxPaymentId = booking.muzoboxPaymentId?.trim();
    const razorpayPaymentId = booking.razorpayPaymentId?.trim();

    if (!muzoboxPaymentId && !razorpayPaymentId) {
      throw new BadRequestException(
        `No payment ID (Muzobox or Razorpay) recorded for booking ${booking.bookingRef}`,
      );
    }

    let refundId: string | undefined;

    // 1. Process refund through payment provider
    if (muzoboxPaymentId) {
      try {
        const res = await this.muzoboxClient.post<{
          status?: string;
          amount?: number;
          referenceId?: string | null;
          razorpayPaymentId?: string | null;
          razorpayRefundId?: string;
        }>(
          `proxy-payments/${encodeURIComponent(muzoboxPaymentId)}/refund`,
          {
            amount: refundAmount,
            reason: userReason.slice(0, 500),
            referenceId: booking.bookingRef,
          },
          { headers: muzoboxAuthHeaders(this.config) },
        );
        const data = res.data ?? {};
        const status = String(data.status ?? '').toLowerCase();
        if (status !== 'refunded' && status !== 'already_refunded') {
          throw new Error(
            `Muzobox refund returned unexpected status=${String(data.status ?? 'missing')}`,
          );
        }
        refundId = data.razorpayRefundId ?? `rfnd_mb_${booking.bookingRef}`;
      } catch (err: unknown) {
        let msg = 'Failed to process refund via Muzobox';
        if (isAxiosError(err)) {
          const payload = err.response?.data as
            | { message?: unknown; error?: unknown }
            | undefined;
          const fromBody =
            (Array.isArray(payload?.message)
              ? payload?.message.join('; ')
              : payload?.message) ?? payload?.error;
          if (typeof fromBody === 'string' && fromBody.trim()) {
            msg = `Muzobox refund failed: ${fromBody.trim().slice(0, 500)}`;
          } else if (err.response?.status) {
            msg = `Muzobox refund failed with HTTP ${err.response.status}`;
          } else {
            msg = `Muzobox refund request failed: ${err.message}`;
          }
        } else if (err instanceof Error) {
          msg = err.message;
        }
        this.logger.error(
          `Refund failed for booking ${booking.bookingRef}: ${msg}`,
        );
        throw new BadRequestException(msg);
      }
    } else if (razorpayPaymentId) {
      if (!this.razorpay || !this.razorpay.isConfigured) {
        throw new BadRequestException(
          'Direct Razorpay refund is not configured on this server',
        );
      }
      try {
        const refundRes = await this.razorpay.createRefund({
          paymentId: razorpayPaymentId,
          amountPaise: refundAmount * 100,
          notes: {
            bookingRef: booking.bookingRef,
            reason: userReason.slice(0, 200),
          },
        });
        refundId = refundRes.id;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Razorpay direct refund failed for ${booking.bookingRef}: ${msg}`,
        );
        throw new BadRequestException(`Razorpay refund failed: ${msg}`);
      }
    }

    const finalRefundId = refundId || `rfnd_${Date.now()}`;
    const refundNote = `Full refund of ₹${refundAmount} initiated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (Refund ID: ${finalRefundId}). Reason: ${userReason}`;

    // 2. Update SplitTicketBooking status to CANCELLED
    await this.prisma.splitTicketBooking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: 'CANCELLED',
        completedAt: new Date(),
        bookingError: refundNote,
      },
    });

    // 3. Mark any existing PENDING cancellation request as PROCESSED or create one
    const existingReq = await this.prisma.bookingCancellationRequest.findFirst({
      where: { bookingId: booking.id, status: 'PENDING' },
    });

    if (existingReq) {
      await this.prisma.bookingCancellationRequest.update({
        where: { id: existingReq.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          adminNotes: existingReq.adminNotes
            ? `${existingReq.adminNotes}\n${refundNote}`
            : refundNote,
        },
      });
    } else {
      await this.prisma.bookingCancellationRequest.create({
        data: {
          bookingId: booking.id,
          bookingRef: booking.bookingRef,
          mobile: booking.contactMobile,
          reason: userReason,
          status: 'PROCESSED',
          processedAt: new Date(),
          adminNotes: refundNote,
        },
      });
    }

    // 4. Send automated Email to user with Refund ID
    let emailSent = false;
    if (this.notifications && booking.contactEmail) {
      const journeyDateStr = booking.journeyDate.toISOString().slice(0, 10);
      const subject = `Booking Cancelled & Refund Initiated — ${booking.bookingRef} (₹${refundAmount})`;
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: #0f172a; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Booking Cancelled & Refund Initiated</h1>
            <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 14px;">Booking Ref: <strong style="color: #38bdf8;">${escapeHtml(booking.bookingRef)}</strong></p>
          </div>
          <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background: white;">
            <p style="font-size: 15px; margin-top: 0; color: #334155;">Dear Passenger,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              Your split-ticket booking for <strong>Train ${escapeHtml(booking.trainNumber)} ${escapeHtml(booking.trainName || '')}</strong> (${escapeHtml(booking.fromStationCode)} → ${escapeHtml(booking.toStationCode)}) on <strong>${escapeHtml(journeyDateStr)}</strong> has been cancelled.
            </p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; color: #166534; letter-spacing: 0.5px;">Refund Details</h3>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Refund Amount:</strong> <span style="font-size: 15px; font-weight: bold; color: #15803d;">₹${refundAmount} (Full Amount)</span></p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Refund ID / Reference:</strong> <span style="font-family: monospace; font-size: 13px; font-weight: bold; color: #0f172a;">${escapeHtml(finalRefundId)}</span></p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Status:</strong> <span style="font-weight: 600; color: #15803d;">Initiated to original payment method</span></p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #166534;">
                The full amount of ₹${refundAmount} has been refunded to the original payment source. Funds typically reflect in your bank account or UPI application within 3 to 7 working days depending on your bank.
              </p>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
              <h4 style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #64748b;">Cancelled Journey</h4>
              <p style="margin: 3px 0; font-size: 13px;"><strong>Train:</strong> ${escapeHtml(booking.trainNumber)} ${escapeHtml(booking.trainName || '')}</p>
              <p style="margin: 3px 0; font-size: 13px;"><strong>Route:</strong> ${escapeHtml(booking.fromStationCode)} → ${escapeHtml(booking.toStationCode)}</p>
              <p style="margin: 3px 0; font-size: 13px;"><strong>Date:</strong> ${escapeHtml(journeyDateStr)}</p>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; line-height: 1.5;">
              If you have any questions or need further assistance, please contact LastBerth support at <a href="mailto:support@lastberth.com" style="color: #2563eb;">support@lastberth.com</a> or WhatsApp +91 99992 24767.
            </p>
          </div>
        </div>`;

      emailSent = await this.notifications
        .sendEmail(booking.contactEmail, subject, html, {
          skipFailureReport: true,
        })
        .catch(() => false);
    }

    this.posthog?.capture(
      'split_booking_cancelled_and_refunded',
      {
        booking_ref: booking.bookingRef,
        amount: refundAmount,
        refund_id: finalRefundId,
        email_sent: emailSent,
      },
      booking.bookingRef,
    );

    return {
      success: true,
      bookingRef: booking.bookingRef,
      refundAmount,
      refundId: finalRefundId,
      emailSent,
      message: `Booking ${booking.bookingRef} cancelled. Full refund of ₹${refundAmount} initiated (Refund ID: ${finalRefundId}).`,
    };
  }
}
