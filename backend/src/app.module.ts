import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE, HttpAdapterHost } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { SentryHttpExceptionFilter } from './common/sentry-http-exception.filter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TrainsModule } from './trains/trains.module';
import { StationsModule } from './stations/stations.module';
import { SearchModule } from './search/search.module';
import { WebhookModule } from './webhook/webhook.module';
import { AdminModule } from './admin/admin.module';
import { AvailabilityModule } from './availability/availability.module';
import { IrctcModule } from './irctc/irctc.module';
import { ChartTimeModule } from './chart-time/chart-time.module';
import { Service2Module } from './service2/service2.module';
import { ChartTimeIngestionModule } from './chart-time-ingestion/chart-time-ingestion.module';
import { RailFeedProxyModule } from './rail-feed-proxy/rail-feed-proxy.module';
import { BookingV2Module } from './booking-v2/booking-v2.module';
import { CacheModule } from './cache/cache.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { McpModule } from './mcp/mcp.module';
import { ShortLinkModule } from './short-link/short-link.module';
import { ChartAlertPaymentsModule } from './chart-alert-payments/chart-alert-payments.module';
import { RefundRequestModule } from './refund-request/refund-request.module';
import { SplitBookingModule } from './split-booking/split-booking.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { HealthModule } from './health/health.module';
import { configModuleOptions } from './config/environment';
import { ObserveModule } from './observe';

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY!,
      appSecret: process.env.OBSERVE_APP_SECRET!,
      serviceId: 'backend',
    }),
    SentryModule.forRoot(),
    ConfigModule.forRoot(configModuleOptions),
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 120 }]),
    MonitoringModule,
    PrismaModule,
    CacheModule,
    AuthModule,
    TrainsModule,
    StationsModule,
    SearchModule,
    WebhookModule,
    AdminModule,
    AvailabilityModule,
    IrctcModule,
    ChartTimeModule,
    Service2Module,
    ChartTimeIngestionModule,
    RailFeedProxyModule,
    BookingV2Module,
    WhatsappModule,
    McpModule,
    ShortLinkModule,
    ChartAlertPaymentsModule,
    RefundRequestModule,
    SplitBookingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useFactory: (httpAdapterHost: HttpAdapterHost) =>
        new SentryHttpExceptionFilter(httpAdapterHost),
      inject: [HttpAdapterHost],
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    AppService,
  ],
})
export class AppModule {}
