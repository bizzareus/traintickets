import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChartAlertPaymentsService } from './chart-alert-payments.service';
import type { ChartAlertJourneyInput } from './chart-alert-payments.service';

@Controller('api/chart-alert-payments')
export class ChartAlertPaymentsController {
  constructor(private readonly payments: ChartAlertPaymentsService) {}

  /**
   * Create a Muzobox hosted payment link for a chart-alert subscription.
   * Returns `{ ref, payUrl, amount }` — the frontend redirects to `payUrl`.
   */
  @Post('create')
  async create(@Body() body: ChartAlertJourneyInput) {
    if (!body?.trainNumber?.trim() || !body?.fromStationCode?.trim()) {
      return { error: 'trainNumber and fromStationCode are required' };
    }
    if (!body?.journeyDate?.trim() || !body?.classCode?.trim()) {
      return { error: 'journeyDate and classCode are required' };
    }
    if (!body?.email?.trim() && !body?.mobile?.trim()) {
      return { error: 'An email or mobile number is required' };
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
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not start payment';
      return { error: message };
    }
  }

  /**
   * Status for the payment-complete return page. Re-verifies with Muzobox
   * server-to-server and fulfils the alert subscription on first paid sighting.
   */
  @Get('status/:ref')
  async getStatus(@Param('ref') ref: string) {
    try {
      return await this.payments.getStatus(ref);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not fetch payment status';
      return { error: message };
    }
  }

  /** Server-to-server callback from the Muzobox payment proxy. */
  @Post('callback')
  async handleCallback(@Body() body: Record<string, unknown>) {
    try {
      return await this.payments.handleCallback(
        (body ?? {}) as {
          paymentId?: string;
          status?: string;
          referenceId?: string;
        },
      );
    } catch {
      // Always ack so the proxy does not retry a poison payload.
      return { received: true };
    }
  }
}
