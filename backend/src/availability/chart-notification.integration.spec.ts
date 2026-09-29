import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from './journey-task.service';
import { NotificationDeduplicationService } from '../notification/notification-deduplication.service';

// Opt in explicitly. All fixtures and service writes are rolled back; never use production.
const integration = process.env.NOTIFICATION_TEST_DATABASE_URL
  ? describe
  : describe.skip;
integration('chart notification PostgreSQL contract', () => {
  let db: PrismaService;
  const originalUrl = process.env.DATABASE_URL;
  const originalSsl = process.env.DATABASE_SSL;
  beforeAll(async () => {
    const url = new URL(process.env.NOTIFICATION_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error(
        'Notification integration tests require local PostgreSQL',
      );
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
    const marker = new Error('rollback test fixtures');
    try {
      await db.$transaction(
        async (tx) => {
          await work(tx);
          throw marker;
        },
        { timeout: 15000 },
      );
    } catch (error) {
      if (error !== marker) throw error;
    }
  }

  async function fixture(
    tx: Prisma.TransactionClient,
    overrides: Prisma.ChartTimeAvailabilityTaskUncheckedUpdateInput = {},
  ) {
    const journeyRequestId = randomUUID();
    await tx.journeyMonitorContact.create({
      data: {
        journeyRequestId,
        email: `${journeyRequestId}@example.invalid`,
        mobile: '919999999999',
      },
    });
    const task = await tx.chartTimeAvailabilityTask.create({
      data: {
        journeyRequestId,
        trainNumber: '12665',
        fromStationCode: 'RJY',
        stationCode: 'RJY',
        toStationCode: 'DG',
        journeyDate: new Date(),
        chartAt: new Date(Date.now() - 3600_000),
        chartNumber: 2,
        createdAt: new Date(Date.now() - 30 * 86400_000),
        completedAt: new Date(Date.now() - 600_000),
        status: 'completed',
        resultPayload: { status: 'success' },
      },
    });
    return tx.chartTimeAvailabilityTask.update({
      where: { id: task.id },
      data: overrides,
    });
  }

  async function paymentFor(
    tx: Prisma.TransactionClient,
    journeyRequestId: string,
    status: 'PAID' | 'PENDING' | 'FAILED' = 'PAID',
  ) {
    await tx.chartAlertPayment.create({
      data: {
        journeyRequestId,
        status,
        amount: 10,
        journeyPayload: {},
        createdAt: new Date(Date.now() - 30 * 86400_000),
        paidAt:
          status === 'PAID' ? new Date(Date.now() - 30 * 86400_000) : null,
      },
    });
  }

  function resendService(
    tx: Prisma.TransactionClient,
    ids: string[],
    suppressed = false,
  ) {
    const notification = {
      notifyUser: jest.fn().mockResolvedValue(
        suppressed
          ? {
              emailSent: false,
              whatsappSent: false,
              emailSuppressed: true,
              whatsappSuppressed: true,
            }
          : { emailSent: true, whatsappSent: true },
      ),
    };
    // Keep queries inside our fixtures even when the developer DB contains unrelated tasks.
    const scoped = {
      ...tx,
      $queryRaw: tx.$queryRaw.bind(tx),
      chartTimeAvailabilityTask: {
        ...tx.chartTimeAvailabilityTask,
        findMany: (args: Prisma.ChartTimeAvailabilityTaskFindManyArgs) =>
          tx.chartTimeAvailabilityTask.findMany({
            ...args,
            where: { AND: [args.where ?? {}, { id: { in: ids } }] },
          }),
      },
    };
    return {
      notification,
      service: new JourneyTaskService(
        scoped as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        notification as never,
        {} as never,
      ),
    };
  }

  it('persists the exact two RJY chart instants in PostgreSQL as UTC-valued timestamps', async () =>
    rollback(async (tx) => {
      const prisma = {
        ...tx,
        $transaction: (operations: Promise<unknown>[]) =>
          Promise.all(operations),
      };
      const service = new JourneyTaskService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const journeyRequestId = randomUUID();
      await service.createJourneyTasks(
        {
          trainNumber: '12665',
          fromStationCode: 'RJY',
          toStationCode: 'DG',
          journeyDate: '2026-09-29',
          classCode: 'SL',
          email: `${journeyRequestId}@example.invalid`,
          chartTimeLocal: '19:08',
          chartOneDayOffset: 0,
          chartTwoTimeLocal: '05:35',
          chartTwoDayOffset: 1,
        },
        {
          journeyRequestId,
          validatedContext: {
            trainNumber: '12665',
            fromCode: 'RJY',
            toCode: 'DG',
            jYmd: '2026-09-29',
            trainStartDate: '2026-09-28',
            stationsToProcess: ['RJY'],
            schedule: {
              trainNumber: '12665',
              trainName: 'HWH CAPE SF EXP',
              stationFrom: 'HWH',
              stationTo: 'CAPE',
              stationList: [],
            },
          },
        },
      );
      const rows = await tx.$queryRaw<
        Array<{ chart_at: string; chart_number: number }>
      >`
      SELECT chart_at::text, chart_number FROM "ChartTimeAvailabilityTask"
      WHERE journey_request_id = ${journeyRequestId} ORDER BY chart_number`;
      expect(rows).toEqual([
        { chart_at: '2026-09-28 13:38:00', chart_number: 1 },
        { chart_at: '2026-09-29 00:05:00', chart_number: 2 },
      ]);
    }));

  it('allows exactly eight paid retries after the initial failed attempt, then stops both channels', async () =>
    rollback(async (tx) => {
      const task = await fixture(tx, {
        emailRetryCount: 1,
        whatsappRetryCount: 1,
        emailStatus: 'pending_retry',
        whatsappStatus: 'pending_retry',
      });
      await paymentFor(tx, task.journeyRequestId);
      const { service, notification } = resendService(tx, [task.id]);
      notification.notifyUser.mockResolvedValue({
        emailSent: false,
        whatsappSent: false,
      });
      for (let retry = 1; retry <= 8; retry++) {
        // Model independent cron ticks, each after the five-minute cooldown.
        await tx.chartTimeAvailabilityTask.update({
          where: { id: task.id },
          data: { notificationLastAttemptAt: new Date(Date.now() - 300_001) },
        });
        await expect(
          service.resendFailedWhatsAppNotifications(),
        ).resolves.toEqual({ found: 1, resent: 0, failed: 1 });
        const stored = await tx.chartTimeAvailabilityTask.findUniqueOrThrow({
          where: { id: task.id },
        });
        expect(stored.emailRetryCount).toBe(retry + 1);
        expect(stored.whatsappRetryCount).toBe(retry + 1);
        expect(stored.emailStatus).toBe(
          retry === 8 ? 'unsend' : 'pending_retry',
        );
        expect(stored.whatsappStatus).toBe(
          retry === 8 ? 'unsend' : 'pending_retry',
        );
      }
      await tx.chartTimeAvailabilityTask.update({
        where: { id: task.id },
        data: { notificationLastAttemptAt: null },
      });
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 0, resent: 0, failed: 0 });
      expect(notification.notifyUser).toHaveBeenCalledTimes(8);
    }));

  it.each(['PENDING', 'FAILED'] as const)(
    'does not grant the paid retry budget to a %s payment',
    async (status) =>
      rollback(async (tx) => {
        const task = await fixture(tx, {
          emailRetryCount: 3,
          whatsappRetryCount: 3,
          emailStatus: 'unsend',
          whatsappStatus: 'unsend',
        });
        await paymentFor(tx, task.journeyRequestId, status);
        const { service, notification } = resendService(tx, [task.id]);
        await expect(
          service.resendFailedWhatsAppNotifications(),
        ).resolves.toEqual({ found: 0, resent: 0, failed: 0 });
        expect(notification.notifyUser).not.toHaveBeenCalled();
      }),
  );

  it('makes a paid retry eligible at five minutes, but not at four minutes 59 seconds', async () =>
    rollback(async (tx) => {
      const started = Date.now();
      const task = await fixture(tx, {
        notificationLastAttemptAt: new Date(started),
        emailRetryCount: 1,
        whatsappRetryCount: 1,
      });
      await paymentFor(tx, task.journeyRequestId);
      const { service } = resendService(tx, [task.id]);
      const clock = jest.spyOn(Date, 'now');
      try {
        clock.mockReturnValue(started + 299_000);
        await expect(
          service.resendFailedWhatsAppNotifications(),
        ).resolves.toEqual({ found: 0, resent: 0, failed: 0 });
        clock.mockReturnValue(started + 300_000);
        await expect(
          service.resendFailedWhatsAppNotifications(),
        ).resolves.toEqual({ found: 1, resent: 1, failed: 0 });
      } finally {
        clock.mockRestore();
      }
    }));

  it('keeps suppressed and accepted paid channels out of recovery', async () =>
    rollback(async (tx) => {
      const task = await fixture(tx, {
        emailRetryCount: 7,
        whatsappRetryCount: 7,
        emailStatus: 'suppressed',
        whatsappNotifiedAt: new Date(),
        whatsappStatus: 'sent',
      });
      await paymentFor(tx, task.journeyRequestId);
      const { service, notification } = resendService(tx, [task.id]);
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 0, resent: 0, failed: 0 });
      expect(notification.notifyUser).not.toHaveBeenCalled();
    }));

  it('filters exhausted free tasks before taking the batch and resumes paid tasks exhausted under the old limit', async () =>
    rollback(async (tx) => {
      const free = await Promise.all(
        Array.from({ length: 51 }, () =>
          fixture(tx, {
            emailRetryCount: 3,
            whatsappRetryCount: 3,
            emailStatus: 'unsend',
            whatsappStatus: 'unsend',
          }),
        ),
      );
      const paid = await fixture(tx, {
        emailRetryCount: 3,
        whatsappRetryCount: 3,
        emailStatus: 'unsend',
        whatsappStatus: 'unsend',
      });
      await paymentFor(tx, paid.journeyRequestId);
      const { service, notification } = resendService(tx, [
        ...free.map((t) => t.id),
        paid.id,
      ]);
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 1, resent: 1, failed: 0 });
      expect(notification.notifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({ id: paid.id }),
        }),
      );
    }));

  it('recovers recently completed subscriptions purchased a month earlier, including NULL statuses', async () =>
    rollback(async (tx) => {
      const task = await fixture(tx);
      const { service, notification } = resendService(tx, [task.id]);
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 1, resent: 1, failed: 0 });
      expect(notification.notifyUser).toHaveBeenCalledTimes(1);
      const stored = await tx.chartTimeAvailabilityTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(stored.emailStatus).toBe('sent');
      expect(stored.whatsappStatus).toBe('sent');
      expect(stored.emailNotifiedAt).not.toBeNull();
    }));

  it('persists suppression without consuming attempts and excludes it on the next tick', async () =>
    rollback(async (tx) => {
      const task = await fixture(tx);
      const { service } = resendService(tx, [task.id], true);
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 1, resent: 0, failed: 0 });
      const stored = await tx.chartTimeAvailabilityTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(stored).toMatchObject({
        emailStatus: 'suppressed',
        whatsappStatus: 'suppressed',
        emailRetryCount: 0,
        whatsappRetryCount: 0,
        emailNotifiedAt: null,
        whatsappNotifiedAt: null,
      });
      await tx.chartTimeAvailabilityTask.update({
        where: { id: task.id },
        data: { notificationLastAttemptAt: null },
      });
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 0, resent: 0, failed: 0 });
    }));

  it('excludes exhausted or cooling-down notifications', async () =>
    rollback(async (tx) => {
      const exhausted = await fixture(tx, {
        emailRetryCount: 3,
        whatsappRetryCount: 3,
      });
      const cooling = await fixture(tx, {
        notificationLastAttemptAt: new Date(),
      });
      const { service, notification } = resendService(tx, [
        exhausted.id,
        cooling.id,
      ]);
      await expect(
        service.resendFailedWhatsAppNotifications(),
      ).resolves.toEqual({ found: 0, resent: 0, failed: 0 });
      expect(notification.notifyUser).not.toHaveBeenCalled();
    }));

  it('deduplicates the same event permanently while allowing the second chart and the other channel', async () =>
    rollback(async (tx) => {
      const service = new NotificationDeduplicationService(tx as never);
      const event = {
        recipient: `${randomUUID()}@example.invalid`,
        channel: 'email' as const,
        trainNumber: '12665',
        journeyDate: new Date('2026-09-29'),
        chartAt: new Date('2026-09-28T13:38:00Z'),
        notificationType: 'no_seats' as const,
      };
      await service.recordNotificationSent(event);
      await expect(
        service.shouldSendNotification({ ...event, windowHours: 0 }),
      ).resolves.toBe(false);
      await expect(
        service.shouldSendNotification({
          ...event,
          chartAt: new Date('2026-09-29T00:05:00Z'),
        }),
      ).resolves.toBe(true);
      await expect(
        service.shouldSendNotification({ ...event, channel: 'whatsapp' }),
      ).resolves.toBe(true);
      await expect(
        service.shouldSendNotification({
          ...event,
          chartAt: undefined,
          notificationType: 'alt_trains',
        }),
      ).resolves.toBe(true);
      await expect(
        service.shouldSendNotification({
          ...event,
          notificationType: 'check_failed',
        }),
      ).resolves.toBe(false);
    }));
});
