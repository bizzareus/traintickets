import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import type { RefundInfo } from '../notification/notification.helpers';

const DEFAULT_MUZOBOX_API_URL =
  'https://ai-jukebox-backend-production.up.railway.app/api';
const REFUND_TIMEOUT_MS = 7000;

type MuzoboxRefundResponse = {
  status?: string;
  razorpayRefundId?: string;
  razorpay_refund_id?: string;
  id?: string;
  amount?: number;
};

/**
 * Standalone refund client (Prisma + Config only, no JourneyTask dep so
 * JourneyTaskService can inject it without a circular dependency).
 * Calls Muzobox `POST proxy-payments/:id/refund`, which fans out to Razorpay.
 */
@Injectable()
export class ChartAlertRefundsService {
  private readonly logger = new Logger(ChartAlertRefundsService.name);
  private readonly client: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.client = createRetryingAxiosClient({
      serviceName: 'muzobox-refund',
      retries: 1,
      retryPost: false,
    });
    this.client.defaults.baseURL = this.muzoboxApiUrl;
    this.client.defaults.timeout = REFUND_TIMEOUT_MS;
  }

  private get muzoboxApiUrl(): string {
    return (
      this.configService
        .get<string>('MUZOBOX_API_URL')
        ?.trim()
        .replace(/\/$/, '') || DEFAULT_MUZOBOX_API_URL
    );
  }

  private get autoRefundEnabled(): boolean {
    const raw = this.configService
      .get<string>('ENABLE_AUTO_REFUND')
      ?.trim()
      .toLowerCase();
    return raw !== 'false';
  }

  private authHeaders(): Record<string, string> | null {
    const apiKey = this.configService
      .get<string>('MUZOBOX_PROXY_API_KEY')
      ?.trim();
    return apiKey ? { 'x-api-key': apiKey } : null;
  }

  /**
   * True when the journey behind a payment was set up without a destination
   * (plain chart-time ping). Reads the monitoring request first, falling back
   * to the paid journey payload when the request row is missing.
   */
  private async isChartPreparedOnlyAlert(
    journeyRequestId: string,
    record: { journeyPayload: unknown },
  ): Promise<boolean> {
    const request = await this.prisma.journeyMonitoringRequest.findUnique({
      where: { id: journeyRequestId },
      select: { toStationCode: true },
    });
    if (request) return !request.toStationCode?.trim();
    const payload = (record.journeyPayload ?? null) as {
      toStationCode?: string;
    } | null;
    return !String(payload?.toStationCode ?? '').trim();
  }

  /**
   * Attempt a refund for the PAID payment behind a journey. Idempotent via an
   * atomic NONE/FAILED → INITIATED claim; only the winner calls Muzobox.
   * Never throws — returns a RefundInfo suitable for notification templates.
   *
   * When `opts.force` is true (manual admin refund), the ENABLE_AUTO_REFUND
   * flag and the chart-prepared-only exclusion are bypassed so any PAID
   * payment can be refunded on demand.
   */
  async initiateRefundForJourney(
    journeyRequestId: string,
    reason: string,
    opts?: { force?: boolean },
  ): Promise<RefundInfo> {
    const jid = String(journeyRequestId ?? '').trim();
    if (!jid) return { attempted: false, outcome: 'skipped' };
    const forced = opts?.force === true;
    if (!forced && !this.autoRefundEnabled)
      return { attempted: false, outcome: 'skipped' };

    const record = await this.prisma.chartAlertPayment.findFirst({
      where: { journeyRequestId: jid, status: 'PAID' },
    });
    if (!record) return { attempted: false, outcome: 'skipped' };
    // No-destination ("chart prepared only") alerts carry no end-to-end
    // availability promise, so they are excluded from auto-refunds.
    // A forced (admin) refund bypasses this exclusion.
    if (!forced && (await this.isChartPreparedOnlyAlert(jid, record))) {
      this.logger.log(
        `Refund skipped for jid=${jid}: no destination selected (chart-prepared-only alert)`,
      );
      return { attempted: false, outcome: 'skipped' };
    }
    if (record.refundStatus === 'SUCCEEDED') {
      return {
        attempted: true,
        outcome: 'succeeded',
        amount: record.refundAmount ?? record.amount,
        refundId: record.razorpayRefundId ?? undefined,
      };
    }
    if (record.refundStatus === 'INITIATED') {
      return {
        attempted: true,
        outcome: 'pending',
        amount: record.amount,
      };
    }
    if (!record.muzoboxPaymentId)
      return { attempted: false, outcome: 'skipped' };

    const headers = this.authHeaders();
    if (!headers) {
      this.logger.warn(`Refund skipped for jid=${jid}: proxy key missing`);
      return { attempted: false, outcome: 'skipped' };
    }

    const claimed = await this.prisma.chartAlertPayment.updateMany({
      where: {
        id: record.id,
        refundStatus: { in: ['NONE', 'FAILED', 'SKIPPED'] },
      },
      data: {
        refundStatus: 'INITIATED',
        refundAttempts: { increment: 1 },
        refundInitiatedAt: new Date(),
        refundReason: reason.slice(0, 500),
        refundError: null,
      },
    });
    if (claimed.count === 0) {
      const reread = await this.prisma.chartAlertPayment.findUnique({
        where: { id: record.id },
      });
      return reread?.refundStatus === 'SUCCEEDED'
        ? {
            attempted: true,
            outcome: 'succeeded',
            amount: reread.refundAmount ?? reread.amount,
            refundId: reread.razorpayRefundId ?? undefined,
          }
        : { attempted: true, outcome: 'pending', amount: record.amount };
    }

    try {
      const res = await this.client.post<MuzoboxRefundResponse>(
        `proxy-payments/${record.muzoboxPaymentId}/refund`,
        {
          amount: record.amount,
          reason,
          referenceId: record.id,
        },
        { headers },
      );
      const body = res.data ?? {};
      const refundId =
        body.razorpayRefundId ??
        body.razorpay_refund_id ??
        body.id ??
        undefined;
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: {
          refundStatus: 'SUCCEEDED',
          razorpayRefundId: refundId,
          refundAmount: record.amount,
          refundedAt: new Date(),
          refundResponse: body as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(
        `Refund succeeded jid=${jid} ref=${record.id} refund=${refundId ?? 'n/a'}`,
      );
      return {
        attempted: true,
        outcome: 'succeeded',
        amount: record.amount,
        refundId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: { refundStatus: 'FAILED', refundError: msg.slice(0, 1000) },
      });
      this.logger.warn(`Refund failed jid=${jid} ref=${record.id}: ${msg}`);
      return { attempted: true, outcome: 'failed', amount: record.amount };
    }
  }
}
