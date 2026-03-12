import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ChartCronService } from "./chart-cron.service";
import { BrowserUseModule } from "../browser-use/browser-use.module";

@Module({
  imports: [ScheduleModule.forRoot(), BrowserUseModule],
  providers: [ChartCronService],
})
export class ChartCronModule {}
