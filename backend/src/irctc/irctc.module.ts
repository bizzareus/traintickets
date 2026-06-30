import { Module } from '@nestjs/common';
import { IrctcController } from './irctc.controller';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';
import { IrctcBrowserFallbackService } from './irctc-browser-fallback.service';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';
import { IrctcSessionKeeperService } from './irctc-session-keeper.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IrctcController],
  providers: [
    IrctcService,
    IrctcChartService,
    IrctcBrowserUseService,
    IrctcBrowserFallbackService,
    IrctcCookieStoreService,
    IrctcSessionKeeperService,
  ],
  exports: [
    IrctcService,
    IrctcChartService,
    IrctcBrowserUseService,
    IrctcBrowserFallbackService,
    IrctcCookieStoreService,
    IrctcSessionKeeperService,
  ],
})
export class IrctcModule {}
