import { ResendWebhookService } from './resend-webhook.service';
import type { EmailBouncedEvent } from 'resend';

const BOUNCED_RECIPIENT = 'clement85chettiar@gmail.con';

function bounceEvent(
  overrides: Partial<EmailBouncedEvent> & {
    to?: string[];
    subject?: string;
  } = {},
): EmailBouncedEvent {
  const { to, subject, ...rest } = overrides;
  return {
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: {
      created_at: new Date().toISOString(),
      email_id: '01a1d55a-e77f-7247-8759-93303ba428fc',
      from: 'LastBerth Notifications <notification@lastberth.com>',
      to: to ?? [BOUNCED_RECIPIENT],
      subject: subject ?? '🔔 Chart Alert Confirmed: Ltt Karaikal Exp (11017)',
      bounce: {
        message: 'general bounce',
        subType: 'General',
        type: 'Transient',
      },
    },
    ...rest,
  } as EmailBouncedEvent;
}

describe('ResendWebhookService', () => {
  const prisma = {
    chartTimeAvailabilityTask: { findMany: jest.fn() },
    chartAlertPayment: { findMany: jest.fn() },
  };
  const refunds = { initiateRefundForJourney: jest.fn() };
  let service: ResendWebhookService;

  const refundResult = (outcome: string) => ({
    attempted: outcome !== 'skipped',
    outcome,
    amount: 5,
    refundId: 'refund-1',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chartTimeAvailabilityTask.findMany.mockResolvedValue([]);
    prisma.chartAlertPayment.findMany.mockResolvedValue([]);
    refunds.initiateRefundForJourney.mockResolvedValue(
      refundResult('succeeded'),
    );
    service = new ResendWebhookService(
      prisma as never,
      refunds as never,
      { get: () => undefined } as never,
    );
  });

  it('refunds a recent chart-time alert bounce via the task correlation', async () => {
    prisma.chartTimeAvailabilityTask.findMany.mockResolvedValue([
      { journeyRequestId: 'journey-1' },
    ]);

    await expect(service.handleBounce(bounceEvent())).resolves.toEqual({
      outcome: 'refunded',
      journeys: ['journey-1'],
    });
    expect(refunds.initiateRefundForJourney).toHaveBeenCalledWith(
      'journey-1',
      expect.stringMatching(
        /^email_bounce:Transient:General:01a1d55a-e77f-7247/,
      ),
      { allowChartPreparedOnly: true },
    );
  });

  it('falls back to the payment confirmation correlation when no task sent recently', async () => {
    prisma.chartAlertPayment.findMany.mockResolvedValue([
      { journeyRequestId: 'journey-2' },
    ]);

    await expect(service.handleBounce(bounceEvent())).resolves.toEqual({
      outcome: 'refunded',
      journeys: ['journey-2'],
    });
    expect(prisma.chartAlertPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });

  it('deduplicates journeys matched by both correlations and refunds each once', async () => {
    prisma.chartTimeAvailabilityTask.findMany.mockResolvedValue([
      { journeyRequestId: 'journey-1' },
      { journeyRequestId: 'journey-1' },
      { journeyRequestId: 'journey-2' },
    ]);
    prisma.chartAlertPayment.findMany.mockResolvedValue([
      { journeyRequestId: 'journey-2' },
    ]);

    await expect(service.handleBounce(bounceEvent())).resolves.toEqual({
      outcome: 'refunded',
      journeys: ['journey-1', 'journey-2'],
    });
    expect(refunds.initiateRefundForJourney).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['pending', 'refund_pending'],
    ['failed', 'refund_failed'],
    ['skipped', 'skipped'],
  ])('maps refund outcome %s to %s', async (refundOutcome, expected) => {
    prisma.chartTimeAvailabilityTask.findMany.mockResolvedValue([
      { journeyRequestId: 'journey-1' },
    ]);
    refunds.initiateRefundForJourney.mockResolvedValue(
      refundResult(refundOutcome),
    );

    await expect(service.handleBounce(bounceEvent())).resolves.toMatchObject({
      outcome: expected,
      journeys: [],
    });
  });

  it('skips bounces of emails that are not chart alerts', async () => {
    const result = await service.handleBounce(
      bounceEvent({ subject: 'Complete your booking for Train 11017' }),
    );

    expect(result).toMatchObject({ outcome: 'skipped', journeys: [] });
    expect(refunds.initiateRefundForJourney).not.toHaveBeenCalled();
    expect(prisma.chartTimeAvailabilityTask.findMany).not.toHaveBeenCalled();
  });

  it('skips bounces of the admin Bcc copy', async () => {
    const result = await service.handleBounce(
      bounceEvent({ to: ['me@kartikarora.in'] }),
    );

    expect(result).toMatchObject({ outcome: 'skipped' });
    expect(refunds.initiateRefundForJourney).not.toHaveBeenCalled();
  });

  it('skips when the recipient matches no recent paid chart alert', async () => {
    const result = await service.handleBounce(bounceEvent());

    expect(result).toMatchObject({ outcome: 'skipped' });
    expect(refunds.initiateRefundForJourney).not.toHaveBeenCalled();
  });

  it('skips events without a recipient', async () => {
    const result = await service.handleBounce(bounceEvent({ to: [] }));

    expect(result).toMatchObject({ outcome: 'skipped' });
    expect(prisma.chartTimeAvailabilityTask.findMany).not.toHaveBeenCalled();
  });

  it('matches recipients case-insensitively', async () => {
    prisma.chartTimeAvailabilityTask.findMany.mockResolvedValue([
      { journeyRequestId: 'journey-1' },
    ]);

    await service.handleBounce(
      bounceEvent({ to: ['Clement85Chettiar@GMAIL.con'] }),
    );

    expect(prisma.chartTimeAvailabilityTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contact: {
            email: { equals: BOUNCED_RECIPIENT, mode: 'insensitive' },
          },
        }),
      }),
    );
  });
});
