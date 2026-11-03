import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { PostHogAnalyticsService } from '../common/posthog-analytics.service';
import { ChartCronLeaderService } from '../chart-cron/chart-cron-leader.service';
import { isPastJourneyDate, toIstYmd } from '../common/date.utils';
import type {
  MarketingEngineConfigDto,
  MarketingStatsResponse,
  AbandonedBookingItem,
  ProcessMarketingCronResult,
  AbandonedBookingsQueryDto,
} from './marketing.types';

const MARKETING_CRON_NAME = 'marketing-abandoned-recovery';

interface PassengerPayload {
  adults?: Array<{ name: string; age?: number; gender?: string }>;
}

interface LegPayload {
  from: string;
  to: string;
  travelClass: string;
  boardingDate?: string;
  fare?: number;
}

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);
  private isCronRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly leader?: ChartCronLeaderService,
    @Optional() private readonly posthog?: PostHogAnalyticsService,
  ) {}

  /** Retrieve or initialize marketing engine configuration. */
  async getConfig() {
    let cfg = await this.prisma.marketingEngineConfig.findUnique({
      where: { id: 'default' },
    });
    if (!cfg) {
      cfg = await this.prisma.marketingEngineConfig.create({
        data: {
          id: 'default',
          enabled: true,
          minAbandonedMinutes: 15,
          maxLookbackHours: 48,
        },
      });
    }
    return cfg;
  }

  /** Update marketing engine configuration. */
  async updateConfig(dto: MarketingEngineConfigDto) {
    return this.prisma.marketingEngineConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        enabled: dto.enabled ?? true,
        minAbandonedMinutes: dto.minAbandonedMinutes ?? 15,
        maxLookbackHours: dto.maxLookbackHours ?? 48,
      },
      update: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.minAbandonedMinutes !== undefined && {
          minAbandonedMinutes: Math.max(1, dto.minAbandonedMinutes),
        }),
        ...(dto.maxLookbackHours !== undefined && {
          maxLookbackHours: Math.max(1, dto.maxLookbackHours),
        }),
      },
    });
  }

  /** Aggregate high-level marketing engine performance metrics. */
  async getStats(): Promise<MarketingStatsResponse> {
    const [
      totalAbandoned,
      remindersSent,
      recoveredBookings,
      recoveredFares,
      lastCronRun,
    ] = await Promise.all([
      this.prisma.splitTicketBooking.count({
        where: {
          OR: [
            {
              paymentStatus: { in: ['PENDING', 'FAILED'] },
              bookingStatus: { notIn: ['CANCELLED', 'CONFIRMED'] },
            },
            { abandonedReminderSentAt: { not: null } },
          ],
        },
      }),
      this.prisma.splitTicketBooking.count({
        where: {
          abandonedReminderSentAt: { not: null },
        },
      }),
      this.prisma.splitTicketBooking.count({
        where: {
          abandonedReminderSentAt: { not: null },
          paymentStatus: 'PAID',
        },
      }),
      this.prisma.splitTicketBooking.aggregate({
        _sum: { totalFare: true },
        where: {
          abandonedReminderSentAt: { not: null },
          paymentStatus: 'PAID',
        },
      }),
      this.prisma.cronRunLog.findFirst({
        where: { cronName: MARKETING_CRON_NAME },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const recoveryRatePercent =
      remindersSent > 0
        ? Math.round((recoveredBookings / remindersSent) * 1000) / 10
        : 0;

    return {
      totalAbandoned,
      remindersSent,
      recoveredBookings,
      recoveryRatePercent,
      recoveredRevenue: recoveredFares._sum.totalFare ?? 0,
      lastCronRun: lastCronRun
        ? {
            startedAt: lastCronRun.startedAt.toISOString(),
            status: lastCronRun.status,
            durationMs: lastCronRun.durationMs,
            emailsSent: lastCronRun.completedCount,
          }
        : null,
    };
  }

  /** List abandoned bookings with status and pagination for the admin dashboard. */
  async listAbandonedBookings(query: AbandonedBookingsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SplitTicketBookingWhereInput = {};

    if (query.status === 'pending_reminder') {
      where.paymentStatus = { in: ['PENDING', 'FAILED'] };
      where.bookingStatus = { notIn: ['CANCELLED', 'CONFIRMED'] };
      where.abandonedReminderSentAt = null;
    } else if (query.status === 'reminder_sent') {
      where.abandonedReminderSentAt = { not: null };
      where.paymentStatus = { in: ['PENDING', 'FAILED'] };
      where.bookingStatus = { notIn: ['CANCELLED', 'CONFIRMED'] };
    } else if (query.status === 'recovered') {
      where.abandonedReminderSentAt = { not: null };
      where.paymentStatus = 'PAID';
    } else {
      // 'all' includes pending, failed, or reminded bookings
      where.OR = [
        {
          paymentStatus: { in: ['PENDING', 'FAILED'] },
          bookingStatus: { notIn: ['CANCELLED', 'CONFIRMED'] },
        },
        { abandonedReminderSentAt: { not: null } },
      ];
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { bookingRef: { contains: q, mode: 'insensitive' } },
            { trainNumber: { contains: q } },
            { contactEmail: { contains: q, mode: 'insensitive' } },
            { contactMobile: { contains: q } },
            { trainName: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.splitTicketBooking.count({ where }),
      this.prisma.splitTicketBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items: AbandonedBookingItem[] = rows.map((b) => {
      const p = (b.passengers as PassengerPayload | null)?.adults?.[0];
      let derivedStatus: AbandonedBookingItem['status'] = 'pending_reminder';
      if (b.bookingStatus === 'CANCELLED') {
        derivedStatus = 'cancelled';
      } else if (b.abandonedReminderSentAt && b.paymentStatus === 'PAID') {
        derivedStatus = 'recovered';
      } else if (b.abandonedReminderSentAt) {
        derivedStatus = 'reminder_sent';
      }

      return {
        id: b.id,
        bookingRef: b.bookingRef,
        trainNumber: b.trainNumber,
        trainName: b.trainName,
        fromStationCode: b.fromStationCode,
        toStationCode: b.toStationCode,
        journeyDate: b.journeyDate.toISOString().slice(0, 10),
        travelClass: b.travelClass,
        quota: b.quota,
        totalFare: b.totalFare,
        passengerName: p?.name || 'Passenger',
        passengerAge: p?.age,
        passengerGender: p?.gender,
        contactMobile: b.contactMobile,
        contactEmail: b.contactEmail,
        paymentStatus: b.paymentStatus,
        bookingStatus: b.bookingStatus,
        createdAt: b.createdAt.toISOString(),
        abandonedReminderSentAt:
          b.abandonedReminderSentAt?.toISOString() ?? null,
        status: derivedStatus,
        payUrl: b.payUrl,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Main cron processor: runs every 15 minutes to find abandoned bookings and send
   * a single recovery reminder email.
   */
  async processAbandonedBookingsCron(options?: {
    force?: boolean;
  }): Promise<ProcessMarketingCronResult> {
    if (this.isCronRunning) {
      this.logger.warn(
        'Marketing abandoned recovery cron is already running; skipping tick.',
      );
      return {
        scanned: 0,
        eligible: 0,
        sent: 0,
        skipped: 0,
        errors: ['Already running'],
      };
    }

    if (!options?.force && this.leader) {
      const isLeader = await this.leader.isLeader(MARKETING_CRON_NAME);
      if (!isLeader) {
        return {
          scanned: 0,
          eligible: 0,
          sent: 0,
          skipped: 0,
          errors: ['Not leader instance'],
        };
      }
    }

    const cfg = await this.getConfig();
    if (!cfg.enabled && !options?.force) {
      this.logger.log('Marketing engine is disabled via configuration.');
      return {
        scanned: 0,
        eligible: 0,
        sent: 0,
        skipped: 0,
        errors: ['Engine disabled'],
      };
    }

    this.isCronRunning = true;
    const startedAt = new Date();
    const errors: string[] = [];
    let sentCount = 0;
    let skippedCount = 0;

    try {
      const now = new Date();
      const cutoffBefore = new Date(
        now.getTime() - cfg.minAbandonedMinutes * 60 * 1000,
      );
      const cutoffAfter = new Date(
        now.getTime() - cfg.maxLookbackHours * 3600 * 1000,
      );
      // @db.Date values represent calendar dates at UTC midnight, not instants in IST.
      const journeyDateCutoff = new Date(toIstYmd(now));

      const candidates = await this.prisma.splitTicketBooking.findMany({
        where: {
          paymentStatus: { in: ['PENDING', 'FAILED'] },
          bookingStatus: { notIn: ['CANCELLED', 'CONFIRMED'] },
          abandonedReminderSentAt: null,
          createdAt: options?.force
            ? { gte: cutoffAfter }
            : {
                lte: cutoffBefore,
                gte: cutoffAfter,
              },
          journeyDate: {
            gte: journeyDateCutoff,
          },
          contactEmail: {
            not: '',
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      const frontendUrl = (
        this.config.get<string>('FRONTEND_URL') || 'https://lastberth.com'
      ).replace(/\/$/, '');

      for (const booking of candidates) {
        const email = booking.contactEmail.trim().toLowerCase();
        if (!email.includes('@')) {
          skippedCount++;
          continue;
        }

        // Guard 1: Verify customer has not unsubscribed
        const unsub = await this.prisma.notificationUnsubscribe.findFirst({
          where: {
            recipient: email,
            channel: { in: ['all', 'email'] },
          },
        });
        if (unsub) {
          this.logger.log(
            `Skipping reminder for ${email} — user unsubscribed.`,
          );
          skippedCount++;
          continue;
        }

        // Guard 2: Skip if user made another successful booking for the same train on the same date
        const alreadyPaid = await this.prisma.splitTicketBooking.findFirst({
          where: {
            contactEmail: { equals: email, mode: 'insensitive' },
            trainNumber: booking.trainNumber,
            journeyDate: booking.journeyDate,
            paymentStatus: 'PAID',
          },
        });
        if (alreadyPaid) {
          this.logger.log(
            `Skipping reminder for ${email} — already completed booking on this train/date.`,
          );
          skippedCount++;
          // Mark as handled so we don't query again
          await this.prisma.splitTicketBooking.update({
            where: { id: booking.id },
            data: { abandonedReminderSentAt: new Date() },
          });
          continue;
        }

        // Guard 3: Deduplication check via sent notification log
        const sentLog = await this.prisma.sentNotificationLog.findFirst({
          where: {
            recipient: email,
            trainNumber: booking.trainNumber,
            journeyDate: booking.journeyDate,
            notificationType: 'abandoned_booking_reminder',
          },
        });
        if (sentLog) {
          skippedCount++;
          await this.prisma.splitTicketBooking.update({
            where: { id: booking.id },
            data: { abandonedReminderSentAt: new Date() },
          });
          continue;
        }

        const p = (booking.passengers as PassengerPayload | null)?.adults?.[0];
        const legs = (booking.legsPayload as LegPayload[] | null) ?? [];
        const resumeUrl = `${frontendUrl}/split-booking/resume?ref=${encodeURIComponent(booking.bookingRef)}`;
        const unsubscribeUrl = `${frontendUrl}/unsubscribe?email=${encodeURIComponent(email)}`;
        const journeyDateReadable = booking.journeyDate.toLocaleDateString(
          'en-IN',
          {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          },
        );

        if (!this.notifications) {
          errors.push('NotificationService is not available');
          break;
        }

        try {
          // Recheck at send time in case processing crosses midnight in IST.
          if (isPastJourneyDate(booking.journeyDate)) {
            skippedCount++;
            continue;
          }
          const sent = await this.notifications.sendAbandonedBookingReminder({
            to: email,
            bookingRef: booking.bookingRef,
            trainNumber: booking.trainNumber,
            trainName: booking.trainName,
            fromStationCode: booking.fromStationCode,
            toStationCode: booking.toStationCode,
            journeyDateReadable,
            travelClass: booking.travelClass,
            quota: booking.quota,
            passengerName: p?.name || 'Passenger',
            passengerAge: p?.age,
            passengerGender: p?.gender,
            totalFare: booking.totalFare,
            legs,
            resumeUrl,
            unsubscribeUrl,
          });

          if (sent) {
            sentCount++;
            await this.prisma.splitTicketBooking.update({
              where: { id: booking.id },
              data: { abandonedReminderSentAt: new Date() },
            });

            await this.prisma.sentNotificationLog.create({
              data: {
                recipient: email,
                channel: 'email',
                trainNumber: booking.trainNumber,
                journeyDate: booking.journeyDate,
                notificationType: 'abandoned_booking_reminder',
              },
            });

            this.posthog?.capture(
              'marketing_abandoned_booking_reminder_sent',
              {
                booking_ref: booking.bookingRef,
                train_number: booking.trainNumber,
                total_fare: booking.totalFare,
                journey_date: booking.journeyDate.toISOString().slice(0, 10),
              },
              booking.bookingRef,
            );
          } else {
            errors.push(
              `Failed to send email to ${email} for booking ${booking.bookingRef}`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Error emailing ${email}: ${msg}`);
          this.logger.error(
            `Failed to send abandoned booking reminder to ${email}`,
            err,
          );
        }
      }

      await this.logCronRun({
        startedAt,
        status: errors.length > 0 && sentCount === 0 ? 'error' : 'success',
        tasksClaimed: candidates.length,
        tasksRun: candidates.length,
        completedCount: sentCount,
        failedCount: errors.length,
        output: {
          scanned: candidates.length,
          sent: sentCount,
          skipped: skippedCount,
          errors,
        },
      });

      return {
        scanned: candidates.length,
        eligible: candidates.length - skippedCount,
        sent: sentCount,
        skipped: skippedCount,
        errors,
      };
    } finally {
      this.isCronRunning = false;
    }
  }

  /** Admin manual send reminder for a specific booking. */
  async sendManualReminder(bookingRef: string) {
    const booking = await this.prisma.splitTicketBooking.findUnique({
      where: { bookingRef },
    });
    if (!booking) {
      throw new NotFoundException(`Booking "${bookingRef}" not found`);
    }
    if (isPastJourneyDate(booking.journeyDate)) {
      throw new BadRequestException('Cannot send reminders for past journeys');
    }
    if (!booking.contactEmail?.includes('@')) {
      throw new BadRequestException('Booking has no valid contact email');
    }

    if (!this.notifications) {
      throw new BadRequestException('NotificationService is not configured');
    }

    const frontendUrl = (
      this.config.get<string>('FRONTEND_URL') || 'https://lastberth.com'
    ).replace(/\/$/, '');
    const email = booking.contactEmail.trim().toLowerCase();
    const p = (booking.passengers as PassengerPayload | null)?.adults?.[0];
    const legs = (booking.legsPayload as LegPayload[] | null) ?? [];
    const resumeUrl = `${frontendUrl}/split-booking/resume?ref=${encodeURIComponent(booking.bookingRef)}`;
    const unsubscribeUrl = `${frontendUrl}/unsubscribe?email=${encodeURIComponent(email)}`;
    const journeyDateReadable = booking.journeyDate.toLocaleDateString(
      'en-IN',
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    );

    const sent = await this.notifications.sendAbandonedBookingReminder({
      to: email,
      bookingRef: booking.bookingRef,
      trainNumber: booking.trainNumber,
      trainName: booking.trainName,
      fromStationCode: booking.fromStationCode,
      toStationCode: booking.toStationCode,
      journeyDateReadable,
      travelClass: booking.travelClass,
      quota: booking.quota,
      passengerName: p?.name || 'Passenger',
      passengerAge: p?.age,
      passengerGender: p?.gender,
      totalFare: booking.totalFare,
      legs,
      resumeUrl,
      unsubscribeUrl,
    });

    if (sent) {
      await this.prisma.splitTicketBooking.update({
        where: { id: booking.id },
        data: { abandonedReminderSentAt: new Date() },
      });
      await this.prisma.sentNotificationLog.create({
        data: {
          recipient: email,
          channel: 'email',
          trainNumber: booking.trainNumber,
          journeyDate: booking.journeyDate,
          notificationType: 'abandoned_booking_reminder',
        },
      });
    }

    return { ok: sent, email };
  }

  /** Send a preview test email to an admin-specified email address. */
  async sendTestEmail(toEmail: string) {
    if (!toEmail?.includes('@')) {
      throw new BadRequestException('Invalid email address');
    }
    if (!this.notifications) {
      throw new BadRequestException('NotificationService is not configured');
    }

    const frontendUrl = (
      this.config.get<string>('FRONTEND_URL') || 'https://lastberth.com'
    ).replace(/\/$/, '');
    const sampleRef = 'LB-TEST-DEMO';
    const sent = await this.notifications.sendAbandonedBookingReminder({
      to: toEmail.trim(),
      bookingRef: sampleRef,
      trainNumber: '12952',
      trainName: 'New Delhi Rajdhani Express',
      fromStationCode: 'NDLS',
      toStationCode: 'MMCT',
      journeyDateReadable: 'Tomorrow, 8:00 PM',
      travelClass: '3A',
      quota: 'GN',
      passengerName: 'Rohit Sharma',
      passengerAge: 32,
      passengerGender: 'Male',
      totalFare: 2150,
      legs: [
        {
          from: 'NDLS',
          to: 'KOTA',
          travelClass: '3A',
          fare: 1050,
        },
        {
          from: 'KOTA',
          to: 'MMCT',
          travelClass: '3A',
          fare: 1100,
        },
      ],
      resumeUrl: `${frontendUrl}/split-booking/resume?ref=${sampleRef}`,
      unsubscribeUrl: `${frontendUrl}/unsubscribe?email=${encodeURIComponent(toEmail.trim())}`,
    });

    return { ok: sent, recipient: toEmail.trim() };
  }

  private async logCronRun(entry: {
    startedAt: Date;
    status: string;
    tasksClaimed: number;
    tasksRun: number;
    completedCount: number;
    failedCount: number;
    output: unknown;
  }) {
    try {
      const finishedAt = new Date();
      await this.prisma.cronRunLog.create({
        data: {
          cronName: MARKETING_CRON_NAME,
          startedAt: entry.startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - entry.startedAt.getTime(),
          status: entry.status,
          isLeader: true,
          tasksClaimed: entry.tasksClaimed,
          tasksRun: entry.tasksRun,
          completedCount: entry.completedCount,
          failedCount: entry.failedCount,
          output: entry.output as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Failed to write cronRunLog: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
