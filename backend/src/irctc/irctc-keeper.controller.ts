import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';
import type { Request } from 'express';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';

class SetIrctcCookieDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(20)
  @MaxLength(16_384)
  @Matches(/(?:^|;\s*)[^=;\s]+=[^;]+/)
  cookie!: string;
}

/**
 * Admin endpoints for the manually managed IRCTC cookie. Gated by the same admin password
 * the rest of the admin tooling uses (CHART_TIME_INGESTION_PASSWORD), sent as an
 * `x-admin-password` header — the admin UI has no JWT, so this matches the
 * existing admin-password pattern rather than JwtAuthGuard.
 */
@Controller('api/admin/irctc-keeper')
export class IrctcKeeperController {
  constructor(private readonly cookies: IrctcCookieStoreService) {}

  /** Cookie metadata (never the raw cookie value). */
  @Get()
  async status(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const record = await this.cookies.getRecord();
    return {
      cookieStore: this.cookies.location(),
      cookie: record
        ? {
            present: true,
            length: record.cookie.length,
            updatedAt: record.updatedAt,
            source: record.source,
          }
        : { present: false },
    };
  }

  /** The full stored cookie value (admin-only — the raw secret bundle). */
  @Get('cookie')
  async getCookie(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return { cookie: await this.cookies.getCookie() };
  }

  /** Manually paste in a cookie bundle (overrides whatever the keeper holds). */
  @Post('cookie')
  setCookie(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body() body: SetIrctcCookieDto,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const cookie = body.cookie.trim();
    return this.cookies
      .setCookie(cookie, { source: 'manual' })
      .then(() => ({ ok: true, length: cookie.length }));
  }
}
