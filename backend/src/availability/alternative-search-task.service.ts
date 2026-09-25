import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import { NotificationService } from '../notification/notification.service';

const DEFAULT_ALTERNATIVE_SEARCH_CONCURRENCY = 3;
const ALTERNATIVE_TASK_LEASE_MS = 15 * 60_000;

function alternativeSearchConcurrency(): number {
  const parsed = Number.parseInt(
    process.env.ALTERNATIVE_SEARCH_CONCURRENCY ?? '',
    10,
  );
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10
    ? parsed
    : DEFAULT_ALTERNATIVE_SEARCH_CONCURRENCY;
}

@Injectable()
export class AlternativeSearchTaskService {
  private readonly logger = new Logger(AlternativeSearchTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingV2Service: BookingV2Service,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Enqueue a background alternative train search task when a journey task
   * finds no full-journey ticket for the target train.
   */
  async enqueueTask(params: {
    journeyTaskId?: string;
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: Date | string;
    classCode?: string;
    monitoringContactId?: string;
    email?: string;
    mobile?: string;
  }): Promise<{ id: string }> {
    const journeyDateStr =
      params.journeyDate instanceof Date
        ? params.journeyDate.toISOString().slice(0, 10)
        : String(params.journeyDate).slice(0, 10);
    const journeyDateObj = new Date(`${journeyDateStr}T00:00:00.000Z`);

    const email = params.email?.trim().toLowerCase() || undefined;
    const mobile = params.mobile?.trim() || undefined;

    const task = await this.prisma.alternativeSearchTask.create({
      data: {
        journeyTaskId: params.journeyTaskId,
        trainNumber: params.trainNumber,
        trainName: params.trainName,
        fromStationCode: params.fromStationCode.trim().toUpperCase(),
        toStationCode: params.toStationCode.trim().toUpperCase(),
        journeyDate: journeyDateObj,
        classCode: params.classCode || '3A',
        monitoringContactId: params.monitoringContactId,
        email: email || null,
        mobile: mobile || null,
        status: 'pending',
      },
    });

    return { id: task.id };
  }

  /**
   * Process all pending tasks (used by cron worker).
   */
  async processDueTasks(
    limit = alternativeSearchConcurrency(),
  ): Promise<number> {
    const staleBefore = new Date(Date.now() - ALTERNATIVE_TASK_LEASE_MS);
    const pendingTasks = await this.prisma.alternativeSearchTask.findMany({
      where: {
        OR: [
          { status: 'pending' },
          { status: 'processing', lockedAt: { lte: staleBefore } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const results = await Promise.allSettled(
      pendingTasks.map((task) => this.processTask(task.id)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Error in processDueTasks for task ${pendingTasks[index].id}:`,
          result.reason,
        );
      }
    });
    return results.filter(
      (result) => result.status === 'fulfilled' && result.value,
    ).length;
  }

  /**
   * Process a single AlternativeSearchTask:
   * 1. Search candidate trains via BookingV2Service.findBestTrainCandidates
   * 2. Exclude original trainNumber
   * 3. Filter candidates to full-journey confirmed paths
   * 4. Send follow-up WhatsApp & Email alerts if matching alternatives are found
   */
  async processTask(taskId: string): Promise<boolean> {
    const task = await this.prisma.alternativeSearchTask.findUnique({
      where: { id: taskId },
    });
    if (!task) return false;

    const currentLeaseVersion = task.leaseVersion ?? 0;
    const claimedLeaseVersion = currentLeaseVersion + 1;
    const staleBefore = new Date(Date.now() - ALTERNATIVE_TASK_LEASE_MS);
    const claim = await this.prisma.alternativeSearchTask.updateMany({
      where: {
        id: taskId,
        leaseVersion: currentLeaseVersion,
        OR: [
          { status: 'pending' },
          { status: 'processing', lockedAt: { lte: staleBefore } },
        ],
      },
      data: {
        status: 'processing',
        lockedAt: new Date(),
        leaseVersion: { increment: 1 },
      },
    });
    if (claim.count === 0) return false;

    const updateClaimedTask = async (
      data: Prisma.AlternativeSearchTaskUpdateManyMutationInput,
    ): Promise<boolean> => {
      const updated = await this.prisma.alternativeSearchTask.updateMany({
        where: { id: taskId, leaseVersion: claimedLeaseVersion },
        data,
      });
      return updated.count === 1;
    };

    try {
      const dateYmd = task.journeyDate.toISOString().slice(0, 10);
      const searchResult = await this.bookingV2Service.findBestTrains({
        from: task.fromStationCode,
        to: task.toStationCode,
        date: dateYmd,
      });
      const candidates = searchResult.results;

      const matchingAlternatives = candidates.filter((c) => {
        if (c.train.trainNumber === task.trainNumber) return false;
        const confirmedLegs = c.alternatePath.legs.filter(
          (l) => l.segmentKind === 'confirmed',
        );
        return c.alternatePath.isComplete && confirmedLegs.length > 0;
      });

      if (matchingAlternatives.length === 0) {
        return updateClaimedTask({
          status: 'no_alternatives_found',
          processedAt: new Date(),
          lockedAt: null,
          resultPayload: {
            candidatesEvaluated: candidates.length,
            matches: 0,
          },
        });
      }

      const stillOwned = await updateClaimedTask({ lockedAt: new Date() });
      if (!stillOwned) return false;

      const notificationResult =
        await this.notificationService.notifyUserAlternativeTrains({
          email: task.email,
          mobile: task.mobile,
          originalTrainNumber: task.trainNumber,
          originalTrainName: task.trainName,
          fromStationCode: task.fromStationCode,
          toStationCode: task.toStationCode,
          journeyDate: task.journeyDate,
          alternativeTrains: matchingAlternatives,
          journeyTaskId: task.journeyTaskId,
        });

      return updateClaimedTask({
        status: 'completed',
        processedAt: new Date(),
        lockedAt: null,
        notificationSent:
          notificationResult.whatsappSent || notificationResult.emailSent,
        resultPayload: {
          candidatesEvaluated: candidates.length,
          matches: matchingAlternatives.length,
          notificationResult,
        } as object,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await updateClaimedTask({
        status: 'failed',
        processedAt: new Date(),
        lockedAt: null,
        lastError: errorMessage.slice(0, 1000),
      });
      throw err;
    }
  }
}
