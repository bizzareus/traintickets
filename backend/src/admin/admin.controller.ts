import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('trains')
  getTrains(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.admin.getTrains();
  }

  @Post('trains')
  createTrain(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body()
    body: {
      trainNumber: string;
      trainName: string;
      originStation: string;
      destinationStation: string;
      departureTime?: string;
      arrivalTime?: string;
      active?: boolean;
    },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.admin.createTrain(body);
  }

  @Get('chart-rules')
  getChartRules(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.admin.getChartRules();
  }

  @Post('chart-rules')
  createChartRule(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body()
    body: {
      trainId: string;
      stationCode: string;
      chartTimeLocal: string;
      sequenceNumber: number;
      active?: boolean;
    },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.admin.createChartRule(body);
  }

  @Get('chart-event-instances')
  getChartEventInstances(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return this.admin.getChartEventInstances(limit ? Number(limit) : 100);
  }
}
