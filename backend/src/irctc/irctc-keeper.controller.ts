import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IrctcSessionKeeperService } from './irctc-session-keeper.service';

/**
 * Admin endpoints for the IRCTC cookie keeper. Gated by the same admin password
 * the rest of the admin tooling uses (CHART_TIME_INGESTION_PASSWORD), sent as an
 * `x-admin-password` header — the admin UI has no JWT, so this matches the
 * existing admin-password pattern rather than JwtAuthGuard.
 */
@Controller('api/admin/irctc-keeper')
export class IrctcKeeperController {
  constructor(private readonly keeper: IrctcSessionKeeperService) {}

  private assertPassword(pw?: string): void {
    const expected = String(
      process.env.CHART_TIME_INGESTION_PASSWORD ?? '',
    ).trim();
    if (!expected) {
      throw new UnauthorizedException('Admin password is not configured.');
    }
    if (String(pw ?? '') !== expected) {
      throw new UnauthorizedException('Invalid admin password.');
    }
  }

  /** Keeper status + cookie metadata (never the raw cookie value). */
  @Get()
  status(@Headers('x-admin-password') pw?: string) {
    this.assertPassword(pw);
    return this.keeper.status();
  }

  /** Force an immediate browser-use harvest. */
  @Post('refresh')
  refresh(@Headers('x-admin-password') pw?: string) {
    this.assertPassword(pw);
    return this.keeper.refresh('manual');
  }

  /** Manually paste in a cookie bundle (overrides whatever the keeper holds). */
  @Post('cookie')
  setCookie(
    @Headers('x-admin-password') pw: string | undefined,
    @Body() body: { cookie?: string },
  ) {
    this.assertPassword(pw);
    return this.keeper.setCookieManually(String(body?.cookie ?? ''));
  }
}
