import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUserId } from "../auth/user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MonitoringRequestsService } from "./monitoring-requests.service";

@Controller("api/monitoring-requests")
export class MonitoringRequestsController {
  constructor(private service: MonitoringRequestsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUserId() userId: string) {
    return this.service.list(userId);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  getOne(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.service.getOne(userId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUserId() userId: string,
    @Body() body: { trainId: string; stationCode: string; journeyDate: string; classCode: string },
  ) {
    return this.service.create(userId, body);
  }
}
