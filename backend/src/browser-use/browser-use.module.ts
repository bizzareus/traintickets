import { Module } from "@nestjs/common";
import { BrowserUseService } from "./browser-use.service";

@Module({
  providers: [BrowserUseService],
  exports: [BrowserUseService],
})
export class BrowserUseModule {}
