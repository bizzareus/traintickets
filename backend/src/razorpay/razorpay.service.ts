import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { PaymentTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from '../availability/journey-task.service';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import type { AxiosInstance } from 'axios';

const CHART_ALERT_PRICE_RUPEES = 5;
const QR_EXPIRY_SECONDS = 3600;
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1/';

export type JourneyPayload = {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  stationCodesToMonitor?: string[];
  email?: string;
  mobile?: string;
  trainStartDate?: string;
};

export type CreateQrPaymentInput = JourneyPayload & { amount?: number };

export type QrPaymentResult = {
  qr_code_id: string;
  qr_image: string;
  amount: number;
  currency: string;
  expires_at: string;
};

export type PaymentStatusResult = {
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  qr_code_id: string;
  payments_count_received: number;
  payments_amount_received: number;
  journeyRequestId?: string | null;
};

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly client: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private journeyTask: JourneyTaskService,
  ) {
    this.client = createRetryingAxiosClient({
      serviceName: 'razorpay',
      retries: 2,
      retryPost: false,
    });
    this.client.defaults.baseURL = RAZORPAY_API_BASE;
    this.client.defaults.timeout = 15_000;
  }

  private get credentials(): { keyId: string; keySecret: string } {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Payment system is not configured. Please try again later.',
      );
    }
    return { keyId, keySecret };
  }

  private authHeaders() {
    const { keyId, keySecret } = this.credentials;
    return {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    };
  }

  async createQrPayment(input: CreateQrPaymentInput): Promise<QrPaymentResult> {
    const { keyId, keySecret } = this.credentials;
    const amount = Math.round((input.amount ?? CHART_ALERT_PRICE_RUPEES) * 100);
    const closeBy = Math.floor(Date.now() / 1000) + QR_EXPIRY_SECONDS;

    const res = await this.client.post(
      'payments/qr_codes',
      {
        type: 'upi_qr',
        name: 'LastBerth Chart Alert',
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: amount,
        description: `Chart alert payment for ${input.trainNumber} on ${input.journeyDate}`,
        close_by: closeBy,
        notes: {
          source: 'chart_alert',
          train_number: input.trainNumber,
          journey_date: input.journeyDate,
        },
      },
      { headers: this.authHeaders() },
    );

    const qr = res.data as {
      id: string;
      image_url: string;
      payment_amount: number;
      status: string;
      payments_count_received?: number;
      payments_amount_received?: number;
      close_by?: number;
    };

    const qrImage = await this.fetchQrImage(qr.image_url);

    const tx = await this.prisma.paymentTransaction.create({
      data: {
        qrCodeId: qr.id,
        amount,
        currency: 'INR',
        contactEmail: input.email?.trim() || undefined,
        contactMobile: input.mobile?.trim() || undefined,
        journeyPayload: {
          trainNumber: input.trainNumber,
          trainName: input.trainName,
          fromStationCode: input.fromStationCode,
          toStationCode: input.toStationCode,
          journeyDate: input.journeyDate,
          classCode: input.classCode,
          stationCodesToMonitor: input.stationCodesToMonitor,
          email: input.email,
          mobile: input.mobile,
        },
      },
    });

    this.logger.log(
      `Created QR payment tx=${tx.id} qr=${qr.id} for ${input.trainNumber}`,
    );

    return {
      qr_code_id: qr.id,
      qr_image: qrImage,
      amount,
      currency: 'INR',
      expires_at: new Date(closeBy * 1000).toISOString(),
    };
  }

  private async fetchQrImage(imageUrl: string): Promise<string> {
    if (!imageUrl) return '';
    try {
      const res = await this.client.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: { Accept: 'image/*' },
      });
      const buffer = Buffer.from(res.data);
      const mimeType =
        (res.headers['content-type'] as string | undefined) ||
        'image/png';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (err) {
      this.logger.warn(
        `Could not fetch QR image from ${imageUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return imageUrl;
    }
  }

  async checkPaymentStatus(qrCodeId: string): Promise<PaymentStatusResult> {
    const { keyId, keySecret } = this.credentials;

    const res = await this.client.get(`payments/qr_codes/${qrCodeId}`, {
      headers: this.authHeaders(),
    });

    const qr = res.data as {
      status: string;
      payments_count_received: number;
      payments_amount_received: number;
      payments?: Array<{ id: string; status: string }>;
    };

    const tx = await this.prisma.paymentTransaction.findFirst({
      where: { qrCodeId },
    });

    if (!tx) {
      throw new NotFoundException('Payment transaction not found');
    }

    const paid = (qr.payments_count_received ?? 0) > 0;

    if (paid && tx.status !== 'PAID') {
      const paymentId = qr.payments?.[0]?.id;
      await this.confirmPayment(tx, qr, paymentId);
    }

    if (tx.status === 'PAID') {
      return {
        status: 'paid',
        qr_code_id: tx.qrCodeId ?? '',
        payments_count_received: qr.payments_count_received ?? 0,
        payments_amount_received: qr.payments_amount_received ?? 0,
        journeyRequestId: tx.journeyRequestId,
      };
    }

    const status: 'pending' | 'failed' | 'refunded' =
      tx.status === 'PENDING' ? 'pending' : (tx.status.toLowerCase() as 'pending' | 'failed' | 'refunded');

    return {
      status,
      qr_code_id: tx.qrCodeId ?? '',
      payments_count_received: qr.payments_count_received ?? 0,
      payments_amount_received: qr.payments_amount_received ?? 0,
      journeyRequestId: tx.journeyRequestId,
    };
  }

  private async confirmPayment(
    tx: PaymentTransaction,
    qr: { payments_count_received: number; payments_amount_received: number },
    razorpayPaymentId?: string,
  ): Promise<void> {
    const journeyRequestId = randomUUID();

    const payload = tx.journeyPayload as JourneyPayload | null;

    if (payload) {
      void this.journeyTask
        .queueJourneyMonitoring(payload, journeyRequestId)
        .then(() => {
          this.logger.log(
            `Journey monitoring triggered for paid tx=${tx.id} jid=${journeyRequestId}`,
          );
        })
        .catch((err) => {
          this.logger.error(
            `Failed to trigger journey monitoring for paid tx=${tx.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else {
      this.logger.warn(
        `Payment confirmed for tx=${tx.id} but journeyPayload is missing; skipping journey monitoring trigger`,
      );
    }

    await this.prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'PAID',
        razorpayPaymentId: razorpayPaymentId,
        journeyRequestId,
        paidAt: new Date(),
      },
    });
  }

  async handleWebhook(signature: string | undefined, event: unknown): Promise<{ received: boolean }> {
    if (!signature) {
      this.logger.warn('Razorpay webhook received without signature header');
      return { received: false };
    }

    const { keyId, keySecret } = this.credentials;

    const eventObj = event as {
      event?: string;
      payload?: {
        payment?: {
          entity?: { id: string; order_id?: string };
        };
        qr_code?: { entity?: { id: string } };
      };
    };

    const eventType = eventObj.event;
    this.logger.log(`Razorpay webhook received: ${eventType}`);

    if (eventType === 'payment.captured' || eventType === 'payment_link.paid') {
      const qrCodeId = eventObj.payload?.qr_code?.entity?.id;
      const paymentId = eventObj.payload?.payment?.entity?.id;

      if (qrCodeId) {
        const tx = await this.prisma.paymentTransaction.findFirst({
          where: { qrCodeId },
        });
        if (tx && tx.status !== 'PAID') {
          await this.confirmPayment(
            tx,
            { payments_count_received: 1, payments_amount_received: tx.amount },
            paymentId,
          );
        }
      }
    }

    return { received: true };
  }
}
