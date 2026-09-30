import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';
import { RefundRequestService } from './refund-request.service';
import { CreateRefundRequestDto } from './refund-request.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('api/refund-requests')
export class RefundRequestController {
  constructor(private readonly refunds: RefundRequestService) {}

  /** Public: submit a manual refund request from the /refund form. */
  @Post()
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  async create(
    @Body() body: CreateRefundRequestDto,
  ): Promise<{ ok: true; id: string; duplicate: boolean }> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException({
        code: 'INVALID_BODY',
        message: 'Request body is required.',
      });
    }
    const { id, duplicate } = await this.refunds.create(body);
    return { ok: true, id, duplicate };
  }

  // --- Admin endpoints (gated by x-admin-password) -------------------------

  @Get('admin')
  async adminList(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ): Promise<{ entries: Awaited<ReturnType<RefundRequestService['list']>> }> {
    assertAdminAuth({ headerPw: pw, req });
    return { entries: await this.refunds.list() };
  }

  @Patch('admin/:id')
  async adminSetStatus(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ): Promise<{ ok: true }> {
    assertAdminAuth({ headerPw: pw, req });
    return this.refunds.setStatus(id, body?.status ?? '');
  }
}
