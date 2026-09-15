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

@Controller('api/refund-requests')
export class RefundRequestController {
  constructor(private readonly refunds: RefundRequestService) {}

  /** Public: submit a manual refund request from the /refund form. */
  @Post()
  async create(
    @Body()
    body: {
      mobile?: string;
      trainNumber?: string;
      journeyDate?: string;
      txnId?: string;
    },
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
