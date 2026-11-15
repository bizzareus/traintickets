import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailBouncedEvent } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import { ChartAlertRefundsService } from '../chart-alert-payments/chart-alert-refunds.service';
import type { RefundInfo } from '../notification/notification.helpers';
import { DEFAULT_MONITORING_ADMIN_EMAIL } from '../notification/notification.service';

/**
 * Subjects NotificationService sends to chart-alert contacts — confirmation,
 * seats/no-ticket results, alternate trains, chart-prepared. Used to validate
 * that a bounced email actually was a chart alert before refunding; bounces of
 * unrelated mail (marketing, booking handoff, admin reports) never refund.
 */
const CHART_ALERT_SUBJECT_RE =
  /chart alert|seats available|alternate trains available|no tickets found|chart prepared/i;

/** Bounces land seconds after send, so correlation only needs a short window. */
const CORRELATION_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_JOURNEYS_PER_BOUNCE = 5;

export type BounceRefundOutcome =
  | 'refunded'
  | 'refund_pending'
  | 'refund_failed'
  | 'skipped';

export type BounceRefundResult = {
  outcome: BounceRefundOutcome;
  /** Journey request ids refunded by this event (already-refunded included). */
  journeys: string[];
  detail?: string;
};

/**
 * Resend `email.bounced` handler for chart alerts. Correlates the bounced
 * recipient back to recently-sent chart alert mail — chart-time task emails
 * (emailStatus=sent within the window) or the payment confirmation email —
 * then refunds the paid alert through the shared idempotent refund service.
 */
@Injectable()
export class ResendWebhookService {
  private readonly logger = new Logger(ResendWebhookService.name);
  private readonly adminEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: ChartAlertRefundsService,
    configService: ConfigService,
  ) {
    this.adminEmail =
      configService
        .get<string>('MONITORING_ADMIN_EMAIL')
        ?.trim()
        .toLowerCase() || DEFAULT_MONITORING_ADMIN_EMAIL;
  }

  async handleBounce(event: EmailBouncedEvent): Promise<BounceRefundResult> {
    const recipient = String(event?.data?.to?.[0] ?? '')
      .trim()
      .toLowerCase();
    if (!recipient) return this.skip('bounce has no recipient');
    // The admin copy is Bcc'd on every email; its bounces must not refund users.
    if (recipient === this.adminEmail) {
      return this.skip('bounced recipient is the admin Bcc copy');
    }

    const subject = String(event?.data?.subject ?? '');
    if (!CHART_ALERT_SUBJECT_RE.test(subject)) {
      return this.skip(
        `subject is not a chart alert email: ${subject.slice(0, 120)}`,
      );
    }

    const journeyRequestIds =
      await this.resolvePaidJourneyRequestIds(recipient);
    if (!journeyRequestIds.length) {
      return this.skip(`no recent paid chart alert for ${recipient}`);
    }

    const reason = [
      'email_bounce',
      event?.data?.bounce?.type ?? 'unknown',
      event?.data?.bounce?.subType,
      event?.data?.email_id,
    ]
      .filter(Boolean)
      .join(':');

    const outcomes: RefundInfo['outcome'][] = [];
    const journeys: string[] = [];
    for (const journeyRequestId of journeyRequestIds) {
      const refund = await this.refunds.initiateRefundForJourney(
        journeyRequestId,
        reason,
        // A bounced email is a definitive delivery failure of a paid alert.
        { allowChartPreparedOnly: true },
      );
      outcomes.push(refund.outcome);
      if (refund.outcome === 'succeeded') journeys.push(journeyRequestId);
    }

    const outcome = aggregateRefundOutcome(outcomes);
    this.logger.log(
      `Resend bounce for ${recipient}: ${outcome} journeys=[${journeyRequestIds.join(',')}]`,
    );
    return { outcome, journeys };
  }

  /**
   * Journeys behind a paid chart alert whose mail recently went to this
   * recipient: chart-time alert tasks sent within the window, plus payment
   * confirmation email sends. Distinct and capped — a contact rarely has more
   * than one active journey.
   */
  private async resolvePaidJourneyRequestIds(
    recipient: string,
  ): Promise<string[]> {
    const since = new Date(Date.now() - CORRELATION_WINDOW_MS);
    const [tasks, payments] = await Promise.all([
      this.prisma.chartTimeAvailabilityTask.findMany({
        where: {
          emailStatus: 'sent',
          emailNotifiedAt: { gte: since },
          contact: { email: { equals: recipient, mode: 'insensitive' } },
        },
        orderBy: { emailNotifiedAt: 'desc' },
        select: { journeyRequestId: true },
        take: MAX_JOURNEYS_PER_BOUNCE,
      }),
      this.prisma.chartAlertPayment.findMany({
        where: {
          status: 'PAID',
          journeyRequestId: { not: null },
          contactEmail: { equals: recipient, mode: 'insensitive' },
          OR: [
            { paidAt: { gte: since } },
            { confirmationSentAt: { gte: since } },
          ],
        },
        orderBy: { paidAt: 'desc' },
        select: { journeyRequestId: true },
        take: MAX_JOURNEYS_PER_BOUNCE,
      }),
    ]);
    return [
      ...new Set(
        [...tasks, ...payments]
          .map((row) => row.journeyRequestId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private skip(detail: string): BounceRefundResult {
    this.logger.log(`Resend bounce skipped: ${detail}`);
    return { outcome: 'skipped', journeys: [], detail };
  }
}

function aggregateRefundOutcome(
  outcomes: RefundInfo['outcome'][],
): BounceRefundOutcome {
  if (outcomes.includes('succeeded')) return 'refunded';
  if (outcomes.includes('pending')) return 'refund_pending';
  if (outcomes.includes('failed')) return 'refund_failed';
  return 'skipped';
}
