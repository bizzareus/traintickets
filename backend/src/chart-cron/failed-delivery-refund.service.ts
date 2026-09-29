import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChartAlertRefundsService } from '../chart-alert-payments/chart-alert-refunds.service';
import { NotificationService } from '../notification/notification.service';

type FailedDeliveryCandidate = {
  payment_id: string;
  journey_request_id: string;
  email: string;
  train_number: string;
  journey_date: Date;
  detected_at: Date | null;
};

export type FailedDeliveryRefundResult = {
  found: number;
  refunded: number;
  notified: number;
  failed: number;
  skipped: number;
};

const REFUND_REASON = 'notification_delivery_failed_email_and_whatsapp';

@Injectable()
export class FailedDeliveryRefundService {
  private readonly logger = new Logger(FailedDeliveryRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: ChartAlertRefundsService,
    private readonly notifications: NotificationService,
  ) {}

  async runDailyAudit(limit = 100): Promise<FailedDeliveryRefundResult> {
    const candidates = await this.prisma.$queryRaw<FailedDeliveryCandidate[]>`
      SELECT
        p.id AS payment_id,
        p.journey_request_id,
        COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(p.contact_email), '')) AS email,
        MIN(t.train_number) AS train_number,
        MIN(t.journey_date) AS journey_date,
        p.delivery_failure_detected_at AS detected_at
      FROM chart_alert_payment p
      JOIN "JourneyMonitorContact" c
        ON c.journey_request_id = p.journey_request_id
      JOIN "ChartTimeAvailabilityTask" t
        ON t.journey_request_id = p.journey_request_id
      WHERE p.status = 'PAID'
        AND p.journey_request_id IS NOT NULL
        AND p.delivery_failure_refund_notified_at IS NULL
        AND NULLIF(TRIM(c.email), '') IS NOT NULL
        AND NULLIF(TRIM(c.mobile), '') IS NOT NULL
        AND (
          p.delivery_failure_detected_at IS NOT NULL
          OR p.refund_status IN ('NONE', 'FAILED', 'SKIPPED', 'SUCCEEDED')
        )
      GROUP BY p.id, p.journey_request_id, c.email, p.contact_email
      HAVING COUNT(*) > 0
        AND BOOL_AND(t.status IN ('completed', 'failed'))
        AND BOOL_AND(t.email_status = 'unsend')
        AND BOOL_AND(t.whatsapp_status = 'unsend')
        AND BOOL_AND(t.email_notified_at IS NULL)
        AND BOOL_AND(t.whatsapp_notified_at IS NULL)
      ORDER BY MIN(t.completed_at) ASC NULLS LAST
      LIMIT ${Math.min(Math.max(limit, 1), 500)}
    `;
    const result: FailedDeliveryRefundResult = {
      found: candidates.length,
      refunded: 0,
      notified: 0,
      failed: 0,
      skipped: 0,
    };

    for (const candidate of candidates) {
      if (!candidate.detected_at) {
        await this.prisma.chartAlertPayment.updateMany({
          where: {
            id: candidate.payment_id,
            status: 'PAID',
            deliveryFailureDetectedAt: null,
          },
          data: { deliveryFailureDetectedAt: new Date() },
        });
      }
      const refund = await this.refunds.initiateRefundForJourney(
        candidate.journey_request_id,
        REFUND_REASON,
        { allowChartPreparedOnly: true },
      );
      if (refund.outcome !== 'succeeded') {
        if (refund.outcome === 'failed') result.failed++;
        else result.skipped++;
        continue;
      }
      result.refunded++;
      const sent =
        await this.notifications.sendAutomaticDeliveryFailureRefundEmail({
          email: candidate.email,
          trainNumber: candidate.train_number,
          journeyDate: candidate.journey_date.toISOString().slice(0, 10),
          amount: refund.amount ?? 0,
          refundId: refund.refundId,
        });
      await this.prisma.chartAlertPayment.update({
        where: { id: candidate.payment_id },
        data: {
          deliveryFailureNotificationAttempts: { increment: 1 },
          deliveryFailureNotificationError: sent
            ? null
            : 'Automatic refund email provider returned failure',
          ...(sent ? { deliveryFailureRefundNotifiedAt: new Date() } : {}),
        },
      });
      if (sent) result.notified++;
      else result.failed++;
    }

    this.logger.log(
      `Daily failed-delivery refund audit: ${JSON.stringify(result)}`,
    );
    return result;
  }
}
