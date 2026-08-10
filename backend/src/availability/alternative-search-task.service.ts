import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import { NotificationService } from '../notification/notification.service';

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

    setImmediate(() => {
      this.processTask(task.id).catch((err) => {
        this.logger.error(`Error processing alternative task ${task.id}:`, err);
      });
    });

    return { id: task.id };
  }

  /**
   * Process all pending tasks (used by cron worker).
   */
  async processDueTasks(limit = 5): Promise<number> {
    const pendingTasks = await this.prisma.alternativeSearchTask.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let processed = 0;
    for (const task of pendingTasks) {
      try {
        await this.processTask(task.id);
        processed++;
      } catch (err) {
        this.logger.error(`Error in processDueTasks for task ${task.id}:`, err);
      }
    }
    return processed;
  }

  /**
   * Process a single AlternativeSearchTask:
   * 1. Search candidate trains via BookingV2Service.findBestTrainCandidates
   * 2. Exclude original trainNumber
   * 3. Filter candidates to full-journey confirmed paths
   * 4. Send follow-up WhatsApp & Email alerts if matching alternatives are found
   */
  async processTask(taskId: string): Promise<void> {
    const task = await this.prisma.alternativeSearchTask.findUnique({
      where: { id: taskId },
    });
    if (!task || task.status !== 'pending') return;

    await this.prisma.alternativeSearchTask.update({
      where: { id: taskId },
      data: { status: 'processing' },
    });

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
        await this.prisma.alternativeSearchTask.update({
          where: { id: taskId },
          data: {
            status: 'no_alternatives_found',
            processedAt: new Date(),
            resultPayload: {
              candidatesEvaluated: candidates.length,
              matches: 0,
            },
          },
        });
        return;
      }

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
        });

      await this.prisma.alternativeSearchTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          processedAt: new Date(),
          notificationSent:
            notificationResult.whatsappSent || notificationResult.emailSent,
          resultPayload: {
            candidatesEvaluated: candidates.length,
            matches: matchingAlternatives.length,
            notificationResult,
          } as object,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.alternativeSearchTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          processedAt: new Date(),
          lastError: errorMessage.slice(0, 1000),
        },
      });
      throw err;
    }
  }
}
