import {
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ShortLinkService } from './short-link.service';

@Controller('api/short-link')
export class ShortLinkController {
  constructor(private readonly shortLinkService: ShortLinkService) {}

  @Get('admin/overview')
  getAdminOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shortLinkService.getAdminOverview({ startDate, endDate });
  }

  @Get('admin/stats')
  getAdminDailyStats(
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shortLinkService.getAdminDailyStats({
      groupBy,
      startDate,
      endDate,
    });
  }

  @Get('admin/clicks')
  getAdminClicks(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('channel') channel?: string,
    @Query('code') code?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shortLinkService.getAdminClicks({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      channel,
      code,
      startDate,
      endDate,
    });
  }

  @Get('admin/links')
  getAdminLinks(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('filter') filter?: 'all' | 'clicked' | 'unclicked',
    @Query('channel') channel?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shortLinkService.getAdminLinks({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      filter,
      channel,
      type,
      startDate,
      endDate,
    });
  }

  @Get('admin/users')
  getAdminUsers(
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shortLinkService.getAdminUsers({ search, startDate, endDate });
  }

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
