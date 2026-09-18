import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChartAlertPayment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from '../availability/journey-task.service';
import {
  RazorpayClient,
  verifyRazorpayWebhookSignature,
  type RazorpayPaymentItem,
} from './razorpay.client';

/** AC classes charged at the premium tier. Everything else (incl. ANY) is standard. */
const PREMIUM_ALERT_CLASSES = new Set(['1A', '2A', '3A']);
const PREMIUM_ALERT_PRICE_RUPEES = 25;
const STANDARD_ALERT_PRICE_RUPEES = 10;

/**
 * Class-based alert price in rupees: 1A/2A/3A pay the premium tier,
 * every other class (including ANY) pays standard. This is the enforced
 * amount — the frontend only displays it.
 */
export function chartAlertPriceForClass(classCode?: string | null): number {
  const normalized = (classCode ?? '').trim().toUpperCase();
  return PREMIUM_ALERT_CLASSES.has(normalized)
    ? PREMIUM_ALERT_PRICE_RUPEES
    : STANDARD_ALERT_PRICE_RUPEES;
}

export type ChartAlertJourneyInput = {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  stationCodesToMonitor?: string[];
  email?: string;
  mobile?: string;
  trainStartDate?: string;
  /** Caller-pinned chart times (chart-times page row) — see journey queue. */
  chartTimeLocal?: string;
  chartOneDayOffset?: number;
  chartTwoTimeLocal?: string;
  chartTwoDayOffset?: number;
};

export type PaymentLinkResult = {
  ref: string;
  amount: number;
  orderId: string;
  qrImageUrl: string;
  upiIntent?: string;
  gpayIntent?: string;
  phonepeIntent?: string;
};

export type PaymentConfirmResult = {
  status: 'pending' | 'paid' | 'failed';
  ref: string;
  journeyCreated: boolean;
  journey: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode: string;
  } | null;
  refund: {
    status: string;
    amount: number | null;
    razorpayRefundId: string | null;
    initiatedAt: string | null;
    refundedAt: string | null;
    error: string | null;
  };
};

type RazorpayWebhookEvent = {
  event?: string;
  payload?: {
    payment?: {
      entity?: RazorpayPaymentItem & { notes?: Record<string, unknown> };
    };
    order?: {
      entity?: {
        id?: string;
        receipt?: string;
        notes?: Record<string, unknown>;
      };
    };
  };
};

@Injectable()
export class ChartAlertPaymentsService {
  private readonly logger = new Logger(ChartAlertPaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private journeyTask: JourneyTaskService,
    private razorpay: RazorpayClient,
  ) {}

  /**
   * Create a pending payment record, a Razorpay order, and a single-use UPI
   * QR. Returns everything the frontend needs to render its own checkout:
   * QR image plus per-app intent links (GPay / PhonePe / generic UPI).
   */
  async createPaymentLink(
    input: ChartAlertJourneyInput,
  ): Promise<PaymentLinkResult> {
    if (!this.razorpay.isConfigured) {
      throw new ServiceUnavailableException(
        'Payment system is not configured. Please try again later.',
      );
    }
    const amount = chartAlertPriceForClass(input.classCode);
    const record = await this.prisma.chartAlertPayment.create({
      data: {
        amount,
        currency: 'INR',
        contactEmail: input.email?.trim() || undefined,
        contactMobile: input.mobile?.trim() || undefined,
        journeyPayload: {
          trainNumber: input.trainNumber,
          trainName: input.trainName,
          fromStationCode: input.fromStationCode,
          toStationCode: input.toStationCode,
          journeyDate: input.journeyDate,
          classCode: input.classCode,
          stationCodesToMonitor: input.stationCodesToMonitor,
          email: input.email,
          mobile: input.mobile,
          trainStartDate: input.trainStartDate,
          chartTimeLocal: input.chartTimeLocal,
          chartOneDayOffset: input.chartOneDayOffset,
          chartTwoTimeLocal: input.chartTwoTimeLocal,
          chartTwoDayOffset: input.chartTwoDayOffset,
        },
      },
    });

    try {
      const amountPaise = amount * 100;
      const notes = { chart_alert_ref: record.id };
      const order = await this.razorpay.createOrder({
        amountPaise,
        receipt: record.id,
        notes,
      });
      const qr = await this.razorpay.createUpiQr({
        amountPaise,
        name: `Chart alert ${input.trainNumber}`,
        description: `Chart alert ${input.trainNumber} ${input.fromStationCode}->${input.toStationCode || 'ANY'} ${input.journeyDate}`,
        notes,
      });
      const { intent, apps } = await this.razorpay.resolveQrIntents(
        qr.imageUrl,
      );
      if (!apps) {
        this.logger.warn(
          `QR intent decode failed for ref=${record.id}; serving QR image only`,
        );
      }

      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { razorpayOrderId: order.id },
      });

      this.logger.log(
        `Created chart-alert payment ref=${record.id} order=${order.id} qr=${qr.id} for ${input.trainNumber}`,
      );
      return {
        ref: record.id,
        amount,
        orderId: order.id,
        qrImageUrl: qr.imageUrl,
        upiIntent: apps?.upiIntent,
        gpayIntent: apps?.gpayIntent,
        phonepeIntent: apps?.phonepeIntent,
      };
    } catch (err) {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
      if (err instanceof ServiceUnavailableException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Razorpay create failed for ref=${record.id} amount=${amount}: ${msg}`,
      );
      throw new ServiceUnavailableException(
        'Payment system is not available. Please try again later.',
      );
    }
  }

  /**
   * Status for the payment page. Re-verifies server-to-server with Razorpay
   * (order payments) and fulfils the subscription on first paid sighting.
   */
  async getStatus(ref: string): Promise<PaymentConfirmResult> {
    const record = await this.findOrThrow(ref);
    const confirmed = await this.confirmIfPaid(record);
    return this.toConfirmResult(confirmed);
  }

  /**
   * Server-to-server Razorpay webhook. Verifies the HMAC signature against
   * the raw body, extracts our ref from payment/order notes, and fulfils.
   * Always resolves (never throws) so verified senders don't retry poison.
   */
  async handleCallback(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): Promise<{ received: boolean }> {
    if (
      !verifyRazorpayWebhookSignature(
        rawBody,
        signature,
        this.razorpay.webhookSecret,
      )
    ) {
      this.logger.warn('Razorpay webhook with invalid signature; ignoring');
      return { received: true };
    }
    let event: RazorpayWebhookEvent;
    try {
      event =
        typeof rawBody === 'string'
          ? (JSON.parse(rawBody) as RazorpayWebhookEvent)
          : (JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookEvent);
    } catch {
      this.logger.warn('Razorpay webhook with unparseable body; ignoring');
      return { received: true };
    }

    const ref = this.extractRef(event);
    if (!ref) {
      this.logger.warn(
        `Razorpay webhook ${event.event ?? 'unknown'} without chart_alert_ref; ignoring`,
      );
      return { received: true };
    }
    const record = await this.prisma.chartAlertPayment.findUnique({
      where: { id: ref },
    });
    if (!record) {
      this.logger.warn(`Razorpay webhook for unknown ref=${ref}`);
      return { received: true };
    }
    const paymentEntity = event.payload?.payment?.entity;
    if (paymentEntity?.id && !record.razorpayPaymentId) {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { razorpayPaymentId: paymentEntity.id },
      });
      record.razorpayPaymentId = paymentEntity.id;
    }
    await this.confirmIfPaid(record).catch(() => undefined);
    return { received: true };
  }

  private extractRef(event: RazorpayWebhookEvent): string | null {
    const fromNotes = (notes: Record<string, unknown> | undefined) => {
      const v = notes?.['chart_alert_ref'];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    return (
      fromNotes(event.payload?.payment?.entity?.notes) ??
      fromNotes(event.payload?.order?.entity?.notes) ??
      (typeof event.payload?.order?.entity?.receipt === 'string' &&
      event.payload.order.entity.receipt.trim()
        ? event.payload.order.entity.receipt.trim()
        : null)
    );
  }

  private async findOrThrow(ref: string): Promise<ChartAlertPayment> {
    const id = String(ref ?? '').trim();
    if (!id) throw new NotFoundException('Payment not found');
    const record = await this.prisma.chartAlertPayment.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Payment not found');
    return record;
  }

  private static normalizeRemoteStatus(
    status: unknown,
  ): 'paid' | 'failed' | 'pending' {
    const s = String(status ?? '')
      .trim()
      .toLowerCase();
    // UPI auto-captures, so `authorized` is terminal for our amounts.
    if (
      [
        'paid',
        'success',
        'succeeded',
        'completed',
        'captured',
        'authorized',
        'credited',
      ].includes(s)
    )
      return 'paid';
    if (['failed', 'failure', 'cancelled', 'canceled', 'expired'].includes(s))
      return 'failed';
    return 'pending';
  }

  private amountsMatch(expectedRupees: number, remoteAmount: unknown): boolean {
    const n = Number(remoteAmount);
    if (!Number.isFinite(n)) return false;
    // Accept exact rupees, or paise (₹25 → 2500) if the proxy reports subunits.
    return n === expectedRupees || n === expectedRupees * 100;
  }

  /** A Razorpay payment item counts as paid when captured (or authorized). */
  private isRemotePaid(item: RazorpayPaymentItem): boolean {
    return (
      ChartAlertPaymentsService.normalizeRemoteStatus(item.status) === 'paid'
    );
  }

  /**
   * Idempotent fulfilment: if Razorpay reports PAID, mark our record PAID and
   * queue the journey monitoring exactly once.
   *
   * Concurrency: `journeyRequestId` is the idempotency key claimed with an
   * atomic `updateMany(where: { journeyRequestId: null })` — only the winner
   * queues. `PAID` without a `journeyRequestId` means queueing previously
   * failed, so the next status check retries instead of reporting false success.
   */
  private async confirmIfPaid(
    record: ChartAlertPayment,
  ): Promise<ChartAlertPayment> {
    // Fully fulfilled already — fast path.
    if (record.status === 'PAID' && record.journeyRequestId) return record;
    if (record.status === 'FAILED' && !record.razorpayOrderId) return record;
    if (!record.razorpayOrderId) return record;

    let remotePaid = false;
    try {
      const payments = await this.razorpay.orderPayments(
        record.razorpayOrderId,
      );
      const match = payments.find(
        (p) => this.isRemotePaid(p) && this.amountsMatch(record.amount, p.amount),
      );
      if (match) {
        remotePaid = true;
        if (match.id && !record.razorpayPaymentId) {
          await this.prisma.chartAlertPayment.update({
            where: { id: record.id },
            data: { razorpayPaymentId: match.id },
          });
          record.razorpayPaymentId = match.id;
        }
      }
    } catch (err) {
      this.logger.warn(
        `Razorpay status check failed for ref=${record.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return record;
    }
    if (!remotePaid) return record;

    // Claim the fulfilment: only one worker wins the null → jid transition.
    const journeyRequestId = record.journeyRequestId ?? randomUUID();
    if (!record.journeyRequestId) {
      const claimed = await this.prisma.chartAlertPayment.updateMany({
        where: { id: record.id, journeyRequestId: null },
        data: {
          status: 'PAID',
          journeyRequestId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        // Lost the race — re-read the winner's row instead of queueing twice.
        const winner = await this.prisma.chartAlertPayment.findUnique({
          where: { id: record.id },
        });
        return winner ?? record;
      }
    } else {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: {
          status: 'PAID',
          paidAt: record.paidAt ?? new Date(),
        },
      });
    }

    const payload = record.journeyPayload as ChartAlertJourneyInput | null;
    if (!payload) {
      this.logger.warn(
        `Payment confirmed for ref=${record.id} but journeyPayload is missing`,
      );
      // Release the claim so a repaired payload can be retried; the row stays
      // PAID so money is never double-counted.
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { journeyRequestId: null },
      });
      const reread = await this.prisma.chartAlertPayment.findUnique({
        where: { id: record.id },
      });
      return reread ?? record;
    }

    // Empty toStationCode = chart-prepared-only alert: skip route/IRCTC
    // validation (which requires a destination) like the journey endpoint does.
    const queued = !payload.toStationCode
      ? await this.journeyTask.queueChartPreparedMonitoring(
          payload,
          journeyRequestId,
        )
      : await this.journeyTask.queueJourneyMonitoring(
          payload,
          journeyRequestId,
        );

    if (!queued) {
      this.logger.error(
        `Journey queueing failed for paid ref=${record.id} jid=${journeyRequestId}; releasing claim for retry`,
      );
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { journeyRequestId: null },
      });
    } else {
      this.logger.log(
        `Journey monitoring queued for paid ref=${record.id} jid=${journeyRequestId}`,
      );
    }

    const final = await this.prisma.chartAlertPayment.findUnique({
      where: { id: record.id },
    });
    return final ?? record;
  }

  private toConfirmResult(record: ChartAlertPayment): PaymentConfirmResult {
    const payload = record.journeyPayload as ChartAlertJourneyInput | null;
    return {
      status:
        record.status === 'PAID'
          ? 'paid'
          : record.status === 'FAILED'
            ? 'failed'
            : 'pending',
      ref: record.id,
      journeyCreated:
        record.status === 'PAID' && Boolean(record.journeyRequestId),
      journey: payload
        ? {
            trainNumber: payload.trainNumber,
            trainName: payload.trainName,
            fromStationCode: payload.fromStationCode,
            toStationCode: payload.toStationCode,
            journeyDate: payload.journeyDate,
            classCode: payload.classCode,
          }
        : null,
      refund: {
        status: record.refundStatus ?? 'NONE',
        amount: record.refundAmount ?? null,
        razorpayRefundId: record.razorpayRefundId ?? null,
        initiatedAt: record.refundInitiatedAt?.toISOString?.() ?? null,
        refundedAt: record.refundedAt?.toISOString?.() ?? null,
        error: record.refundError ?? null,
      },
    };
  }
}
