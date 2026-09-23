import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { ChartAlertPayment } from '@prisma/client';
import { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { RazorpayClient } from './razorpay.client';
import type { RefundInfo } from '../notification/notification.helpers';

const DEFAULT_MUZOBOX_API_URL =
  'https://ai-jukebox-backend-production.up.railway.app/api';

/** Shape of POST proxy-payments/:id/refund on the Muzobox proxy API. */
interface MuzoboxRefundResponse {
  status?: string;
  amount?: number;
  referenceId?: string | null;
  razorpayPaymentId?: string | null;
  razorpayRefundId?: string;
  refundedAt?: string;
}

/**
 * Standalone refund client (no JourneyTask dep so JourneyTaskService can
 * inject it without a circular dependency). Muzobox-routed payments are
 * refunded via the Muzobox proxy refund API (keyed by muzoboxPaymentId);
 * direct-Razorpay payments are refunded via the Razorpay Refunds API
 * against the captured payment stored on the row.
 */
@Injectable()
export class ChartAlertRefundsService {
  private readonly logger = new Logger(ChartAlertRefundsService.name);
  private readonly muzoboxClient: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private razorpay: RazorpayClient,
  ) {
    // No retries on POST: this client only moves money (refund), never polls.
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

  private muzoboxAuthHeaders(): Record<string, string> | undefined {
    const key = this.configService.get<string>('MUZOBOX_PROXY_API_KEY')?.trim();
    return key ? { 'x-api-key': key } : undefined;
  }

  private get autoRefundEnabled(): boolean {
    const raw = this.configService
      .get<string>('ENABLE_AUTO_REFUND')
      ?.trim()
      .toLowerCase();
    return raw !== 'false';
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
    if (!record.razorpayPaymentId && !record.muzoboxPaymentId) {
      this.logger.warn(
        `Refund skipped for jid=${jid}: no captured Razorpay payment on record`,
      );
      return { attempted: false, outcome: 'skipped' };
    }
    // Proxy-routed payments were captured under Muzobox's Razorpay account,
    // so our own Razorpay credentials cannot refund them — the Muzobox
    // proxy refund API must be used instead (no local Razorpay config needed).
    if (!record.muzoboxPaymentId && !this.razorpay.isConfigured) {
      this.logger.warn(
        `Refund skipped for jid=${jid}: Razorpay not configured`,
      );
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
      const muzoboxPaymentId = record.muzoboxPaymentId?.trim() || null;
      if (muzoboxPaymentId) {
        return await this.refundViaMuzoboxProxy(
          record,
          muzoboxPaymentId,
          reason,
        );
      }
      const refund = await this.refundDirectViaRazorpay(record, reason);
      const refundId = refund.id;
      await this.prisma.chartAlertPayment.update({
        where: { id: record.id },
        data: {
          refundStatus: 'SUCCEEDED',
          razorpayRefundId: refundId,
          refundAmount: record.amount,
          refundedAt: new Date(),
          refundResponse: { id: refundId } as unknown as Prisma.InputJsonValue,
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

  /**
   * Refund a Muzobox-routed payment via the proxy refund API, keyed by the
   * Muzobox payment id stored on the row. Persists the proxy response
   * (status, Razorpay refund id, amount, timestamp) so the admin dashboard
   * reflects exactly what Muzobox reported. `already_refunded` counts as
   * success and backfills any refund details we were missing.
   */
  private async refundViaMuzoboxProxy(
    record: ChartAlertPayment,
    muzoboxPaymentId: string,
    reason: string,
  ): Promise<RefundInfo> {
    let data: MuzoboxRefundResponse;
    try {
      const res = await this.muzoboxClient.post<MuzoboxRefundResponse>(
        `proxy-payments/${encodeURIComponent(muzoboxPaymentId)}/refund`,
        {
          amount: record.amount,
          reason: reason.slice(0, 500),
          referenceId: record.id,
        },
        { headers: this.muzoboxAuthHeaders() },
      );
      data = res.data ?? {};
    } catch (err) {
      throw new Error(this.describeMuzoboxError(err));
    }
    const status = String(data.status ?? '').toLowerCase();
    if (status !== 'refunded' && status !== 'already_refunded') {
      throw new Error(
        `Muzobox refund returned unexpected status=${String(data.status ?? 'missing')}`,
      );
    }
    const refundId =
      data.razorpayRefundId ?? record.razorpayRefundId ?? undefined;
    const refundAmount =
      typeof data.amount === 'number' ? data.amount : record.amount;
    const refundedAt = data.refundedAt ? new Date(data.refundedAt) : new Date();
    await this.prisma.chartAlertPayment.update({
      where: { id: record.id },
      data: {
        refundStatus: 'SUCCEEDED',
        razorpayRefundId: refundId ?? null,
        ...(data.razorpayPaymentId
          ? { razorpayPaymentId: data.razorpayPaymentId }
          : {}),
        refundAmount,
        refundedAt,
        refundResponse: data as unknown as Prisma.InputJsonValue,
        refundError: null,
      },
    });
    this.logger.log(
      `Refund via Muzobox proxy jid=${record.journeyRequestId} ref=${record.id} status=${status} refund=${refundId ?? 'n/a'}`,
    );
    return {
      attempted: true,
      outcome: 'succeeded',
      amount: refundAmount,
      refundId,
    };
  }

  /**
   * Direct Razorpay refund for non-proxy payments. The caller guarantees a
   * captured payment id exists (guarded before the single-flight claim).
   */
  private async refundDirectViaRazorpay(
    record: ChartAlertPayment,
    reason: string,
  ): Promise<{ id?: string }> {
    const paymentId = record.razorpayPaymentId;
    if (!paymentId) {
      throw new Error('No captured Razorpay payment on record');
    }
    return this.razorpay.createRefund({
      paymentId,
      amountPaise: record.amount * 100,
      notes: { chart_alert_ref: record.id, reason: reason.slice(0, 200) },
    });
  }

  /** Human-readable message from a Muzobox API failure (axios or otherwise). */
  private describeMuzoboxError(err: unknown): string {
    if (isAxiosError(err)) {
      const payload = err.response?.data as
        | { message?: unknown; error?: unknown }
        | undefined;
      const fromBody =
        (Array.isArray(payload?.message)
          ? payload?.message.join('; ')
          : payload?.message) ?? payload?.error;
      if (typeof fromBody === 'string' && fromBody.trim())
        return `Muzobox refund failed: ${fromBody.trim().slice(0, 500)}`;
      if (err.response?.status)
        return `Muzobox refund failed with HTTP ${err.response.status}`;
      return `Muzobox refund request failed: ${err.message}`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
