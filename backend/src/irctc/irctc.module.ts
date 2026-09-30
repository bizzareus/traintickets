import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { CacheableMemory } from 'cacheable';
import Keyv from 'keyv';
import { IrctcController } from './irctc.controller';
import { IrctcKeeperController } from './irctc-keeper.controller';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';
import { IrctcHttpService } from './irctc-http.service';
import { PrismaModule } from '../prisma/prisma.module';

const scheduleStore = new Keyv({
  store: new CacheableMemory({
    ttl: 5 * 60 * 1000,
    lruSize: 500,
    checkInterval: 60_000,
  }),
});

@Module({
  imports: [
    PrismaModule,
    NestCacheModule.register<object>({
      stores: [scheduleStore],
    }),
  ],
  controllers: [IrctcController, IrctcKeeperController],
  providers: [
    IrctcService,
    IrctcChartService,
    IrctcBrowserUseService,
    IrctcCookieStoreService,
    IrctcHttpService,
  ],
  exports: [
    IrctcService,
    IrctcChartService,
    IrctcBrowserUseService,
    IrctcCookieStoreService,
    IrctcHttpService,
  ],
})
export class IrctcModule {}
