import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { FailedDeliveryRefundService } from './failed-delivery-refund.service';

const integration = process.env.NOTIFICATION_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration('daily failed-delivery refund PostgreSQL contract', () => {
  let db: PrismaService;
  const originalUrl = process.env.DATABASE_URL;
  const originalSsl = process.env.DATABASE_SSL;

  beforeAll(async () => {
    const url = new URL(process.env.NOTIFICATION_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Refund integration tests require local PostgreSQL');
    }
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_SSL = 'false';
    db = new PrismaService();
    await db.$connect();
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (originalSsl === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = originalSsl;
  });

  async function rollback(
    work: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const marker = new Error('rollback refund test fixtures');
    try {
      await db.$transaction(
        async (tx) => {
          await work(tx);
          throw marker;
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (error !== marker) throw error;
    }
  }

  async function fixture(
    tx: Prisma.TransactionClient,
    options: {
      paymentStatus?: 'PAID' | 'PENDING' | 'FAILED';
      refundStatus?: 'NONE' | 'INITIATED' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
      email?: string | null;
      mobile?: string | null;
      taskStatus?: string;
      emailStatus?: string | null;
      whatsappStatus?: string | null;
      emailNotifiedAt?: Date | null;
      whatsappNotifiedAt?: Date | null;
      extraPendingTask?: boolean;
    } = {},
  ) {
    const journeyRequestId = randomUUID();
    const payment = await tx.chartAlertPayment.create({
      data: {
        status: options.paymentStatus ?? 'PAID',
        amount: 10,
        journeyPayload: {},
        journeyRequestId,
        refundStatus: options.refundStatus ?? 'NONE',
        contactEmail:
          options.email === undefined
            ? `${journeyRequestId}@example.invalid`
            : options.email,
      },
    });
    await tx.journeyMonitorContact.create({
      data: {
        journeyRequestId,
        email:
          options.email === undefined
            ? `${journeyRequestId}@example.invalid`
            : options.email,
        mobile: options.mobile === undefined ? '919999999999' : options.mobile,
      },
    });
    await tx.chartTimeAvailabilityTask.create({
      data: {
        journeyRequestId,
        trainNumber: '12665',
        fromStationCode: 'RJY',
        toStationCode: 'DG',
        stationCode: 'RJY',
        journeyDate: new Date('2026-09-29'),
        chartAt: new Date('2026-09-29T00:05:00Z'),
        status: options.taskStatus ?? 'completed',
        completedAt: new Date('2026-09-29T00:10:00Z'),
        emailStatus: options.emailStatus ?? 'unsend',
        whatsappStatus: options.whatsappStatus ?? 'unsend',
        emailNotifiedAt: options.emailNotifiedAt ?? null,
        whatsappNotifiedAt: options.whatsappNotifiedAt ?? null,
      },
    });
    if (options.extraPendingTask) {
      await tx.chartTimeAvailabilityTask.create({
        data: {
          journeyRequestId,
          trainNumber: '12665',
          fromStationCode: 'RJY',
          toStationCode: 'DG',
          stationCode: 'RJY',
          journeyDate: new Date('2026-09-29'),
          chartAt: new Date('2026-09-29T02:05:00Z'),
          status: 'pending',
          emailStatus: null,
          whatsappStatus: null,
        },
      });
    }
    return { journeyRequestId, payment };
  }

  function serviceFor(tx: Prisma.TransactionClient, emailSent = true) {
    const refunds = {
      initiateRefundForJourney: jest.fn().mockResolvedValue({
        attempted: true,
        outcome: 'succeeded',
        amount: 10,
        refundId: 'refund-test',
      }),
    };
    const notifications = {
      sendAutomaticDeliveryFailureRefundEmail: jest
        .fn()
        .mockResolvedValue(emailSent),
    };
    return {
      refunds,
      notifications,
      service: new FailedDeliveryRefundService(
        tx as never,
        refunds as never,
        notifications as never,
      ),
    };
  }

  it('refunds only after both channels are terminally failed', async () =>
    rollback(async (tx) => {
      const target = await fixture(tx);
      const { service, refunds, notifications } = serviceFor(tx);
      await service.runDailyAudit(500);
      expect(refunds.initiateRefundForJourney).toHaveBeenCalledWith(
        target.journeyRequestId,
        'notification_delivery_failed_email_and_whatsapp',
        { allowChartPreparedOnly: true },
      );
      expect(
        notifications.sendAutomaticDeliveryFailureRefundEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          trainNumber: '12665',
          journeyDate: '2026-09-29',
          amount: 10,
        }),
      );
      const payment = await tx.chartAlertPayment.findUniqueOrThrow({
        where: { id: target.payment.id },
      });
      expect(payment.deliveryFailureDetectedAt).not.toBeNull();
      expect(payment.deliveryFailureRefundNotifiedAt).not.toBeNull();
      expect(payment.deliveryFailureNotificationAttempts).toBe(1);
    }));

  it.each([
    ['email succeeded', { emailStatus: 'sent', emailNotifiedAt: new Date() }],
    [
      'WhatsApp succeeded',
      { whatsappStatus: 'sent', whatsappNotifiedAt: new Date() },
    ],
    ['payment is pending', { paymentStatus: 'PENDING' as const }],
    ['email is missing', { email: null }],
    ['mobile is missing', { mobile: null }],
    ['another chart is pending', { extraPendingTask: true }],
  ])('ignores the journey when %s', async (_label, options) =>
    rollback(async (tx) => {
      const target = await fixture(tx, options);
      const { service, refunds } = serviceFor(tx);
      await service.runDailyAudit(500);
      expect(refunds.initiateRefundForJourney).not.toHaveBeenCalledWith(
        target.journeyRequestId,
        expect.anything(),
        expect.anything(),
      );
    }),
  );

  it('retries only the customer email after a refund succeeded', async () =>
    rollback(async (tx) => {
      const target = await fixture(tx);
      const first = serviceFor(tx, false);
      await first.service.runDailyAudit(500);
      let payment = await tx.chartAlertPayment.findUniqueOrThrow({
        where: { id: target.payment.id },
      });
      expect(payment.deliveryFailureRefundNotifiedAt).toBeNull();
      expect(payment.deliveryFailureNotificationAttempts).toBe(1);

      const second = serviceFor(tx, true);
      await second.service.runDailyAudit(500);
      expect(second.refunds.initiateRefundForJourney).toHaveBeenCalledTimes(1);
      expect(
        second.notifications.sendAutomaticDeliveryFailureRefundEmail,
      ).toHaveBeenCalledTimes(1);
      payment = await tx.chartAlertPayment.findUniqueOrThrow({
        where: { id: target.payment.id },
      });
      expect(payment.deliveryFailureRefundNotifiedAt).not.toBeNull();
      expect(payment.deliveryFailureNotificationAttempts).toBe(2);

      const third = serviceFor(tx, true);
      await third.service.runDailyAudit(500);
      expect(third.refunds.initiateRefundForJourney).not.toHaveBeenCalledWith(
        target.journeyRequestId,
        expect.anything(),
        expect.anything(),
      );
    }));

  it('communicates an existing idempotent refund without moving money again', async () =>
    rollback(async (tx) => {
      const target = await fixture(tx, { refundStatus: 'SUCCEEDED' });
      const { service, refunds, notifications } = serviceFor(tx, true);
      await service.runDailyAudit(500);
      expect(refunds.initiateRefundForJourney).toHaveBeenCalledWith(
        target.journeyRequestId,
        expect.anything(),
        { allowChartPreparedOnly: true },
      );
      expect(
        notifications.sendAutomaticDeliveryFailureRefundEmail,
      ).toHaveBeenCalledTimes(1);
    }));
});
