import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';
import { NotificationUnsubscribeService } from './notification-unsubscribe.service';

@Controller('api/notifications')
export class NotificationUnsubscribeController {
  constructor(
    private readonly unsubscribeService: NotificationUnsubscribeService,
  ) {}

  @Post('unsubscribe')
  async unsubscribe(
    @Body() body: { recipient: string; reason?: string },
  ): Promise<{ ok: true }> {
    await this.unsubscribeService.unsubscribe(body.recipient, body.reason);
    return { ok: true };
  }

  @Post('resubscribe')
  async resubscribe(
    @Body() body: { recipient: string },
  ): Promise<{ ok: true }> {
    await this.unsubscribeService.resubscribe(body.recipient);
    return { ok: true };
  }

  @Get('unsubscribe/status')
  async status(
    @Query('recipient') recipient: string,
  ): Promise<{ unsubscribed: boolean }> {
    const unsubscribed =
      await this.unsubscribeService.isUnsubscribed(recipient);
    return { unsubscribed };
  }

  // --- Admin endpoints (gated by x-admin-password) -------------------------

  @Get('admin/unsubscribes')
  async adminList(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ): Promise<{
    entries: Awaited<ReturnType<NotificationUnsubscribeService['list']>>;
  }> {
    assertAdminAuth({ headerPw: pw, req });
    return { entries: await this.unsubscribeService.list() };
  }

  @Post('admin/unsubscribes')
  async adminAdd(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body() body: { recipient: string; reason?: string },
  ): Promise<{ ok: true }> {
    assertAdminAuth({ headerPw: pw, req });
    await this.unsubscribeService.unsubscribe(body.recipient, body.reason);
    return { ok: true };
  }

  @Delete('admin/unsubscribes/:id')
  async adminRemove(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ removed: boolean }> {
    assertAdminAuth({ headerPw: pw, req });
    return this.unsubscribeService.removeById(id);
  }
}
