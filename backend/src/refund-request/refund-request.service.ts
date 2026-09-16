import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { isValidIndianMobile } from '../common/validation.utils';
import { normalizeE164Mobile } from '../notification/notification.helpers';
import { to5DigitTrainNo } from '../irctc/irctc.service';

export type CreateRefundRequestInput = {
  mobile?: string;
  trainNumber?: string;
  journeyDate?: string;
  txnId?: string;
};

const JOURNEY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRAIN_NUMBER_RE = /^\d{5}$/;
const DUPLICATE_WINDOW_MS = 24 * 3600 * 1000;

@Injectable()
export class RefundRequestService {
  private readonly logger = new Logger(RefundRequestService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /**
   * Validate + store a manual refund request, then email the admin.
   * A PENDING request for the same mobile/train/date within 24h is treated
   * as a duplicate (no new row, admin still gets a heads-up).
   */
  async create(
    input: CreateRefundRequestInput,
  ): Promise<{ id: string; duplicate: boolean }> {
    const rawMobile = String(input.mobile ?? '');
    if (!isValidIndianMobile(rawMobile)) {
      throw new BadRequestException({
        code: 'INVALID_MOBILE',
        message: 'Mobile must be a valid 10-digit Indian number.',
      });
    }
    const mobile = normalizeE164Mobile(rawMobile);

    const trainNumber = to5DigitTrainNo(input.trainNumber);
    if (!TRAIN_NUMBER_RE.test(trainNumber)) {
      throw new BadRequestException({
        code: 'INVALID_TRAIN_NUMBER',
        message: 'Train number must be 5 digits.',
      });
    }

    const journeyDate = String(input.journeyDate ?? '')
      .trim()
      .slice(0, 10);
    if (!JOURNEY_DATE_RE.test(journeyDate)) {
      throw new BadRequestException({
        code: 'INVALID_JOURNEY_DATE',
        message: 'Journey date must be in YYYY-MM-DD format.',
      });
    }

    const txnId =
      String(input.txnId ?? '')
        .trim()
        .slice(0, 255) || null;
    const journeyDateObj = new Date(journeyDate);

    const existing = await this.prisma.refundRequest.findFirst({
      where: {
        mobile,
        trainNumber,
        journeyDate: journeyDateObj,
        status: 'PENDING',
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
    });
    if (existing) {
      void this.sendAdminEmail({ ...existing, duplicate: true }).catch((err) =>
        this.logger.error(
          `Refund admin email failed (duplicate ${existing.id}): ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return { id: existing.id, duplicate: true };
    }

    const created = await this.prisma.refundRequest.create({
      data: { mobile, trainNumber, journeyDate: journeyDateObj, txnId },
    });
    void this.sendAdminEmail({ ...created, duplicate: false }).catch((err) =>
      this.logger.error(
        `Refund admin email failed (${created.id}): ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return { id: created.id, duplicate: false };
  }

  /** Newest-first list for the admin dashboard. */
  list() {
    return this.prisma.refundRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async setStatus(id: string, status: string) {
    const normalized = String(status ?? '')
      .trim()
      .toUpperCase();
    if (!['RESOLVED', 'REJECTED'].includes(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Status must be RESOLVED or REJECTED.',
      });
    }
    try {
      await this.prisma.refundRequest.update({
        where: { id: String(id ?? '').trim() },
        data: { status: normalized as 'RESOLVED' | 'REJECTED' },
      });
    } catch {
      throw new NotFoundException('Refund request not found');
    }
    return { ok: true as const };
  }

  private sendAdminEmail(entry: {
    id: string;
    mobile: string;
    trainNumber: string;
    journeyDate: Date;
    txnId: string | null;
    createdAt: Date;
    duplicate: boolean;
  }): Promise<boolean> {
    return this.notifications.sendRefundRequestAdminEmail({
      id: entry.id,
      mobile: entry.mobile,
      trainNumber: entry.trainNumber,
      journeyDate: entry.journeyDate.toISOString().slice(0, 10),
      txnId: entry.txnId,
      createdAt: entry.createdAt.toISOString(),
      duplicate: entry.duplicate,
    });
  }
}
