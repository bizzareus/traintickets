import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { assertAdminAuth, ADMIN_PASSWORD_HEADER } from '../common/admin-auth';
import { MarketingService } from './marketing.service';
import type {
  MarketingEngineConfigDto,
  AbandonedBookingsQueryDto,
} from './marketing.types';

@Controller('api/admin/marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get('stats')
  async getStats(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.getStats();
  }

  @Get('config')
  async getConfig(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.getConfig();
  }

  @Put('config')
  async updateConfig(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body() body: MarketingEngineConfigDto,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.updateConfig(body);
  }

  @Get('abandoned-bookings')
  async listAbandonedBookings(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Query() query: AbandonedBookingsQueryDto,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.listAbandonedBookings(query);
  }

  @Post('run-now')
  @HttpCode(HttpStatus.OK)
  async runCronNow(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.processAbandonedBookingsCron({
      force: true,
    });
  }

  @Post('send-reminder/:bookingRef')
  @HttpCode(HttpStatus.OK)
  async sendManualReminder(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('bookingRef') bookingRef: string,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.sendManualReminder(bookingRef);
  }

  @Post('send-test-email')
  @HttpCode(HttpStatus.OK)
  async sendTestEmail(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body('email') email: string,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.marketingService.sendTestEmail(email);
  }
}
