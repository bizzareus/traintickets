import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

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
