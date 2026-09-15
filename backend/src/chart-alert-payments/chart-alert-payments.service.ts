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
const DEFAULT_MUZOBOX_API_URL =
  'https://ai-jukebox-backend-production.up.railway.app/api';
const DEFAULT_PUBLIC_API_URL = 'https://api.lastberth.com';
const DEFAULT_FRONTEND_URL = 'https://lastberth.com';

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
  id?: string;
  paymentId?: string;
  payment_id?: string;
  amount?: number;
  payUrl?: string;
  pay_url?: string;
  payLink?: string;
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
      this.configService
        .get<string>('MUZOBOX_API_URL')
        ?.trim()
        .replace(/\/$/, '') || DEFAULT_MUZOBOX_API_URL
    );
  }

  private get publicApiUrl(): string {
    return (
      this.configService
        .get<string>('PUBLIC_API_URL')
        ?.trim()
        .replace(/\/$/, '') || DEFAULT_PUBLIC_API_URL
    );
  }

  private get frontendUrl(): string {
    return (
      this.configService
        .get<string>('FRONTEND_URL')
        ?.trim()
        .replace(/\/$/, '') ||
      this.configService
        .get<string>('NEXT_PUBLIC_APP_URL')
        ?.trim()
        .replace(/\/$/, '') ||
      DEFAULT_FRONTEND_URL
    );
  }

  private get priceRupees(): number {
    const raw = Number(
      this.configService.get<string>('CHART_ALERT_PRICE_RUPEES') ??
        DEFAULT_PRICE_RUPEES,
    );
    return Number.isFinite(raw) && raw >= 1
      ? Math.floor(raw)
      : DEFAULT_PRICE_RUPEES;
  }

  private authHeaders(): Record<string, string> {
    const apiKey = this.configService
      .get<string>('MUZOBOX_PROXY_API_KEY')
      ?.trim();
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
   * sends them back to {frontend}/chart-alert/payment-complete?ref=…
   */
  async createPaymentLink(
    input: ChartAlertJourneyInput,
  ): Promise<PaymentLinkResult> {
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
          chartTimeLocal: input.chartTimeLocal,
          chartOneDayOffset: input.chartOneDayOffset,
          chartTwoTimeLocal: input.chartTwoTimeLocal,
          chartTwoDayOffset: input.chartTwoDayOffset,
        },
      },
    });

    try {
      const res = await this.client.post<MuzoboxCreateLinkResponse>(
        'proxy-payments/create-link',
        {
          amount,
          redirectUri: `${this.frontendUrl}/chart-alert/payment-complete?ref=${record.id}`,
          referenceId: record.id,
          callbackUrl: `${this.publicApiUrl}/api/chart-alert-payments/callback`,
          description: `Chart alert ${input.trainNumber} ${input.fromStationCode}->${input.toStationCode || 'ANY'} ${input.journeyDate}`,
          customerEmail: input.email?.trim() || undefined,
          customerMobile: input.mobile?.trim() || undefined,
        },
        { headers },
      );

      // Muzobox field names vary across versions — accept camelCase/snake_case.
      const body = res.data ?? {};
      const muzoboxId =
        body.id ?? body.paymentId ?? body.payment_id ?? undefined;
      const payUrl = body.payUrl ?? body.pay_url ?? body.payLink ?? undefined;
      if (!muzoboxId || !payUrl) {
        throw new Error('Invalid response from payment proxy');
      }

      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { muzoboxPaymentId: muzoboxId, payUrl },
      });

      this.logger.log(
        `Created chart-alert payment ref=${record.id} muzobox=${muzoboxId} for ${input.trainNumber}`,
      );
      return { ref: record.id, payUrl, amount };
    } catch (err) {
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(
        `Muzobox create-link failed for ref=${record.id} amount=${amount} ` +
          `target=${this.describeMuzoboxErrorTarget(err)} ` +
          `body=${this.describeMuzoboxErrorBody(err)}`,
      );
      throw new ServiceUnavailableException(
        'Payment system is not available. Please try again later.',
      );
    }
  }

  /**
   * Full request URL for a failed Muzobox call (method + base + path), so a
   * 404/401 can be traced to a misconfigured MUZOBOX_API_URL. Never includes
   * contact PII — only routing info.
   */
  private describeMuzoboxErrorTarget(err: unknown): string {
    const e = err as {
      config?: { baseURL?: string; url?: string; method?: string };
    };
    const method = e?.config?.method?.toUpperCase() ?? 'POST';
    const base = e?.config?.baseURL ?? this.muzoboxApiUrl;
    const path = e?.config?.url ?? 'proxy-payments/create-link';
    return `${method} ${base}/${String(path).replace(/^\/+/, '')}`;
  }

  /** Truncated proxy response body (or fallback message) for error logs. */
  private describeMuzoboxErrorBody(err: unknown): string {
    const e = err as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    const status = e?.response?.status;
    const body =
      e?.response?.data ?? (typeof e?.message === 'string' ? e.message : null);
    const raw =
      typeof body === 'string' ? body : JSON.stringify(body ?? String(err));
    return `status=${status ?? 'n/a'} ${raw.slice(0, 500)}`;
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
    payment_id?: string;
    status?: string;
    referenceId?: string;
    reference_id?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
  }): Promise<{ received: boolean }> {
    const ref = body?.referenceId ?? body?.reference_id;
    const muzoboxId = body?.paymentId ?? body?.payment_id;
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
    if (['paid', 'success', 'succeeded', 'completed', 'captured'].includes(s))
      return 'paid';
    if (['failed', 'failure', 'cancelled', 'canceled', 'expired'].includes(s))
      return 'failed';
    return 'pending';
  }

  private amountsMatch(expectedRupees: number, remoteAmount: unknown): boolean {
    const n = Number(remoteAmount);
    if (!Number.isFinite(n)) return false;
    // Accept exact rupees, or paise (₹5 → 500) if the proxy reports subunits.
    return n === expectedRupees || n === expectedRupees * 100;
  }

  /**
   * Idempotent fulfilment: if Muzobox reports PAID, mark our record PAID and
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
    if (record.status === 'FAILED' && !record.muzoboxPaymentId) return record;
    if (!record.muzoboxPaymentId) return record;

    let remote: MuzoboxStatusResponse;
    try {
      // The status API requires the proxy key — without it every check 401s
      // and payments stay pending forever.
      const res = await this.client.get<MuzoboxStatusResponse>(
        `proxy-payments/${record.muzoboxPaymentId}/status`,
        { headers: this.authHeaders() },
      );
      remote = res.data ?? {};
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(
        `Muzobox status check failed for ref=${record.id} ` +
          `target=${this.describeMuzoboxErrorTarget(err)} ` +
          `body=${this.describeMuzoboxErrorBody(err)}`,
      );
      return record;
    }

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
    if (normalized !== 'paid') return record;
    if (!this.amountsMatch(record.amount, remote.amount)) {
      this.logger.warn(
        `Amount mismatch for ref=${record.id}: expected ₹${record.amount}, proxy reports ₹${String(remote.amount)}`,
      );
    }

    const razorpayPaymentId =
      remote.razorpayPaymentId ?? remote.razorpay_payment_id ?? undefined;
    const razorpayOrderId =
      remote.razorpayOrderId ?? remote.razorpay_order_id ?? undefined;

    // Claim the fulfilment: only one worker wins the null → jid transition.
    const journeyRequestId = record.journeyRequestId ?? randomUUID();
    if (!record.journeyRequestId) {
      const claimed = await this.prisma.chartAlertPayment.updateMany({
        where: { id: record.id, journeyRequestId: null },
        data: {
          status: 'PAID',
          razorpayPaymentId,
          razorpayOrderId,
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
          razorpayPaymentId,
          razorpayOrderId,
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
    };
  }
}
