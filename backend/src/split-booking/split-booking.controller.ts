import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';
import { SplitBookingService } from './split-booking.service';
import { CreateSplitBookingDto } from './split-booking.dto';
import { verifyRazorpayWebhookSignature } from '../chart-alert-payments/razorpay.client';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@Controller('api/split-booking')
@Throttle({ global: { limit: 60, ttl: 60_000 } })
export class SplitBookingController {
  constructor(
    private readonly splitBookingService: SplitBookingService,
    private readonly razorpay: RazorpayClient,
  ) {}

  @Post('create')
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
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

  @Post('muzobox-callback')
  async handleMuzoboxCallback(
    @Body() body: { paymentId?: unknown; referenceId?: unknown },
  ) {
    if (
      typeof body?.paymentId !== 'string' ||
      !body.paymentId.trim() ||
      typeof body?.referenceId !== 'string' ||
      !body.referenceId.trim()
    ) {
      throw new BadRequestException('paymentId and referenceId are required');
    }
    return this.splitBookingService.handleMuzoboxCallback(
      body.paymentId.trim(),
      body.referenceId.trim(),
    );
  }

  /**
   * Helper endpoint for development/testing and local verification:
   * marks the payment as paid and triggers background computer-use automation.
   */
  @Post('simulate-pay/:bookingRef')
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  async simulatePayment(@Param('bookingRef') bookingRef: string) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    if (!bookingRef?.trim()) {
      throw new BadRequestException('bookingRef is required');
    }
    return this.splitBookingService.confirmPayment(bookingRef.trim());
  }

  /**
   * Razorpay Webhook endpoint for live payments.
   */
  @Post('callback')
  @SkipThrottle({ global: true })
  async handleCallback(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const secret = this.razorpay.webhookSecret;

    if (!verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body as Record<string, unknown>;
    if (body.event !== 'payment.captured') return { received: true };
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
      if (
        payment?.status !== 'captured' ||
        typeof payment.id !== 'string' ||
        typeof payment.amount !== 'number' ||
        typeof payment.currency !== 'string'
      ) {
        throw new BadRequestException(
          'A captured payment is required for reservation',
        );
      }
      await this.splitBookingService.confirmPayment(bookingRef, payment.id, {
        amount: payment.amount,
        currency: payment.currency,
        orderId:
          typeof payment.order_id === 'string' ? payment.order_id : undefined,
      });
    }

    return { received: true };
  }

  // --- Admin portal endpoints ------------------------------------------------

  @Get('admin')
  async adminList(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.splitBookingService.adminListBookings();
  }

  @Patch('admin/:id')
  async adminUpdate(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      bookingStatus?: any;
      paymentStatus?: any;
      razorpayPaymentId?: string;
      pnrs?: string[];
      pnrLeg1?: string;
      pnrLeg2?: string;
      bookingError?: string | null;
    },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.splitBookingService.adminUpdateBooking(id, body);
  }

  @Post('admin/:id/ticket-pdf')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }),
  )
  async adminUploadTicketPdf(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
    },
    @Body() body?: { base64?: string; filename?: string; contentType?: string },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.splitBookingService.adminUploadTicketPdf(id, file, body);
  }

  @Get('ticket-pdf/:bookingRef')
  async getTicketPdf(
    @Param('bookingRef') bookingRef: string,
    @Query('json') json: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.splitBookingService.getTicketPdf(bookingRef);
    if ('redirectUrl' in result && result.redirectUrl) {
      if (json === 'true' || json === '1') {
        return res.json({
          ok: true,
          signedUrl: result.redirectUrl,
          filename: result.filename,
        });
      }
      return res.redirect(302, result.redirectUrl);
    }
    if ('buffer' in result) {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(result.filename)}"`,
      );
      return res.send(Buffer.from(result.buffer));
    }
  }

  @Post('admin/:id/notify-user')
  async adminNotifyCustomer(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      channel?: 'email' | 'whatsapp' | 'both';
      message?: string;
      pnrLeg1?: string;
      pnrLeg2?: string;
      pnrs?: string[];
      pdf?: {
        base64: string;
        filename?: string;
        contentType?: string;
      };
    },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.splitBookingService.adminNotifyCustomer(id, body);
  }
}
