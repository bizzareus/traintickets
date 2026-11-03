/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { MarketingService } from './marketing.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { NotificationService } from '../notification/notification.service';
import type { ChartCronLeaderService } from '../chart-cron/chart-cron-leader.service';
import type { PostHogAnalyticsService } from '../common/posthog-analytics.service';

describe('MarketingService', () => {
  let service: MarketingService;
  let prisma: Partial<PrismaService>;
  let config: Partial<ConfigService>;
  let notifications: Partial<NotificationService>;
  let leader: Partial<ChartCronLeaderService>;
  let posthog: Partial<PostHogAnalyticsService>;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-03T12:00:00Z') });
    prisma = {
      marketingEngineConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default',
          enabled: true,
          minAbandonedMinutes: 15,
          maxLookbackHours: 48,
        }),
        create: jest.fn(),
        upsert: jest
          .fn()
          .mockImplementation(({ update }) =>
            Promise.resolve({ id: 'default', ...update }),
          ),
      } as never,
      splitTicketBooking: {
        count: jest.fn().mockResolvedValue(10),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalFare: 5000 } }),
      } as never,
      notificationUnsubscribe: {
        findFirst: jest.fn().mockResolvedValue(null),
      } as never,
      sentNotificationLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      } as never,
      cronRunLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      } as never,
    };

    config = {
      get: jest.fn().mockReturnValue('https://lastberth.com'),
    };

    notifications = {
      sendAbandonedBookingReminder: jest.fn().mockResolvedValue(true),
    };

    leader = {
      isLeader: jest.fn().mockResolvedValue(true),
    };

    posthog = {
      capture: jest.fn(),
    };

    service = new MarketingService(
      prisma as PrismaService,
      config as ConfigService,
      notifications as NotificationService,
      leader as ChartCronLeaderService,
      posthog as PostHogAnalyticsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getConfig & updateConfig', () => {
    it('returns existing config or creates default', async () => {
      const cfg = await service.getConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.minAbandonedMinutes).toBe(15);
    });

    it('updates config correctly', async () => {
      await service.updateConfig({ enabled: false, minAbandonedMinutes: 30 });
      expect(prisma.marketingEngineConfig?.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            enabled: false,
            minAbandonedMinutes: 30,
          }),
        }),
      );
    });
  });

  describe('getStats', () => {
    it('calculates aggregate stats and recovery rate', async () => {
      (prisma.splitTicketBooking?.count as jest.Mock)
        .mockResolvedValueOnce(50) // totalAbandoned
        .mockResolvedValueOnce(20) // remindersSent
        .mockResolvedValueOnce(5); // recoveredBookings

      const stats = await service.getStats();
      expect(stats.totalAbandoned).toBe(50);
      expect(stats.remindersSent).toBe(20);
      expect(stats.recoveredBookings).toBe(5);
      expect(stats.recoveryRatePercent).toBe(25);
      expect(stats.recoveredRevenue).toBe(5000);
    });
  });

  describe('processAbandonedBookingsCron', () => {
    it.each([false, true])(
      'filters out past journey dates in IST even when force=%s',
      async (force) => {
        jest.setSystemTime(new Date('2026-11-03T18:30:00Z'));

        await service.processAbandonedBookingsCron({ force });

        expect(prisma.splitTicketBooking?.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              journeyDate: { gte: new Date('2026-11-04') },
            }),
          }),
        );
      },
    );

    it.each([
      ['PENDING', false],
      ['FAILED', false],
      ['PENDING', true],
      ['FAILED', true],
    ])(
      'never sends a past-trip reminder for %s with force=%s',
      async (paymentStatus, force) => {
        (prisma.splitTicketBooking?.findMany as jest.Mock).mockResolvedValue([
          {
            id: 'past-booking',
            bookingRef: 'LB-PAST',
            journeyDate: new Date('2026-11-02'),
            contactEmail: 'past@example.com',
            paymentStatus,
            bookingStatus: 'IDLE',
          },
        ]);

        const result = await service.processAbandonedBookingsCron({ force });

        expect(result.sent).toBe(0);
        expect(result.skipped).toBe(1);
        expect(
          notifications.sendAbandonedBookingReminder,
        ).not.toHaveBeenCalled();
        expect(prisma.splitTicketBooking?.update).not.toHaveBeenCalled();
        expect(prisma.sentNotificationLog?.create).not.toHaveBeenCalled();
      },
    );

    it('rechecks the journey date when a cron batch crosses midnight in IST', async () => {
      jest.setSystemTime(new Date('2026-11-03T18:29:59Z'));
      (prisma.splitTicketBooking?.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'midnight-booking',
          bookingRef: 'LB-MIDNIGHT',
          journeyDate: new Date('2026-11-03'),
          contactEmail: 'midnight@example.com',
        },
      ]);
      (
        prisma.notificationUnsubscribe?.findFirst as jest.Mock
      ).mockImplementation(() => {
        jest.setSystemTime(new Date('2026-11-03T18:30:00Z'));
        return Promise.resolve(null);
      });

      const result = await service.processAbandonedBookingsCron();

      expect(result.skipped).toBe(1);
      expect(notifications.sendAbandonedBookingReminder).not.toHaveBeenCalled();
      expect(prisma.splitTicketBooking?.update).not.toHaveBeenCalled();
    });

    it('skips processing if not the leader', async () => {
      (leader.isLeader as jest.Mock).mockResolvedValue(false);
      const res = await service.processAbandonedBookingsCron();
      expect(res.errors).toContain('Not leader instance');
      expect(notifications.sendAbandonedBookingReminder).not.toHaveBeenCalled();
    });

    it('sends reminder email only once and records timestamp', async () => {
      const sampleBooking = {
        id: 'bk-1',
        bookingRef: 'LB-TEST-1',
        trainNumber: '12951',
        trainName: 'Rajdhani Exp',
        fromStationCode: 'NDLS',
        toStationCode: 'MMCT',
        journeyDate: new Date('2026-11-15'),
        travelClass: '3A',
        quota: 'GN',
        totalFare: 2400,
        contactEmail: 'passenger@example.com',
        contactMobile: '9876543210',
        passengers: {
          adults: [{ name: 'Test User', age: 28, gender: 'Male' }],
        },
        legsPayload: [
          { from: 'NDLS', to: 'MMCT', travelClass: '3A', fare: 2400 },
        ],
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      };

      (prisma.splitTicketBooking?.findMany as jest.Mock).mockResolvedValue([
        sampleBooking,
      ]);

      const res = await service.processAbandonedBookingsCron();

      expect(res.scanned).toBe(1);
      expect(res.sent).toBe(1);
      expect(notifications.sendAbandonedBookingReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'passenger@example.com',
          bookingRef: 'LB-TEST-1',
          trainNumber: '12951',
          resumeUrl: 'https://lastberth.com/split-booking/resume?ref=LB-TEST-1',
        }),
      );

      // Verify booking updated with timestamp
      expect(prisma.splitTicketBooking?.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bk-1' },
          data: expect.objectContaining({
            abandonedReminderSentAt: expect.any(Date),
          }),
        }),
      );

      // Verify deduplication entry created in sentNotificationLog
      expect(prisma.sentNotificationLog?.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipient: 'passenger@example.com',
            notificationType: 'abandoned_booking_reminder',
          }),
        }),
      );
    });

    it('skips unsubscribed customers', async () => {
      const sampleBooking = {
        id: 'bk-2',
        bookingRef: 'LB-TEST-2',
        trainNumber: '12951',
        journeyDate: new Date('2026-11-15'),
        totalFare: 2400,
        contactEmail: 'optout@example.com',
        passengers: { adults: [{ name: 'Opt Out' }] },
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      };

      (prisma.splitTicketBooking?.findMany as jest.Mock).mockResolvedValue([
        sampleBooking,
      ]);
      (
        prisma.notificationUnsubscribe?.findFirst as jest.Mock
      ).mockResolvedValue({ id: 'unsub-1' });

      const res = await service.processAbandonedBookingsCron();

      expect(res.sent).toBe(0);
      expect(res.skipped).toBe(1);
      expect(notifications.sendAbandonedBookingReminder).not.toHaveBeenCalled();
    });

    it('skips users who already made a PAID booking for the same train/date', async () => {
      const sampleBooking = {
        id: 'bk-3',
        bookingRef: 'LB-TEST-3',
        trainNumber: '12951',
        journeyDate: new Date('2026-11-15'),
        totalFare: 2400,
        contactEmail: 'buyer@example.com',
        passengers: { adults: [{ name: 'Buyer' }] },
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      };

      (prisma.splitTicketBooking?.findMany as jest.Mock).mockResolvedValue([
        sampleBooking,
      ]);
      (prisma.splitTicketBooking?.findFirst as jest.Mock).mockResolvedValue({
        id: 'paid-booking',
        paymentStatus: 'PAID',
      });

      const res = await service.processAbandonedBookingsCron();

      expect(res.sent).toBe(0);
      expect(res.skipped).toBe(1);
      expect(notifications.sendAbandonedBookingReminder).not.toHaveBeenCalled();
      // Should mark abandonedReminderSentAt so it is not queried on next tick
      expect(prisma.splitTicketBooking?.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bk-3' },
          data: expect.objectContaining({
            abandonedReminderSentAt: expect.any(Date),
          }),
        }),
      );
    });

    it('processes bookings with FAILED payment status and sends reminder', async () => {
      const sampleBooking = {
        id: 'bk-failed-1',
        bookingRef: 'LB-XLJ48',
        trainNumber: '12015',
        trainName: 'AJMER SHATABDI',
        fromStationCode: 'NDLS',
        toStationCode: 'AII',
        journeyDate: new Date('2026-11-15'),
        travelClass: 'CC',
        quota: 'GN',
        totalFare: 1100,
        paymentStatus: 'FAILED',
        bookingStatus: 'IDLE',
        contactEmail: 'me@kartikarora.in',
        passengers: {
          adults: [{ name: 'Kartik Arora', age: 30, gender: 'Male' }],
        },
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      };

      (prisma.splitTicketBooking?.findMany as jest.Mock).mockResolvedValue([
        sampleBooking,
      ]);

      const res = await service.processAbandonedBookingsCron();

      expect(res.sent).toBe(1);
      expect(notifications.sendAbandonedBookingReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'me@kartikarora.in',
          bookingRef: 'LB-XLJ48',
          trainNumber: '12015',
        }),
      );
      expect(prisma.splitTicketBooking?.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bk-failed-1' },
          data: expect.objectContaining({
            abandonedReminderSentAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('sendManualReminder', () => {
    it.each(['PENDING', 'FAILED'])(
      'rejects manual reminders for past journeys with %s payments',
      async (paymentStatus) => {
        (prisma.splitTicketBooking?.findUnique as jest.Mock).mockResolvedValue({
          id: 'past-booking',
          journeyDate: new Date('2026-11-02'),
          contactEmail: 'past@example.com',
          paymentStatus,
        });

        await expect(service.sendManualReminder('LB-PAST')).rejects.toThrow(
          'Cannot send reminders for past journeys',
        );
        expect(
          notifications.sendAbandonedBookingReminder,
        ).not.toHaveBeenCalled();
        expect(prisma.splitTicketBooking?.update).not.toHaveBeenCalled();
        expect(prisma.sentNotificationLog?.create).not.toHaveBeenCalled();
      },
    );

    it('sends manual reminder and updates database timestamp', async () => {
      const booking = {
        id: 'bk-manual',
        bookingRef: 'LB-MANUAL-1',
        trainNumber: '12951',
        trainName: 'Rajdhani',
        fromStationCode: 'NDLS',
        toStationCode: 'MMCT',
        journeyDate: new Date('2026-11-15'),
        travelClass: '3A',
        quota: 'GN',
        totalFare: 2400,
        contactEmail: 'manual@example.com',
        passengers: { adults: [{ name: 'Manual User' }] },
        legsPayload: [],
      };

      (prisma.splitTicketBooking?.findUnique as jest.Mock).mockResolvedValue(
        booking,
      );

      const result = await service.sendManualReminder('LB-MANUAL-1');
      expect(result.ok).toBe(true);
      expect(notifications.sendAbandonedBookingReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'manual@example.com',
          bookingRef: 'LB-MANUAL-1',
        }),
      );
      expect(prisma.splitTicketBooking?.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bk-manual' },
          data: expect.objectContaining({
            abandonedReminderSentAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('sendTestEmail', () => {
    it('sends preview email to specified recipient', async () => {
      const res = await service.sendTestEmail('admin@example.com');
      expect(res.ok).toBe(true);
      expect(notifications.sendAbandonedBookingReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@example.com',
          bookingRef: 'LB-TEST-DEMO',
        }),
      );
    });
  });
});
