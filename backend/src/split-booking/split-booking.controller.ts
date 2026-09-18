import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SplitBookingService } from './split-booking.service';
import type { CreateSplitBookingDto } from './split-booking.types';
import { verifyRazorpayWebhookSignature } from '../chart-alert-payments/razorpay.client';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';

@Controller('api/split-booking')
export class SplitBookingController {
  constructor(
    private readonly splitBookingService: SplitBookingService,
    private readonly razorpay: RazorpayClient,
  ) {}

  @Post('create')
  async create(@Body() body: CreateSplitBookingDto) {
    if (!body) {
      throw new BadRequestException('Request body is required');
    }
    return this.splitBookingService.createBooking(body);
  }

  @Get('status/:bookingRef')
  async getStatus(@Param('bookingRef') bookingRef: string) {
    if (!bookingRef?.trim()) {
      throw new BadRequestException('bookingRef is required');
    }
    return this.splitBookingService.getStatus(bookingRef.trim());
  }

  /**
   * Helper endpoint for development/testing and local verification:
   * marks the payment as paid and triggers background Playwright automation.
   */
  @Post('simulate-pay/:bookingRef')
  async simulatePayment(@Param('bookingRef') bookingRef: string) {
    if (!bookingRef?.trim()) {
      throw new BadRequestException('bookingRef is required');
    }
    return this.splitBookingService.confirmPayment(bookingRef.trim());
  }

  /**
   * Razorpay Webhook endpoint for live payments.
   */
  @Post('callback')
  async handleCallback(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const secret = this.razorpay.webhookSecret;

    if (secret && signature) {
      const isValid = verifyRazorpayWebhookSignature(
        rawBody,
        signature,
        secret,
      );
      if (!isValid) {
        return { received: false, error: 'Invalid webhook signature' };
      }
    }

    try {
      const body = req.body as Record<string, unknown>;
      const payload = body?.payload as Record<string, unknown> | undefined;
      const paymentEntity = payload?.payment as
        | Record<string, unknown>
        | undefined;
      const payment = paymentEntity?.entity as
        | Record<string, unknown>
        | undefined;

      const notes = (payment?.notes as Record<string, unknown>) || {};
      const bookingRef =
        (notes.bookingRef as string) || (notes.booking_ref as string);

      if (bookingRef) {
        await this.splitBookingService.confirmPayment(
          bookingRef,
          payment?.id as string,
        );
      }
    } catch {
      // Always ack Razorpay webhooks to prevent retries
    }

    return { received: true };
  }
}
