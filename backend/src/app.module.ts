import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TrainsModule } from './trains/trains.module';
import { StationsModule } from './stations/stations.module';
import { SearchModule } from './search/search.module';
import { WebhookModule } from './webhook/webhook.module';
import { AdminModule } from './admin/admin.module';
import { ChartCronModule } from './chart-cron/chart-cron.module';
import { AvailabilityModule } from './availability/availability.module';
import { IrctcModule } from './irctc/irctc.module';
import { ChartTimeModule } from './chart-time/chart-time.module';
import { Service2Module } from './service2/service2.module';
import { ChartTimeIngestionModule } from './chart-time-ingestion/chart-time-ingestion.module';
import { ConfirmTktProxyModule } from './confirmtkt-proxy/confirmtkt-proxy.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TrainsModule,
    StationsModule,
    SearchModule,
    WebhookModule,
    AdminModule,
    ChartCronModule,
    AvailabilityModule,
    IrctcModule,
    ChartTimeModule,
    Service2Module,
    ChartTimeIngestionModule,
    ConfirmTktProxyModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
  ],
})
export class AppModule {}
