import { Controller, Get, Headers, Ip, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ShortLinkService } from './short-link.service';

@Controller('api/short-link')
export class ShortLinkController {
  constructor(private readonly shortLinkService: ShortLinkService) {}

  @Get(':code')
  async getShortLink(
    @Param('code') code: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('referer') referer?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Ip() ip?: string,
    @Req() req?: Request,
  ) {
    const rawIp =
      forwardedFor ||
      (typeof req?.headers?.['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : undefined) ||
      ip ||
      req?.socket?.remoteAddress;

    return this.shortLinkService.recordClick(code, {
      userAgent: userAgent || (req?.headers?.['user-agent'] as string),
      ipAddress: rawIp,
      referer: referer || (req?.headers?.['referer'] as string),
    });
  }
}
