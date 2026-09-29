import { FailedDeliveryRefundService } from './failed-delivery-refund.service';

describe('FailedDeliveryRefundService', () => {
  const candidate = {
    payment_id: 'payment-1',
    journey_request_id: 'journey-1',
    email: 'passenger@example.com',
    train_number: '12665',
    journey_date: new Date('2026-09-29T00:00:00Z'),
    detected_at: null,
  };
  const prisma = {
    $queryRaw: jest.fn(),
    chartAlertPayment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const refunds = { initiateRefundForJourney: jest.fn() };
  const notifications = {
    sendAutomaticDeliveryFailureRefundEmail: jest.fn(),
  };
  let service: FailedDeliveryRefundService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([candidate]);
    refunds.initiateRefundForJourney.mockResolvedValue({
      attempted: true,
      outcome: 'succeeded',
      amount: 10,
      refundId: 'refund-1',
    });
    notifications.sendAutomaticDeliveryFailureRefundEmail.mockResolvedValue(
      true,
    );
    service = new FailedDeliveryRefundService(
      prisma as never,
      refunds as never,
      notifications as never,
    );
  });

  it('refunds and emails an eligible paid journey once', async () => {
    await expect(service.runDailyAudit()).resolves.toEqual({
      found: 1,
      refunded: 1,
      notified: 1,
      failed: 0,
      skipped: 0,
    });
    expect(refunds.initiateRefundForJourney).toHaveBeenCalledWith(
      'journey-1',
      'notification_delivery_failed_email_and_whatsapp',
      { allowChartPreparedOnly: true },
    );
    expect(
      notifications.sendAutomaticDeliveryFailureRefundEmail,
    ).toHaveBeenCalledWith({
      email: 'passenger@example.com',
      trainNumber: '12665',
      journeyDate: '2026-09-29',
      amount: 10,
      refundId: 'refund-1',
    });
    expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        deliveryFailureNotificationAttempts: { increment: 1 },
        deliveryFailureNotificationError: null,
        deliveryFailureRefundNotifiedAt: expect.any(Date),
      },
    });
  });

  it('does not email when the refund failed or is pending', async () => {
    for (const outcome of ['failed', 'pending', 'skipped'] as const) {
      jest.clearAllMocks();
      prisma.$queryRaw.mockResolvedValue([candidate]);
      refunds.initiateRefundForJourney.mockResolvedValue({
        attempted: outcome !== 'skipped',
        outcome,
        amount: 10,
      });
      const result = await service.runDailyAudit();
      expect(result).toMatchObject({
        found: 1,
        refunded: 0,
        notified: 0,
        failed: outcome === 'failed' ? 1 : 0,
        skipped: outcome === 'failed' ? 0 : 1,
      });
      expect(
        notifications.sendAutomaticDeliveryFailureRefundEmail,
      ).not.toHaveBeenCalled();
    }
  });

  it('records a failed customer email so the next daily audit can retry it', async () => {
    notifications.sendAutomaticDeliveryFailureRefundEmail.mockResolvedValue(
      false,
    );
    await expect(service.runDailyAudit()).resolves.toMatchObject({
      refunded: 1,
      notified: 0,
      failed: 1,
    });
    expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        deliveryFailureNotificationAttempts: { increment: 1 },
        deliveryFailureNotificationError:
          'Automatic refund email provider returned failure',
      },
    });
  });

  it('does nothing when SQL finds no journey that failed on both channels', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.runDailyAudit()).resolves.toEqual({
      found: 0,
      refunded: 0,
      notified: 0,
      failed: 0,
      skipped: 0,
    });
    expect(refunds.initiateRefundForJourney).not.toHaveBeenCalled();
  });

  it('does not rewrite the detection timestamp on an email-only retry', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { ...candidate, detected_at: new Date('2026-09-29T09:00:00Z') },
    ]);
    await service.runDailyAudit();
    expect(prisma.chartAlertPayment.updateMany).not.toHaveBeenCalled();
  });
});
