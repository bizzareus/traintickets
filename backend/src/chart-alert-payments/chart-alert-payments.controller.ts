import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChartAlertPaymentsService } from './chart-alert-payments.service';
import type { ChartAlertJourneyInput } from './chart-alert-payments.service';

@Controller('api/chart-alert-payments')
export class ChartAlertPaymentsController {
  constructor(private readonly payments: ChartAlertPaymentsService) {}

  /**
   * Create a Muzobox hosted payment link for a chart-alert subscription.
   * Returns `{ ref, payUrl, amount }` — the frontend redirects to `payUrl`.
   * Throws 400 for invalid input, 503 when the payment proxy is unavailable.
   */
  @Post('create')
  async create(@Body() body: ChartAlertJourneyInput) {
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
        chartTimeLocal: body.chartTimeLocal?.trim() || undefined,
        chartOneDayOffset: body.chartOneDayOffset,
        chartTwoTimeLocal: body.chartTwoTimeLocal?.trim() || undefined,
        chartTwoDayOffset: body.chartTwoDayOffset,
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

  /** Server-to-server callback from the Muzobox payment proxy. */
  @Post('callback')
  async handleCallback(@Body() body: Record<string, unknown>) {
    // Always ack so the proxy does not retry a poison payload.
    await this.payments
      .handleCallback(
        (body ?? {}) as {
          paymentId?: string;
          payment_id?: string;
          status?: string;
          referenceId?: string;
          reference_id?: string;
        },
      )
      .catch(() => undefined);
    return { received: true };
  }
}
