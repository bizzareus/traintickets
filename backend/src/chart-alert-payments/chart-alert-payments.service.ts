import {
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
import { createRetryingAxiosClient } from '../common/retrying-axios';
import type { AxiosInstance } from 'axios';

const DEFAULT_PRICE_RUPEES = 5;
const DEFAULT_MUZOBOX_API_URL = 'https://muzobox.com/api';
const DEFAULT_PUBLIC_API_URL = 'https://api.lastberth.com';

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
};

export type PaymentLinkResult = {
  ref: string;
  payUrl: string;
  amount: number;
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
};

type MuzoboxCreateLinkResponse = {
  id: string;
  amount: number;
  payUrl: string;
};

type MuzoboxStatusResponse = {
  status: 'created' | 'paid' | 'failed';
  amount: number;
  referenceId: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  redirectUrl?: string;
};

@Injectable()
export class ChartAlertPaymentsService {
  private readonly logger = new Logger(ChartAlertPaymentsService.name);
  private readonly client: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private journeyTask: JourneyTaskService,
  ) {
    this.client = createRetryingAxiosClient({
      serviceName: 'muzobox',
      retries: 2,
      retryPost: false,
    });
    this.client.defaults.baseURL = this.muzoboxApiUrl;
    this.client.defaults.timeout = 15_000;
  }

  private get muzoboxApiUrl(): string {
    return (
      this.configService.get<string>('MUZOBOX_API_URL')?.trim().replace(/\/$/, '') ||
      DEFAULT_MUZOBOX_API_URL
    );
  }

  private get publicApiUrl(): string {
    return (
      this.configService.get<string>('PUBLIC_API_URL')?.trim().replace(/\/$/, '') ||
      DEFAULT_PUBLIC_API_URL
    );
  }

  private get priceRupees(): number {
    const raw = Number(
      this.configService.get<string>('CHART_ALERT_PRICE_RUPEES') ??
        DEFAULT_PRICE_RUPEES,
    );
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PRICE_RUPEES;
  }

  private authHeaders(): Record<string, string> {
    const apiKey = this.configService.get<string>('MUZOBOX_PROXY_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Payment system is not configured. Please try again later.',
      );
    }
    return { 'x-api-key': apiKey };
  }

  /**
   * Create a pending payment record and a Muzobox hosted payment link.
   * The frontend redirects the customer to `payUrl`; after payment Muzobox
   * sends them back to lastberth.com/chart-alert/payment-complete?ref=…
   */
  async createPaymentLink(input: ChartAlertJourneyInput): Promise<PaymentLinkResult> {
    const amount = this.priceRupees;
    // Fail fast when the proxy key is missing so we don't leave junk FAILED rows.
    const headers = this.authHeaders();
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
        },
      },
    });

    try {
      const res = await this.client.post<MuzoboxCreateLinkResponse>(
        'proxy-payments/create-link',
        {
          amount,
          redirectUri: `chart-alert/payment-complete?ref=${record.id}`,
          referenceId: record.id,
          callbackUrl: `${this.publicApiUrl}/api/chart-alert-payments/callback`,
          description: `Chart alert ${input.trainNumber} ${input.fromStationCode}->${input.toStationCode || 'ANY'} ${input.journeyDate}`,
          customerEmail: input.email?.trim() || undefined,
          customerMobile: input.mobile?.trim() || undefined,
        },
        { headers },
      );

      const payUrl = res.data?.payUrl;
      if (!res.data?.id || !payUrl) {
        throw new Error('Invalid response from payment proxy');
      }

      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { muzoboxPaymentId: res.data.id, payUrl },
      });

      this.logger.log(
        `Created chart-alert payment ref=${record.id} muzobox=${res.data.id} for ${input.trainNumber}`,
      );
      return { ref: record.id, payUrl, amount };
    } catch (err) {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(
        `Muzobox create-link failed for ref=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'Payment system is not available. Please try again later.',
      );
    }
  }

  /**
   * Status for the return page. Re-verifies server-to-server with Muzobox
   * (never trusts the redirect query params) and fulfils the subscription.
   */
  async getStatus(ref: string): Promise<PaymentConfirmResult> {
    const record = await this.findOrThrow(ref);
    const confirmed = await this.confirmIfPaid(record);
    return this.toConfirmResult(confirmed);
  }

  /**
   * Server-to-server callback from Muzobox (payment proxy). The payload is
   * untrusted, so we always re-verify via the Muzobox status API.
   */
  async handleCallback(body: {
    paymentId?: string;
    status?: string;
    referenceId?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
  }): Promise<{ received: boolean }> {
    const ref = body?.referenceId;
    const muzoboxId = body?.paymentId;
    const record = ref
      ? await this.prisma.chartAlertPayment.findUnique({ where: { id: ref } })
      : muzoboxId
        ? await this.prisma.chartAlertPayment.findUnique({
            where: { muzoboxPaymentId: muzoboxId },
          })
        : null;
    if (!record) {
      this.logger.warn(
        `Payment callback for unknown ref=${ref ?? 'n/a'} payment=${muzoboxId ?? 'n/a'}`,
      );
      return { received: true };
    }
    await this.confirmIfPaid(record);
    return { received: true };
  }

  private async findOrThrow(ref: string): Promise<ChartAlertPayment> {
    const record = await this.prisma.chartAlertPayment.findUnique({
      where: { id: ref },
    });
    if (!record) throw new NotFoundException('Payment not found');
    return record;
  }

  /**
   * Idempotent fulfilment: if Muzobox reports PAID, mark our record PAID and
   * queue the journey monitoring exactly once.
   */
  private async confirmIfPaid(record: ChartAlertPayment): Promise<ChartAlertPayment> {
    if (record.status === 'PAID') return record;
    if (!record.muzoboxPaymentId) return record;

    let remote: MuzoboxStatusResponse;
    try {
      const res = await this.client.get<MuzoboxStatusResponse>(
        `proxy-payments/${record.muzoboxPaymentId}/status`,
      );
      remote = res.data;
    } catch (err) {
      this.logger.warn(
        `Muzobox status check failed for ref=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return record;
    }

    if (remote?.status === 'failed') {
      return this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
    }
    if (remote?.status !== 'paid') return record;
    if (remote.amount !== record.amount) {
      this.logger.warn(
        `Amount mismatch for ref=${record.id}: expected ₹${record.amount}, proxy reports ₹${remote.amount}`,
      );
    }

    const journeyRequestId = randomUUID();
    const payload = record.journeyPayload as ChartAlertJourneyInput | null;
    if (payload) {
      try {
        // Empty toStationCode = chart-prepared-only alert: skip route/IRCTC
        // validation (which requires a destination) like the journey endpoint does.
        if (!payload.toStationCode) {
          await this.journeyTask.queueChartPreparedMonitoring(payload, journeyRequestId);
        } else {
          await this.journeyTask.queueJourneyMonitoring(payload, journeyRequestId);
        }
        this.logger.log(
          `Journey monitoring queued for paid ref=${record.id} jid=${journeyRequestId}`,
        );
      } catch (err) {
        // Payment succeeded; journey creation is best-effort and retried via status page.
        this.logger.error(
          `Failed to queue journey monitoring for paid ref=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.logger.warn(
        `Payment confirmed for ref=${record.id} but journeyPayload is missing`,
      );
    }

    return this.prisma.chartAlertPayment.update({
      where: { id: record.id },
      data: {
        status: 'PAID',
        razorpayPaymentId: remote.razorpayPaymentId ?? undefined,
        razorpayOrderId: remote.razorpayOrderId ?? undefined,
        journeyRequestId,
        paidAt: new Date(),
      },
    });
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
      journeyCreated: record.status === 'PAID' && Boolean(record.journeyRequestId),
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
    };
  }
}
