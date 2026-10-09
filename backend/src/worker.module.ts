import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { BookingV2Module } from './booking-v2/booking-v2.module';
import { CacheModule } from './cache/cache.module';
import { ChartCronModule } from './chart-cron/chart-cron.module';
import { IrctcModule } from './irctc/irctc.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { configModuleOptions } from './config/environment';
import { ObserveModule } from './observe';

/** Only this process registers scheduled jobs; shared state stays in the DB. */
@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY!,
      appSecret: process.env.OBSERVE_APP_SECRET!,
      serviceId: 'backend',
    }),
    SentryModule.forRoot(),
    ConfigModule.forRoot(configModuleOptions),
    MonitoringModule,
    PrismaModule,
    CacheModule,
    ScheduleModule.forRoot(),
    ChartCronModule,
    BookingV2Module,
    IrctcModule,
    WhatsappModule,
  ],
})
export class WorkerModule {}
