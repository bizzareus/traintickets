import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { ChartAlertPayment, RefundRequest } from '@prisma/client';
import { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import {
  createMuzoboxClient,
  muzoboxAuthHeaders,
} from '../common/muzobox-client';
import { isValidEmail } from '../common/validation.utils';
import { to5DigitTrainNo } from '../irctc/irctc.service';

export type CreateRefundRequestInput = {
  email?: string;
  trainNumber?: string;
  journeyDate?: string;
  txnId?: string;
};

export type CreateRefundRequestResult = {
  id: string;
  duplicate: boolean;
  autoRefunded?: boolean;
  amount?: number;
  refundId?: string | null;
};

export type RefundResolveResult = {
  ok: true;
  status: 'RESOLVED' | 'REJECTED';
  refund?: {
    refundId?: string | null;
    razorpayPaymentId?: string | null;
    amount?: number;
    emailSent: boolean;
  };
};

interface MuzoboxRefundResponse {
  status?: string;
  amount?: number;
  referenceId?: string | null;
  razorpayPaymentId?: string | null;
  razorpayRefundId?: string;
  refundedAt?: string;
}

interface MuzoboxStatusResponse {
  status?: string;
  amount?: number;
  referenceId?: string | null;
  razorpayPaymentId?: string | null;
  razorpay_payment_id?: string | null;
  razorpayOrderId?: string | null;
  razorpay_order_id?: string | null;
}

const JOURNEY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRAIN_NUMBER_RE = /^\d{5}$/;
const DUPLICATE_WINDOW_MS = 24 * 3600 * 1000;

@Injectable()
export class RefundRequestService {
  private readonly logger = new Logger(RefundRequestService.name);
  private readonly muzoboxClient: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    private configService: ConfigService,
    @Optional() private razorpay?: RazorpayClient,
  ) {
    this.muzoboxClient = createMuzoboxClient(this.configService);
  }

  /**
   * Validate + store a refund request.
   * If the requested refund amount is <= 25, automatically initiates the refund
   * through Muzobox proxy API and emails the customer right away.
   * Otherwise, queues as PENDING for manual admin review.
   */
  async create(
    input: CreateRefundRequestInput,
  ): Promise<CreateRefundRequestResult> {
    const email = String(input.email ?? '')
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',
        message: 'Email must be a valid email address.',
      });
    }

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
        email,
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
      data: { email, trainNumber, journeyDate: journeyDateObj, txnId },
    });

    // Evaluate auto-refund: if payment found and amount <= 25, auto initiate refund
    const { payment, razorpayPaymentId: initialPaymentId } =
      await this.findPaymentAndRazorpayId(created);

    const paymentAmount = payment?.amount ?? 10;
    if (payment && paymentAmount <= 25) {
      this.logger.log(
        `Auto-refund eligible for request ${created.id}: amount=₹${paymentAmount} (<= 25). Initiating refund via Muzobox...`,
      );
      try {
        let razorpayPaymentId = initialPaymentId;
        let razorpayRefundId: string | null =
          payment.razorpayRefundId?.trim() || null;

        if (payment.refundStatus !== 'SUCCEEDED' || !razorpayRefundId) {
          const refundResult = await this.executeMuzoboxRefund(
            created,
            payment,
            razorpayPaymentId,
          );
          razorpayRefundId = refundResult.refundId;
          if (refundResult.razorpayPaymentId && !razorpayPaymentId) {
            razorpayPaymentId = refundResult.razorpayPaymentId;
          }
        }

        // Mark request as RESOLVED immediately
        await this.prisma.refundRequest.update({
          where: { id: created.id },
          data: {
            status: 'RESOLVED',
            refundId: razorpayRefundId,
            razorpayPaymentId,
            refundAmount: paymentAmount,
            refundedAt: new Date(),
            refundError: null,
          },
        });

        // Email customer with full refund transaction ID and alert details
        void this.sendCustomerRefundEmail({
          entry: created,
          payment,
          amount: paymentAmount,
          refundId: razorpayRefundId || 'N/A',
          paymentId: razorpayPaymentId || undefined,
        }).catch((err) =>
          this.logger.error(
            `Auto-refund email failed (${created.id}): ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

        return {
          id: created.id,
          duplicate: false,
          autoRefunded: true,
          amount: paymentAmount,
          refundId: razorpayRefundId,
        };
      } catch (autoErr) {
        this.logger.warn(
          `Auto-refund failed for request ${created.id}: ${autoErr instanceof Error ? autoErr.message : String(autoErr)}; falling back to manual admin review`,
        );
      }
    }

    // Default flow: notify admin for manual review (amount > 25 or auto-refund pending)
    void this.sendAdminEmail({ ...created, duplicate: false }).catch((err) =>
      this.logger.error(
        `Refund admin email failed (${created.id}): ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return {
      id: created.id,
      duplicate: false,
      autoRefunded: false,
      amount: payment?.amount,
    };
  }

  /**
   * Preview/quote the refund amount from transaction ID / details before final submission.
   */
  async getQuote(input: CreateRefundRequestInput): Promise<{
    ok: true;
    found: boolean;
    amount: number;
    currency: string;
    autoRefundEligible: boolean;
    trainNumber: string;
    journeyDate: string;
  }> {
    const email = String(input.email ?? '')
      .trim()
      .toLowerCase();
    const trainNumber = to5DigitTrainNo(input.trainNumber);
    const journeyDate = String(input.journeyDate ?? '')
      .trim()
      .slice(0, 10);
    const txnId = String(input.txnId ?? '').trim() || null;

    const dummyEntry: RefundRequest = {
      id: 'quote-preview',
      email,
      trainNumber,
      journeyDate: journeyDate ? new Date(journeyDate) : new Date(),
      txnId,
      status: 'PENDING',
      refundId: null,
      razorpayPaymentId: null,
      refundAmount: null,
      refundedAt: null,
      refundError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { payment } = await this.findPaymentAndRazorpayId(dummyEntry);
    const amount = payment?.amount ?? 10;
    const found = Boolean(payment);
    const autoRefundEligible = amount <= 25;

    return {
      ok: true,
      found,
      amount,
      currency: 'INR',
      autoRefundEligible,
      trainNumber,
      journeyDate,
    };
  }

  /** Newest-first list for the admin dashboard. */
  list() {
    return this.prisma.refundRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Resolve or reject a refund request.
   * On RESOLVE:
   * 1. Finds the chart alert payment and determines the Razorpay payment ID from txnId/details.
   * 2. Initiates the refund via the Muzobox proxy API (or direct Razorpay fallback).
   * 3. Updates the database records (both RefundRequest and ChartAlertPayment).
   * 4. Sends a confirmation email to the user with the Razorpay refund ID and alert details.
   */
  async setStatus(id: string, status: string): Promise<RefundResolveResult> {
    const normalized = String(status ?? '')
      .trim()
      .toUpperCase();
    if (!['RESOLVED', 'REJECTED'].includes(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Status must be RESOLVED or REJECTED.',
      });
    }

    const entry = await this.prisma.refundRequest.findUnique({
      where: { id: String(id ?? '').trim() },
    });
    if (!entry) {
      throw new NotFoundException('Refund request not found');
    }

    if (normalized === 'REJECTED') {
      await this.prisma.refundRequest.update({
        where: { id: entry.id },
        data: { status: 'REJECTED' },
      });
      return { ok: true, status: 'REJECTED' };
    }

    // 1. Locate payment and find Razorpay payment ID
    const { payment, razorpayPaymentId: initialPaymentId } =
      await this.findPaymentAndRazorpayId(entry);

    if (!payment) {
      throw new BadRequestException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Could not find a matching chart alert payment for transaction ID "${entry.txnId || 'N/A'}" or email "${entry.email}". Please verify the transaction details.`,
      });
    }

    let razorpayPaymentId = initialPaymentId;
    let razorpayRefundId =
      payment.razorpayRefundId?.trim() || entry.refundId?.trim() || null;
    const refundAmount = payment.refundAmount ?? payment.amount ?? 5;

    // 2. Initiate refund via Muzobox proxy API if not already refunded
    if (payment.refundStatus === 'SUCCEEDED' && razorpayRefundId) {
      this.logger.log(
        `Payment ${payment.id} already marked SUCCEEDED with refundId=${razorpayRefundId}`,
      );
    } else {
      const refundResult = await this.executeMuzoboxRefund(
        entry,
        payment,
        razorpayPaymentId,
      );
      razorpayRefundId = refundResult.refundId;
      if (refundResult.razorpayPaymentId && !razorpayPaymentId) {
        razorpayPaymentId = refundResult.razorpayPaymentId;
      }
    }

    // 3. Update the RefundRequest record
    await this.prisma.refundRequest.update({
      where: { id: entry.id },
      data: {
        status: 'RESOLVED',
        refundId: razorpayRefundId,
        razorpayPaymentId,
        refundAmount,
        refundedAt: new Date(),
        refundError: null,
      },
    });

    // 4. Send email notification to the customer with refund ID and alert details
    const emailSent = await this.sendCustomerRefundEmail({
      entry,
      payment,
      amount: refundAmount,
      refundId: razorpayRefundId || 'N/A',
      paymentId: razorpayPaymentId || undefined,
    });

    return {
      ok: true,
      status: 'RESOLVED',
      refund: {
        refundId: razorpayRefundId,
        razorpayPaymentId,
        amount: refundAmount,
        emailSent,
      },
    };
  }

  /**
   * Find matching ChartAlertPayment and determine the Razorpay payment ID.
   * Matches by:
   * 1. payment.id (cuid payment reference from confirmation emails, e.g. cmwd7vein...)
   * 2. payment.razorpayPaymentId (e.g. pay_...)
   * 3. payment.muzoboxPaymentId (e.g. mb_...)
   * 4. payment.razorpayOrderId (e.g. order_...)
   * 5. payment.journeyRequestId
   * 6. Fallback: contactEmail + trainNumber + journeyDate on PAID payments
   */
  private async findPaymentAndRazorpayId(entry: RefundRequest): Promise<{
    payment: ChartAlertPayment | null;
    razorpayPaymentId: string | null;
  }> {
    const txnId = entry.txnId?.trim() || null;
    let payment: ChartAlertPayment | null = null;

    if (txnId) {
      // 1. Payment CUID reference (sent to users as paymentRef in confirmation email)
      payment = await this.prisma.chartAlertPayment.findUnique({
        where: { id: txnId },
      });

      // 2. Direct Razorpay payment ID
      if (!payment) {
        payment = await this.prisma.chartAlertPayment.findFirst({
          where: { razorpayPaymentId: txnId },
        });
      }

      // 3. Muzobox payment ID
      if (!payment) {
        payment = await this.prisma.chartAlertPayment.findFirst({
          where: { muzoboxPaymentId: txnId },
        });
      }

      // 4. Razorpay order ID
      if (!payment) {
        payment = await this.prisma.chartAlertPayment.findFirst({
          where: { razorpayOrderId: txnId },
        });
      }

      // 5. Journey request ID
      if (!payment) {
        payment = await this.prisma.chartAlertPayment.findFirst({
          where: { journeyRequestId: txnId },
        });
      }
    }

    // 6. Fallback: search by email + trainNumber + journeyDate
    if (!payment) {
      const candidates = await this.prisma.chartAlertPayment.findMany({
        where: {
          OR: [
            { contactEmail: { equals: entry.email, mode: 'insensitive' } },
            { contactEmail: entry.email },
          ],
          status: 'PAID',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const entryDateStr =
        entry.journeyDate instanceof Date
          ? entry.journeyDate.toISOString().slice(0, 10)
          : String(entry.journeyDate).slice(0, 10);
      const cleanEntryTrain = entry.trainNumber.replace(/\D/g, '');

      for (const candidate of candidates) {
        const payload = (candidate.journeyPayload ?? {}) as Record<string, any>;
        const pTrain = String(payload.trainNumber ?? '').replace(/\D/g, '');
        const pDate = String(payload.journeyDate ?? '').slice(0, 10);
        if (pTrain === cleanEntryTrain && pDate === entryDateStr) {
          payment = candidate;
          break;
        }
      }

      // If no exact train/date match but only 1 candidate for that email
      if (!payment && candidates.length === 1) {
        payment = candidates[0];
      }
    }

    if (!payment) {
      return { payment: null, razorpayPaymentId: null };
    }

    // Determine the Razorpay payment ID
    let razorpayPaymentId = payment.razorpayPaymentId?.trim() || null;

    // If missing on payment row and txnId starts with "pay_", txnId is the Razorpay payment ID
    if (!razorpayPaymentId && txnId && txnId.startsWith('pay_')) {
      razorpayPaymentId = txnId;
      await this.prisma.chartAlertPayment.update({
        where: { id: payment.id },
        data: { razorpayPaymentId },
      });
    }

    // If still missing and muzoboxPaymentId is present, query Muzobox status endpoint to fetch it
    if (!razorpayPaymentId && payment.muzoboxPaymentId) {
      try {
        const res = await this.muzoboxClient.get<MuzoboxStatusResponse>(
          `proxy-payments/${encodeURIComponent(payment.muzoboxPaymentId)}/status`,
          { headers: muzoboxAuthHeaders(this.configService) },
        );
        const remote = res.data ?? {};
        const remotePaymentId =
          remote.razorpayPaymentId || remote.razorpay_payment_id;
        if (remotePaymentId) {
          razorpayPaymentId = remotePaymentId;
          await this.prisma.chartAlertPayment.update({
            where: { id: payment.id },
            data: {
              razorpayPaymentId,
              razorpayOrderId:
                remote.razorpayOrderId ||
                remote.razorpay_order_id ||
                payment.razorpayOrderId,
            },
          });
        }
      } catch (err) {
        this.logger.warn(
          `Failed to check Muzobox status for payment ref=${payment.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { payment, razorpayPaymentId };
  }

  /**
   * Initiate refund via Muzobox proxy payment refund endpoint.
   * Falls back to direct Razorpay if Muzobox proxy payment is unavailable and direct Razorpay is configured.
   */
  private async executeMuzoboxRefund(
    entry: RefundRequest,
    payment: ChartAlertPayment,
    razorpayPaymentId: string | null,
  ): Promise<{ refundId: string; razorpayPaymentId?: string | null }> {
    const proxyPaymentId =
      payment.muzoboxPaymentId?.trim() ||
      razorpayPaymentId?.trim() ||
      (entry.txnId?.startsWith('pay_') ? entry.txnId.trim() : null);

    if (!proxyPaymentId) {
      throw new BadRequestException({
        code: 'NO_PAYMENT_GATEWAY_ID',
        message: `Cannot initiate refund: No Muzobox payment ID or Razorpay payment ID found on payment ref=${payment.id}.`,
      });
    }

    try {
      const res = await this.muzoboxClient.post<MuzoboxRefundResponse>(
        `proxy-payments/${encodeURIComponent(proxyPaymentId)}/refund`,
        {
          amount: payment.amount,
          reason:
            `Manual refund for ${entry.email} - Train ${entry.trainNumber}`.slice(
              0,
              500,
            ),
          referenceId: payment.id,
        },
        { headers: muzoboxAuthHeaders(this.configService) },
      );

      const data = res.data ?? {};
      const status = String(data.status ?? '').toLowerCase();
      if (status !== 'refunded' && status !== 'already_refunded') {
        throw new Error(
          `Muzobox refund returned unexpected status: ${String(data.status ?? 'missing')}`,
        );
      }

      const refundId =
        data.razorpayRefundId ??
        payment.razorpayRefundId ??
        `rfnd_mb_${payment.id}`;
      const foundPaymentId = data.razorpayPaymentId || razorpayPaymentId;

      await this.prisma.chartAlertPayment.update({
        where: { id: payment.id },
        data: {
          refundStatus: 'SUCCEEDED',
          razorpayRefundId: refundId,
          ...(foundPaymentId ? { razorpayPaymentId: foundPaymentId } : {}),
          refundAmount:
            typeof data.amount === 'number' ? data.amount : payment.amount,
          refundedAt: data.refundedAt ? new Date(data.refundedAt) : new Date(),
          refundResponse: data as unknown as Prisma.InputJsonValue,
          refundError: null,
        },
      });

      this.logger.log(
        `Muzobox refund succeeded for payment=${payment.id} refundId=${refundId}`,
      );

      return { refundId, razorpayPaymentId: foundPaymentId };
    } catch (err: unknown) {
      const msg = this.describeMuzoboxError(err);
      const lower = msg.toLowerCase();

      // Check if gateway reports already refunded
      if (
        lower.includes('already refunded') ||
        lower.includes('already_refunded') ||
        lower.includes('fully refunded already')
      ) {
        this.logger.warn(
          `Payment ${payment.id} was already refunded on gateway: ${msg}`,
        );
        const refundId =
          payment.razorpayRefundId || `rfnd_already_refunded_${payment.id}`;
        await this.prisma.chartAlertPayment.update({
          where: { id: payment.id },
          data: {
            refundStatus: 'SUCCEEDED',
            razorpayRefundId: refundId,
            refundAmount: payment.amount,
            refundedAt: new Date(),
            refundError: null,
          },
        });
        return { refundId, razorpayPaymentId };
      }

      // If direct Razorpay client is configured and we have a direct razorpayPaymentId, try fallback
      if (razorpayPaymentId && this.razorpay && this.razorpay.isConfigured) {
        try {
          this.logger.warn(
            `Muzobox refund failed (${msg}); attempting direct Razorpay refund for payment ${razorpayPaymentId}`,
          );
          const directRefund = await this.razorpay.createRefund({
            paymentId: razorpayPaymentId,
            amountPaise: payment.amount * 100,
            notes: {
              refundRequestId: entry.id,
              paymentRef: payment.id,
              reason:
                `Manual refund for ${entry.email} - Train ${entry.trainNumber}`.slice(
                  0,
                  200,
                ),
            },
          });
          const refundId = directRefund.id || `rfnd_direct_${payment.id}`;
          await this.prisma.chartAlertPayment.update({
            where: { id: payment.id },
            data: {
              refundStatus: 'SUCCEEDED',
              razorpayRefundId: refundId,
              refundAmount: payment.amount,
              refundedAt: new Date(),
              refundError: null,
            },
          });
          return { refundId, razorpayPaymentId };
        } catch (directErr) {
          const directMsg =
            directErr instanceof Error ? directErr.message : String(directErr);
          const combinedMsg = `${msg}; Direct Razorpay: ${directMsg}`;
          await this.recordRefundFailure(entry.id, payment.id, combinedMsg);
          throw new BadRequestException(
            `Refund failed via Muzobox: ${msg}. Direct Razorpay fallback also failed: ${directMsg}`,
          );
        }
      }

      await this.recordRefundFailure(entry.id, payment.id, msg);
      throw new BadRequestException(msg);
    }
  }

  /** Record refund failure message on both models so the dashboard indicates why. */
  private async recordRefundFailure(
    refundRequestId: string,
    paymentId: string,
    error: string,
  ): Promise<void> {
    const errorSnippet = error.slice(0, 1000);
    await Promise.all([
      this.prisma.refundRequest.update({
        where: { id: refundRequestId },
        data: { refundError: errorSnippet },
      }),
      this.prisma.chartAlertPayment.update({
        where: { id: paymentId },
        data: { refundStatus: 'FAILED', refundError: errorSnippet },
      }),
    ]);
  }

  /** Send customer email notifying them of the refund and displaying the alert details. */
  private async sendCustomerRefundEmail(params: {
    entry: RefundRequest;
    payment: ChartAlertPayment;
    amount: number;
    refundId: string;
    paymentId?: string;
  }): Promise<boolean> {
    const { entry, payment, amount, refundId, paymentId } = params;
    const payload = (payment.journeyPayload ?? {}) as Record<string, any>;
    const trainNumber = String(
      payload.trainNumber || entry.trainNumber || '',
    ).trim();

    let trainName = String(payload.trainName || '').trim();
    if (!trainName) {
      try {
        const train = await this.prisma.trainList.findFirst({
          where: { trainNumber },
          select: { label: true },
        });
        if (train) {
          const dashIndex = train.label.indexOf('-');
          trainName =
            dashIndex >= 0
              ? train.label.slice(dashIndex + 1).trim()
              : train.label;
        }
      } catch {
        // Non-blocking lookup failure
      }
    }

    const fromStationCode = String(payload.fromStationCode || '').trim();
    const toStationCode = String(payload.toStationCode || '').trim();
    const journeyDateStr = String(
      payload.journeyDate ||
        (entry.journeyDate instanceof Date
          ? entry.journeyDate.toISOString().slice(0, 10)
          : entry.journeyDate),
    ).slice(0, 10);
    const classCode = String(payload.classCode || '').trim();
    const recipient =
      entry.email || String(payload.email || payment.contactEmail || '').trim();

    try {
      return await this.notifications.sendManualRefundProcessedEmail({
        email: recipient,
        amount,
        refundId,
        paymentId,
        trainNumber,
        trainName: trainName || undefined,
        fromStationCode: fromStationCode || undefined,
        toStationCode: toStationCode || undefined,
        journeyDate: journeyDateStr,
        classCode: classCode || undefined,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send refund email to ${recipient} for request ${entry.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private sendAdminEmail(entry: {
    id: string;
    email: string;
    trainNumber: string;
    journeyDate: Date;
    txnId: string | null;
    createdAt: Date;
    duplicate: boolean;
  }): Promise<boolean> {
    return this.notifications.sendRefundRequestAdminEmail({
      id: entry.id,
      email: entry.email,
      trainNumber: entry.trainNumber,
      journeyDate: entry.journeyDate.toISOString().slice(0, 10),
      txnId: entry.txnId,
      createdAt: entry.createdAt.toISOString(),
      duplicate: entry.duplicate,
    });
  }

  private describeMuzoboxError(err: unknown): string {
    if (isAxiosError(err)) {
      const payload = err.response?.data as
        | { message?: unknown; error?: unknown }
        | undefined;
      const fromBody =
        (Array.isArray(payload?.message)
          ? payload?.message.join('; ')
          : payload?.message) ?? payload?.error;
      if (typeof fromBody === 'string' && fromBody.trim())
        return `Muzobox refund failed: ${fromBody.trim().slice(0, 500)}`;
      if (err.response?.status)
        return `Muzobox refund failed with HTTP ${err.response.status}`;
      return `Muzobox refund request failed: ${err.message}`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
