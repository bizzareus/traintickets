import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ChartAlertPayment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from '../availability/journey-task.service';
import { NotificationService } from '../notification/notification.service';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import type { AxiosInstance } from 'axios';
import {
  RazorpayClient,
  verifyRazorpayWebhookSignature,
  type RazorpayPaymentItem,
} from './razorpay.client';

/** AC classes charged at the premium tier. Everything else (incl. ANY) is standard. */
const PREMIUM_ALERT_CLASSES = new Set(['1A', '2A', '3A']);
const PREMIUM_ALERT_PRICE_RUPEES = 25;
const STANDARD_ALERT_PRICE_RUPEES = 10;

const DEFAULT_MUZOBOX_API_URL =
  'https://ai-jukebox-backend-production.up.railway.app/api';

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
  payUrl?: string;
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

type MuzoboxCreateLinkResponse = {
  id?: string;
  paymentId?: string;
  payment_id?: string;
  amount?: number;
  payUrl?: string;
  pay_url?: string;
  payLink?: string;
  razorpayOrderId?: string;
  razorpay_order_id?: string;
  razorpayKeyId?: string;
  referenceId?: string;
  redirectUri?: string;
  qrImageUrl?: string;
  qr_image_url?: string;
  upiString?: string;
};

type MuzoboxStatusResponse = {
  status?: string;
  amount?: number;
  referenceId?: string | null;
  reference_id?: string | null;
  razorpayPaymentId?: string | null;
  razorpay_payment_id?: string | null;
  razorpayOrderId?: string | null;
  razorpay_order_id?: string | null;
  redirectUrl?: string;
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
  private readonly muzoboxClient: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private journeyTask: JourneyTaskService,
    private razorpay: RazorpayClient,
    private notificationService: NotificationService,
  ) {
    this.muzoboxClient = createRetryingAxiosClient({
      serviceName: 'muzobox',
      retries: 2,
      retryPost: false,
    });
    this.muzoboxClient.defaults.baseURL = this.muzoboxApiUrl;
    this.muzoboxClient.defaults.timeout = 15_000;
  }

  private get muzoboxApiUrl(): string {
    return (
      this.configService
        .get<string>('MUZOBOX_API_URL')
        ?.trim()
        .replace(/\/$/, '') || DEFAULT_MUZOBOX_API_URL
    );
  }

  private authHeaders(): Record<string, string> | undefined {
    const key = this.configService.get<string>('MUZOBOX_PROXY_API_KEY')?.trim();
    return key ? { 'x-api-key': key } : undefined;
  }

  /**
   * Create a pending payment record, an order, and a single-use UPI QR
   * via either direct Razorpay (if configured) or the Muzobox payment proxy.
   */
  async createPaymentLink(
    input: ChartAlertJourneyInput,
  ): Promise<PaymentLinkResult> {
    if (input.toStationCode?.trim()) {
      const validation = await this.journeyTask.validateJourneyForMonitoring({
        trainNumber: input.trainNumber,
        fromStationCode: input.fromStationCode,
        toStationCode: input.toStationCode,
        journeyDate: input.journeyDate,
        trainStartDate: input.trainStartDate,
        stationCodesToMonitor: input.stationCodesToMonitor,
      });
      if (!validation.valid) {
        throw new BadRequestException({
          valid: false,
          errors: validation.errors,
        });
      }
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

    // 1. If direct Razorpay is configured, generate directly
    if (this.razorpay.isConfigured) {
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
        const { apps } = await this.razorpay.resolveQrIntents(qr.imageUrl);

        await this.prisma.chartAlertPayment.update({
          where: { id: record.id },
          data: { razorpayOrderId: order.id },
        });

        this.logger.log(
          `Created direct Razorpay chart-alert payment ref=${record.id} order=${order.id}`,
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
        this.logger.warn(
          `Direct Razorpay creation failed; falling back to Muzobox proxy: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 2. Muzobox proxy payment flow
    try {
      const res = await this.muzoboxClient.post<MuzoboxCreateLinkResponse>(
        'proxy-payments/create-link',
        {
          amount,
          referenceId: record.id,
          redirectUri: `chart-alert/payment-complete?ref=${record.id}`,
          description: `Chart alert ${input.trainNumber} ${input.fromStationCode}->${input.toStationCode || 'ANY'} ${input.journeyDate}`,
          customerEmail: input.email?.trim() || undefined,
          customerMobile: input.mobile?.trim() || undefined,
        },
        { headers: this.authHeaders() },
      );

      const data = res.data ?? {};
      const muzoboxId = data.id || data.paymentId || data.payment_id;
      const payUrl =
        data.payUrl ||
        data.pay_url ||
        data.payLink ||
        (muzoboxId ? `https://muzobox.com/pay/${muzoboxId}` : '');
      const orderId =
        data.razorpayOrderId ||
        data.razorpay_order_id ||
        `order_muzobox_${record.id}`;

      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: {
          muzoboxPaymentId: muzoboxId || null,
          razorpayOrderId:
            data.razorpayOrderId || data.razorpay_order_id || null,
        },
      });

      const upiIntent =
        data.upiString ||
        `upi://pay?pa=pay@lastberth&pn=LastBerth&am=${amount}&tn=${record.id}&cu=INR`;
      const qrImageUrl =
        data.qrImageUrl ||
        data.qr_image_url ||
        (payUrl
          ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`
          : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiIntent)}`);

      this.logger.log(
        `Created Muzobox chart-alert payment ref=${record.id} muzoboxId=${muzoboxId} payUrl=${payUrl} qrImageUrl=${qrImageUrl ? 'present' : 'none'}`,
      );

      return {
        ref: record.id,
        amount,
        orderId,
        payUrl: payUrl || undefined,
        qrImageUrl,
        upiIntent,
        gpayIntent: upiIntent.replace(/^upi:/, 'tez:'),
        phonepeIntent: upiIntent.replace(/^upi:\/\/pay/, 'phonepe://pay'),
      };
    } catch (err) {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
      const axiosErr = err as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      const responseData = axiosErr.response?.data
        ? JSON.stringify(axiosErr.response.data)
        : '';
      const msg = axiosErr.message || String(err);
      this.logger.error(
        `Muzobox create-link failed for ref=${record.id} amount=${amount} status=${axiosErr.response?.status ?? 'n/a'}: ${msg} ${responseData}`,
      );
      throw new ServiceUnavailableException(
        'Payment system is currently unavailable. Please try again later.',
      );
    }
  }

  /**
   * Status for the payment page. Re-verifies server-to-server with Muzobox or Razorpay
   * and fulfils the subscription on first paid sighting.
   */
  async getStatus(ref: string): Promise<PaymentConfirmResult> {
    const record = await this.findOrThrow(ref);
    const confirmed = await this.confirmIfPaid(record);
    return this.toConfirmResult(confirmed);
  }

  /**
   * Server-to-server callback / webhook (handles both Razorpay and Muzobox).
   */
  async handleCallback(
    rawBody: Buffer | string,
    signature: string | undefined,
    parsedBody?: Record<string, unknown>,
  ): Promise<{ received: boolean }> {
    // 1. If incoming request has Muzobox callback shape
    const ref =
      (parsedBody?.referenceId as string) ||
      (parsedBody?.reference_id as string) ||
      (parsedBody?.ref as string);
    const muzoboxId =
      (parsedBody?.paymentId as string) || (parsedBody?.payment_id as string);

    if (ref || muzoboxId) {
      const record = ref
        ? await this.prisma.chartAlertPayment.findUnique({ where: { id: ref } })
        : muzoboxId
          ? await this.prisma.chartAlertPayment.findUnique({
              where: { muzoboxPaymentId: muzoboxId },
            })
          : null;
      if (record) {
        await this.confirmIfPaid(record).catch(() => undefined);
        return { received: true };
      }
    }

    // 2. Razorpay direct webhook signature verification
    if (
      this.razorpay.isConfigured &&
      verifyRazorpayWebhookSignature(
        rawBody,
        signature,
        this.razorpay.webhookSecret,
      )
    ) {
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
    }

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
    const s = (
      typeof status === 'string' || typeof status === 'number'
        ? String(status)
        : ''
    )
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
   * Idempotent fulfilment: if Muzobox or Razorpay reports PAID, mark our record PAID and
   * queue the journey monitoring exactly once.
   */
  private async confirmIfPaid(
    record: ChartAlertPayment,
  ): Promise<ChartAlertPayment> {
    // Fast path: already fulfilled
    if (record.status === 'PAID' && record.journeyRequestId) return record;

    let remotePaid = false;
    let foundPaymentId: string | undefined =
      record.razorpayPaymentId ?? undefined;
    let foundOrderId: string | undefined = record.razorpayOrderId ?? undefined;

    // 1. Check with Muzobox if muzoboxPaymentId exists
    if (record.muzoboxPaymentId) {
      try {
        const res = await this.muzoboxClient.get<MuzoboxStatusResponse>(
          `proxy-payments/${record.muzoboxPaymentId}/status`,
          { headers: this.authHeaders() },
        );
        const remote = res.data ?? {};
        const normalized = ChartAlertPaymentsService.normalizeRemoteStatus(
          remote?.status,
        );
        if (normalized === 'failed') {
          if (record.status === 'FAILED') return record;
          return this.prisma.chartAlertPayment.update({
            where: { id: record.id },
            data: { status: 'FAILED' },
          });
        }
        if (normalized === 'paid') {
          remotePaid = true;
          foundPaymentId =
            remote.razorpayPaymentId ??
            remote.razorpay_payment_id ??
            foundPaymentId;
          foundOrderId =
            remote.razorpayOrderId ?? remote.razorpay_order_id ?? foundOrderId;
        }
      } catch (err) {
        this.logger.warn(
          `Muzobox status check failed for ref=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 2. Check with direct Razorpay if configured
    if (!remotePaid && record.razorpayOrderId && this.razorpay.isConfigured) {
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

    // Claim the fulfilment: only one worker wins the null → jid transition.
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

    // Queue monitoring
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

      const contactEmail = payload.email?.trim() || record.contactEmail?.trim();
      const contactMobile =
        payload.mobile?.trim() || record.contactMobile?.trim();

      if ((contactEmail || contactMobile) && !record.confirmationSentAt) {
        const updateResult = await this.prisma.chartAlertPayment.updateMany({
          where: { id: record.id, confirmationSentAt: null },
          data: { confirmationSentAt: new Date() },
        });

        if (updateResult.count > 0) {
          const tasks = await this.prisma.chartTimeAvailabilityTask.findMany({
            where: { journeyRequestId },
            orderBy: { chartAt: 'asc' },
            select: { chartAt: true },
          });

          void this.notificationService
            .sendChartAlertConfirmation({
              email: contactEmail,
              mobile: contactMobile,
              trainNumber: payload.trainNumber,
              trainName: payload.trainName,
              fromStationCode: payload.fromStationCode,
              toStationCode: payload.toStationCode,
              journeyDate: payload.journeyDate,
              classCode: payload.classCode,
              amount: record.amount,
              paymentRef: record.id,
              chartTimes: tasks.map((t, idx) => ({
                label: tasks.length > 1 ? `Chart ${idx + 1}` : 'Chart 1',
                chartAt: t.chartAt,
              })),
            })
            .catch((err) =>
              this.logger.error(
                `Failed to send chart alert confirmation for payment ref=${record.id}: ${err instanceof Error ? err.stack || err.message : String(err)}`,
              ),
            );
        }
      }
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
