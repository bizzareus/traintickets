import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import { IrctcSessionKeeperService } from '../irctc/irctc-session-keeper.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private admin: AdminService,
    private irctcKeeper: IrctcSessionKeeperService,
  ) {}

  /** Current IRCTC cookie-keeper state: enabled?, last refresh, last error. */
  @Get('irctc-keeper')
  getIrctcKeeperStatus() {
    return this.irctcKeeper.status();
  }

  /** Force an immediate cookie refresh (spins up a browser-use session now). */
  @Post('irctc-keeper/refresh')
  refreshIrctcKeeper() {
    return this.irctcKeeper.refresh('manual');
  }

  /** Manually paste in a cookie bundle (overrides whatever the keeper holds). */
  @Post('irctc-keeper/cookie')
  setIrctcKeeperCookie(@Body() body: { cookie?: string }) {
    return this.irctcKeeper.setCookieManually(String(body?.cookie ?? ''));
  }

  @Get('trains')
  getTrains() {
    return this.admin.getTrains();
  }

  @Post('trains')
  createTrain(
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
    return this.admin.createTrain(body);
  }

  @Get('chart-rules')
  getChartRules() {
    return this.admin.getChartRules();
  }

  @Post('chart-rules')
  createChartRule(
    @Body()
    body: {
      trainId: string;
      stationCode: string;
      chartTimeLocal: string;
      sequenceNumber: number;
      active?: boolean;
    },
  ) {
    return this.admin.createChartRule(body);
  }

  @Get('chart-event-instances')
  getChartEventInstances(@Query('limit') limit?: string) {
    return this.admin.getChartEventInstances(limit ? Number(limit) : 100);
  }
}
