import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IrctcSessionKeeperService } from './irctc-session-keeper.service';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';

/**
 * Admin endpoints for the IRCTC cookie keeper. Gated by the same admin password
 * the rest of the admin tooling uses (CHART_TIME_INGESTION_PASSWORD), sent as an
 * `x-admin-password` header — the admin UI has no JWT, so this matches the
 * existing admin-password pattern rather than JwtAuthGuard.
 */
@Controller('api/admin/irctc-keeper')
export class IrctcKeeperController {
  constructor(private readonly keeper: IrctcSessionKeeperService) {}

  /** Keeper status + cookie metadata (never the raw cookie value). */
  @Get()
  status(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.keeper.status();
  }

  /** The full stored cookie value (admin-only — the raw secret bundle). */
  @Get('cookie')
  getCookie(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.keeper.getStoredCookie();
  }

  /** Force an immediate browser-use harvest. */
  @Post('refresh')
  refresh(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.keeper.refresh('manual');
  }

  /** Manually paste in a cookie bundle (overrides whatever the keeper holds). */
  @Post('cookie')
  setCookie(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body() body: { cookie?: string },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.keeper.setCookieManually(String(body?.cookie ?? ''));
  }
}
