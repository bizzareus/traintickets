import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { NotificationService } from './notification.service';
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './unsubscribe-token';
import { Throttle } from '@nestjs/throttler';

@Controller('api/notifications')
@Throttle({ global: { limit: 10, ttl: 60_000 } })
export class NotificationUnsubscribeController {
  constructor(
    private readonly unsubscribeService: NotificationUnsubscribeService,
    private readonly notifications: NotificationService,
  ) {}

  /** Only holders of a valid recipient-signed token may change opt-out state. */
  private assertToken(
    recipient: string | undefined,
    token: string | undefined,
  ): void {
    if (!verifyUnsubscribeToken(recipient, token)) {
      throw new ForbiddenException(
        'Invalid or missing unsubscribe token. Request a fresh link.',
      );
    }
  }

  @Post('unsubscribe')
  async unsubscribe(
    @Body() body: { recipient: string; token?: string; reason?: string },
  ): Promise<{ ok: true }> {
    this.assertToken(body?.recipient, body?.token);
    await this.unsubscribeService.unsubscribe(body.recipient, body.reason);
    return { ok: true };
  }

  @Post('resubscribe')
  async resubscribe(
    @Body() body: { recipient: string; token?: string },
  ): Promise<{ ok: true }> {
    this.assertToken(body?.recipient, body?.token);
    await this.unsubscribeService.resubscribe(body.recipient);
    return { ok: true };
  }

  @Get('unsubscribe/status')
  async status(
    @Query('recipient') recipient: string,
    @Query('token') token: string,
  ): Promise<{ unsubscribed: boolean }> {
    this.assertToken(recipient, token);
    const unsubscribed =
      await this.unsubscribeService.isUnsubscribed(recipient);
    return { unsubscribed };
  }

  /**
   * Emails a fresh signed unsubscribe link to the recipient — proof of
   * mailbox ownership without exposing any subscription state.
   */
  @Post('unsubscribe/link')
  @Throttle({ global: { limit: 3, ttl: 60_000 } })
  async sendUnsubscribeLink(
    @Body() body: { recipient: string },
  ): Promise<{ ok: true }> {
    const recipient = String(body?.recipient ?? '')
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new BadRequestException(
        'A valid email recipient is required to send a manage-alerts link.',
      );
    }
    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const link = `${baseUrl}/unsubscribe?r=${encodeURIComponent(recipient)}&t=${signUnsubscribeToken(recipient)}`;
    await this.notifications.sendEmail(
      recipient,
      'Manage your LastBerth alert emails',
      `<p>Use the link below to unsubscribe from (or re-subscribe to) LastBerth alert emails:</p>
<p><a href="${link}">Manage my alert emails</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
      { skipBcc: true },
    );
    return { ok: true };
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
