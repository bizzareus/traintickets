import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ChartAlertPaymentsService } from './chart-alert-payments.service';
import { requirePinnedChartTime } from '../availability/chart-task-schedule';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { JourneyRequestDto } from '../availability/journey.dto';

@Controller('api/chart-alert-payments')
@Throttle({ global: { limit: 60, ttl: 60_000 } })
export class ChartAlertPaymentsController {
  constructor(private readonly payments: ChartAlertPaymentsService) {}

  /**
   * Create a Razorpay order + single-use UPI QR for a chart-alert
   * subscription. Returns `{ ref, amount, orderId, qrImageUrl, upiIntent,
   * gpayIntent, phonepeIntent }` — the frontend renders its own checkout.
   * Throws 400 for invalid input, 503 when Razorpay is unavailable.
   */
  @Post('create')
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  async create(@Body() body: JourneyRequestDto) {
    if (!body?.trainNumber?.trim() || !body?.fromStationCode?.trim()) {
      throw new BadRequestException(
        'trainNumber and fromStationCode are required',
      );
    }
    if (!body?.journeyDate?.trim() || !body?.classCode?.trim()) {
      throw new BadRequestException('journeyDate and classCode are required');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.journeyDate.trim().slice(0, 10))) {
      throw new BadRequestException('journeyDate must be in YYYY-MM-DD format');
    }
    if (!body?.email?.trim() && !body?.mobile?.trim()) {
      throw new BadRequestException('An email or mobile number is required');
    }
    const chartTimes = requirePinnedChartTime(body);
    try {
      return await this.payments.createPaymentLink({
        trainNumber: body.trainNumber.trim(),
        trainName: body.trainName?.trim() || undefined,
        fromStationCode: body.fromStationCode.trim().toUpperCase(),
        toStationCode: (body.toStationCode ?? '').trim().toUpperCase(),
        journeyDate: body.journeyDate.trim().slice(0, 10),
        classCode: body.classCode.trim().toUpperCase(),
        stationCodesToMonitor: body.stationCodesToMonitor,
        email: body.email?.trim() || undefined,
        mobile: body.mobile?.trim() || undefined,
        trainStartDate: body.trainStartDate,
        ...chartTimes,
      });
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'Could not start payment',
      );
    }
  }

  /**
   * Status for the payment-complete return page. Re-verifies with Muzobox
   * server-to-server and fulfils the alert subscription on first paid sighting.
   */
  @Get('status/:ref')
  async getStatus(@Param('ref') ref: string) {
    if (!String(ref ?? '').trim()) {
      throw new BadRequestException('Payment reference is required');
    }
    return this.payments.getStatus(String(ref).trim());
  }

  /**
   * Server-to-server Razorpay webhook. The HMAC signature is verified
   * against the raw body — this requires `rawBody: true` in main.ts.
   * Malformed events are acknowledged; retryable processing failures propagate.
   */
  @Post('callback')
  @SkipThrottle({ global: true })
  async handleCallback(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    await this.payments.handleCallback(
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
    return { received: true };
  }
}
