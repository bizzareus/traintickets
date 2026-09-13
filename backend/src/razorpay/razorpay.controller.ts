import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RazorpayService } from './razorpay.service';
import { CreateQrPaymentInput } from './razorpay.service';

@Controller('api/razorpay')
export class RazorpayController {
  constructor(private readonly razorpay: RazorpayService) {}

  @Post('qr-code')
  async createQrCode(@Body() body: CreateQrPaymentInput) {
    if (!body?.trainNumber || !body?.fromStationCode || !body?.journeyDate) {
      return {
        error: 'trainNumber, fromStationCode and journeyDate are required',
      };
    }
    try {
      return await this.razorpay.createQrPayment(body);
    } catch (err) {
      const message =
        err instanceof ServiceUnavailableException
          ? 'Payment system is not configured. Please try again later.'
          : err instanceof Error
            ? err.message
            : String(err);
      return { error: message };
    }
  }

  @Get('payment-status/:qrCodeId')
  async getPaymentStatus(@Param('qrCodeId') qrCodeId: string) {
    try {
      return await this.razorpay.checkPaymentStatus(qrCodeId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not fetch payment status';
      return { error: message };
    }
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const event = req.body;
    try {
      return await this.razorpay.handleWebhook(signature, event);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Webhook processing failed';
      return { error: message };
    }
  }
}
