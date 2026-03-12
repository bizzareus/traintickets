import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TrainsModule } from "./trains/trains.module";
import { StationsModule } from "./stations/stations.module";
import { SearchModule } from "./search/search.module";
import { MonitoringRequestsModule } from "./monitoring-requests/monitoring-requests.module";
import { WebhookModule } from "./webhook/webhook.module";
import { AdminModule } from "./admin/admin.module";
import { ChartCronModule } from "./chart-cron/chart-cron.module";
import { AvailabilityModule } from "./availability/availability.module";
import { IrctcModule } from "./irctc/irctc.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TrainsModule,
    StationsModule,
    SearchModule,
    MonitoringRequestsModule,
    WebhookModule,
    AdminModule,
    ChartCronModule,
    AvailabilityModule,
    IrctcModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
