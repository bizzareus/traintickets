import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  Prisma,
  SplitBookingFulfillmentStatus,
  SplitBookingPaymentStatus,
  SplitTicketBooking,
} from '@prisma/client';
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
import { TripmgtBookingService } from './tripmgt-booking.service';
import { validateBookingItinerary } from './split-booking.validation';
import { bookingDetails, bookingPnrFields } from './split-booking.helpers';
import { ManualBookingService } from './manual-booking.service';
import { NotificationService } from '../notification/notification.service';
import { WasenderProvider } from '../notification/whatsapp-providers/wasender.provider';
import { escapeHtml } from '../notification/notification.helpers';
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
  private readonly muzoboxClient: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripmgt: TripmgtBookingService,
    private readonly config: ConfigService,
    private readonly manualBooking: ManualBookingService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly wasender?: WasenderProvider,
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
          description: `Train ${dto.trainNumber} ${fromStationCode}->${toStationCode} ${cleanDate} (tickets + service fee)`,
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
      return { bookingRef, bookingMode, ...price, payUrl: payUrl.href };
    } catch (error) {
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
        hasTicketPdf: Boolean(b.ticketPdfUploadedAt),
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

    await this.prisma.splitTicketBooking.update({
      where: { id },
      data: {
        ticketPdf: new Uint8Array(buffer),
        ticketPdfFilename: filename,
        ticketPdfContentType: contentType,
        ticketPdfUploadedAt: new Date(),
      },
    });

    return { ok: true, filename, uploadedAt: new Date().toISOString() };
  }

  async getTicketPdf(bookingRefOrId: string) {
    const booking = await this.prisma.splitTicketBooking.findFirst({
      where: {
        OR: [{ bookingRef: bookingRefOrId }, { id: bookingRefOrId }],
      },
      select: {
        bookingRef: true,
        ticketPdf: true,
        ticketPdfFilename: true,
        ticketPdfContentType: true,
      },
    });

    if (!booking || !booking.ticketPdf) {
      throw new NotFoundException('Ticket PDF not found');
    }

    return {
      buffer: booking.ticketPdf,
      filename: booking.ticketPdfFilename || `ticket-${booking.bookingRef}.pdf`,
      contentType: booking.ticketPdfContentType || 'application/pdf',
    };
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

    const pdfUrl = booking.ticketPdfUploadedAt
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

    return {
      ok: true,
      emailSent,
      whatsappSent,
      customerEmail: booking.contactEmail,
      customerMobile: booking.contactMobile,
    };
  }
}
