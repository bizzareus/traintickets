import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SearchCreditsService } from './search-credits.service';
import { SearchCreditPurchasesService } from './search-credit-purchases.service';
import {
  AdmitSearchDto,
  CompleteSearchDto,
  CreatePurchaseDto,
  MuzoboxCallbackDto,
} from './search-credits.dto';

@Controller('api/search-credits')
export class SearchCreditsController {
  constructor(
    private readonly credits: SearchCreditsService,
    private readonly purchases: SearchCreditPurchasesService,
  ) {}

  @Get('balance')
  @Throttle({ global: { limit: 60, ttl: 60_000 } })
  async balance(@Req() req: Request) {
    const balance = await this.credits.getBalance(req);
    return {
      authenticated: balance.userId != null,
      freeUsed: balance.freeUsed,
      freeRemaining: balance.freeRemaining,
      paidBalance: balance.paidBalance,
    };
  }

  /**
   * Lightweight admission for cached previews (no search computation).
   * Live scans admit inside BookingV2Controller instead.
   */
  @Post('admit')
  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  async admit(@Req() req: Request, @Body() body: AdmitSearchDto) {
    if (
      !body?.trainNumber?.trim() ||
      !body?.from?.trim() ||
      !body?.to?.trim()
    ) {
      throw new BadRequestException('trainNumber, from, and to are required');
    }
    const admission = await this.credits.admitSearch({
      req,
      requestId: body.searchRequestId,
      trainNumber: body.trainNumber,
      from: body.from,
      to: body.to,
      date: body.date ?? '',
      classes: body.classes,
      quota: body.quota,
    });
    if (body.markCompleted === true) {
      await this.credits.completeSearch(admission.requestId, 'SUCCESS');
    }
    return {
      allowed: true as const,
      requestId: admission.requestId,
      source: admission.source,
      freeRemaining: admission.freeRemaining,
      paidBalance: admission.paidBalance,
    };
  }

  @Post('complete')
  @Throttle({ global: { limit: 60, ttl: 60_000 } })
  async complete(@Body() body: CompleteSearchDto) {
    if (!body?.requestId?.trim()) {
      throw new BadRequestException('requestId is required');
    }
    await this.credits.completeSearch(
      body.requestId.trim(),
      body.outcome,
      body.error,
    );
    return { ok: true as const };
  }

  @Post('purchases')
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  async createPurchase(@Req() req: Request, @Body() body: CreatePurchaseDto) {
    return this.purchases.createPurchase(req, body ?? {});
  }

  @Get('purchases/:ref')
  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  async purchaseStatus(@Req() req: Request, @Param('ref') ref: string) {
    if (!ref?.trim()) throw new BadRequestException('ref is required');
    return this.purchases.getStatus(ref.trim(), req);
  }

  @Post('purchases/:ref/verify')
  @Throttle({ global: { limit: 20, ttl: 60_000 } })
  async verifyPurchase(@Req() req: Request, @Param('ref') ref: string) {
    if (!ref?.trim()) throw new BadRequestException('ref is required');
    return this.purchases.verify(ref.trim(), req);
  }

  @Post('muzobox-callback')
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  async muzoboxCallback(@Body() body: MuzoboxCallbackDto) {
    if (!body?.paymentId?.trim() || !body?.referenceId?.trim()) {
      throw new BadRequestException('paymentId and referenceId are required');
    }
    return this.purchases.handleMuzoboxCallback(
      body.paymentId.trim(),
      body.referenceId.trim(),
    );
  }
}
