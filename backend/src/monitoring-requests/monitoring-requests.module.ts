import { Module } from "@nestjs/common";
import { MonitoringRequestsController } from "./monitoring-requests.controller";
import { MonitoringRequestsService } from "./monitoring-requests.service";
import { ChartEventModule } from "../chart-event/chart-event.module";

@Module({
  imports: [ChartEventModule],
  controllers: [MonitoringRequestsController],
  providers: [MonitoringRequestsService],
})
export class MonitoringRequestsModule {}
