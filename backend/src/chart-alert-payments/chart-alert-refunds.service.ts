import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayClient } from './razorpay.client';
import type { RefundInfo } from '../notification/notification.helpers';

/**
 * Standalone refund client (no JourneyTask dep so JourneyTaskService can
 * inject it without a circular dependency). Refunds directly via the
 * Razorpay Refunds API against the captured payment stored on the row.
 */
@Injectable()
export class ChartAlertRefundsService {
  private readonly logger = new Logger(ChartAlertRefundsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private razorpay: RazorpayClient,
  ) {}

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
    if (!record.razorpayPaymentId) {
      this.logger.warn(
        `Refund skipped for jid=${jid}: no captured Razorpay payment on record`,
      );
      return { attempted: false, outcome: 'skipped' };
    }
    if (!this.razorpay.isConfigured) {
      this.logger.warn(`Refund skipped for jid=${jid}: Razorpay not configured`);
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
      const refund = await this.razorpay.createRefund({
        paymentId: record.razorpayPaymentId,
        amountPaise: record.amount * 100,
        notes: { chart_alert_ref: record.id, reason: reason.slice(0, 200) },
      });
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
}
