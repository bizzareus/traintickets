import { Module } from '@nestjs/common';
import { IrctcController } from './irctc.controller';
import { IrctcKeeperController } from './irctc-keeper.controller';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';
import { IrctcBrowserlessService } from './irctc-browserless.service';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';
import { IrctcSessionKeeperService } from './irctc-session-keeper.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IrctcController, IrctcKeeperController],
  providers: [
    IrctcService,
    IrctcChartService,
    IrctcBrowserUseService,
    IrctcBrowserlessService,
    IrctcCookieStoreService,
    IrctcSessionKeeperService,
  ],
  exports: [
    IrctcService,
    IrctcChartService,
    IrctcBrowserUseService,
    IrctcBrowserlessService,
    IrctcCookieStoreService,
    IrctcSessionKeeperService,
  ],
})
export class IrctcModule {}
