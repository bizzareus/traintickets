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
  /** Publishable key for Checkout.js custom integration. */
  keyId: string;
  qrImageUrl: string;
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

export type RazorpayWebhookEvent = {
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
   * Create a pending payment record, an order, and a single-use UPI QR
   * via direct Razorpay (if configured).
   */
  async createPaymentLink(input: ChartAlertJourneyInput): Promise<PaymentLinkResult> {
    const amount = chartAlertPriceForClass(input.classCode);
    const record = await this.prisma.chartAlertPayment.create({
      data: {
        amount,
        currency: 'INR',
         email: input.email?.trim() || undefined,
         mobile: input.mobile?.trim() || undefined,
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

    if (!this.razorpay.isConfigured) {
      throw new ServiceUnavailableException('Razorpay is not configured');
    }

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

    await this.prisma.chartAlertPayment.update({
      where: { id: record.id },
      data: { razorpayOrderId: order.id },
    });

    this.logger.log(
      `Created chart-alert payment ref=${record.id} order=${order.id}`,
    );
    return {
      ref: record.id,
      amount,
      orderId: order.id,
      keyId: this.razorpay.keyId,
      qrImageUrl: qr.imageUrl,
    };
  }

  /**
   * Status for the payment page. Re-verifies server-to-server with Razorpay
   * and fulfils the subscription on first paid sighting.
   */
  async getStatus(ref: string): Promise<PaymentConfirmResult> {
    const record = await this.findOrThrow(ref);
    const confirmed = await this.confirmIfPaid(record);
    return this.toConfirmResult(confirmed);
  }

  /**
   * Server-to-server Razorpay webhook. The HMAC signature is verified
   * against the raw body. Always acks so Razorpay does not retry.
   */
  async handleCallback(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): Promise<{ received: boolean }> {
    if (
      !this.razorpay.isConfigured ||
      !verifyRazorpayWebhookSignature(
        rawBody,
        signature,
        this.razorpay.webhookSecret,
      )
    ) {
      return { received: true };
    }

    let event: RazorpayWebhookEvent;
    try {
      event =
        typeof rawBody === 'string'
          ? (JSON.parse(rawBody) as RazorpayWebhookEvent)
          : (JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookEvent);
    } catch {
      return { received: true };
    }

    const extractedRef = this.extractRef(event);
    if (extractedRef) {
      const record = await this.prisma.chartAlertPayment.findUnique({
        where: { id: extractedRef },
      });
      if (record) {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity?.id && !record.razorpayPaymentId) {
          await this.prisma.chartAlertPayment.update({
            where: { id: record.id },
            data: { razorpayPaymentId: paymentEntity.id },
          });
          record.razorpayPaymentId = paymentEntity.id;
        }
        await this.confirmIfPaid(record).catch(() => undefined);
      }
    }

    return { received: true };
  }

  /**
   * Verify a browser-side Razorpay Checkout.js payment callback server-side.
   * Confirms the HMAC signature, then verifies the payment was captured.
   */
  async verifyBrowserPaymentCallback(
    body: { orderId?: string; paymentId?: string; signature?: string },
  ): Promise<PaymentConfirmResult> {
    const orderId = String(body.orderId ?? '').trim();
    const paymentId = String(body.paymentId ?? '').trim();
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';

    if (!orderId || !paymentId || !signature) {
      throw new NotFoundException('Invalid payment callback');
    }

    const record = await this.prisma.chartAlertPayment.findUnique({
      where: { razorpayOrderId: orderId },
    });
    if (!record) {
      throw new NotFoundException('Payment not found');
    }
    if (record.razorpayPaymentId && record.razorpayPaymentId !== paymentId) {
      throw new NotFoundException('Payment ID does not match order');
    }

    if (!this.razorpay.isConfigured) {
      throw new ServiceUnavailableException('Razorpay is not configured');
    }

    if (!this.razorpay.verifyBrowserPaymentSignature(orderId, paymentId, signature)) {
      throw new NotFoundException('Invalid payment signature');
    }

    const payment = await this.razorpay.fetchPayment(paymentId).catch(() => null);
    if (!payment || payment.order_id !== orderId) {
      throw new NotFoundException('Payment not found');
    }

    if (!this.isRemotePaid(payment) || !this.amountsMatch(record.amount, payment.amount)) {
      throw new NotFoundException('Payment not captured');
    }

    if (!record.razorpayPaymentId) {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { razorpayPaymentId: paymentId },
      });
      record.razorpayPaymentId = paymentId;
    }

    const confirmed = await this.confirmIfPaid(record);
    return this.toConfirmResult(confirmed);
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
    return n === expectedRupees || n === expectedRupees * 100;
  }

  private isRemotePaid(item: RazorpayPaymentItem): boolean {
    return (
      ChartAlertPaymentsService.normalizeRemoteStatus(item.status) === 'paid'
    );
  }

  /**
   * Idempotent fulfilment: if Razorpay reports PAID, mark our record PAID and
   * queue the journey monitoring exactly once.
   */
  private async confirmIfPaid(
    record: ChartAlertPayment,
  ): Promise<ChartAlertPayment> {
    if (record.status === 'PAID' && record.journeyRequestId) return record;

    let remotePaid = false;
    let foundPaymentId: string | undefined =
      record.razorpayPaymentId ?? undefined;
    let foundOrderId: string | undefined = record.razorpayOrderId ?? undefined;

    if (record.razorpayOrderId && this.razorpay.isConfigured) {
      try {
        const payments = await this.razorpay.orderPayments(
          record.razorpayOrderId,
        );
        const match = payments.find(
          (p) =>
            this.isRemotePaid(p) && this.amountsMatch(record.amount, p.amount),
        );
        if (match) {
          remotePaid = true;
          foundPaymentId = match.id ?? foundPaymentId;
        }
      } catch (err) {
        this.logger.warn(
          `Razorpay status check failed for ref=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!remotePaid) return record;

    const journeyRequestId = record.journeyRequestId ?? randomUUID();
    if (!record.journeyRequestId) {
      const claimed = await this.prisma.chartAlertPayment.updateMany({
        where: { id: record.id, journeyRequestId: null },
        data: {
          status: 'PAID',
          razorpayPaymentId: foundPaymentId,
          razorpayOrderId: foundOrderId,
          journeyRequestId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
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
          razorpayPaymentId: foundPaymentId,
          razorpayOrderId: foundOrderId,
          paidAt: record.paidAt ?? new Date(),
        },
      });
    }

    const payload = record.journeyPayload as ChartAlertJourneyInput | null;
    if (!payload) {
      this.logger.warn(
        `Payment confirmed for ref=${record.id} but journeyPayload is missing`,
      );
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { journeyRequestId: null },
      });
      const reread = await this.prisma.chartAlertPayment.findUnique({
        where: { id: record.id },
      });
      return reread ?? record;
    }

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
