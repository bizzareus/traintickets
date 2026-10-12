import 'reflect-metadata';
import type { Server } from 'node:http';
import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { SplitBookingController } from '../src/split-booking/split-booking.controller';
import { SplitBookingService } from '../src/split-booking/split-booking.service';
import { RazorpayClient } from '../src/chart-alert-payments/razorpay.client';
import { createValidationPipe } from '../src/common/validation-pipe';
import { SentryHttpExceptionFilter } from '../src/common/sentry-http-exception.filter';
import { validateBookingItinerary } from '../src/split-booking/split-booking.validation';
import { bookingPrice } from '../src/split-booking/split-booking.pricing';
import type { CreateSplitBookingDto } from '../src/split-booking/split-booking.types';

/** Real routing, DTO transform, validation and error handling; no external side effects. */
export async function createBookingTestApp(
  service?: Partial<SplitBookingService>,
): Promise<INestApplication<Server>> {
  const module = await Test.createTestingModule({
    controllers: [SplitBookingController],
    providers: [
      {
        provide: SplitBookingService,
        useValue: service ?? {
          createBooking(dto: CreateSplitBookingDto) {
            try {
              validateBookingItinerary(dto);
            } catch (error: unknown) {
              throw new BadRequestException((error as Error).message);
            }
            return {
              bookingRef: 'LB-TEST',
              bookingMode: 'AI',
              ...bookingPrice(dto.totalFare, undefined, 0.04),
              payUrl: 'https://muzobox.com/pay/mb_test?source=reservation',
            };
          },
        },
      },
      { provide: RazorpayClient, useValue: { webhookSecret: 'test-only' } },
    ],
  }).compile();
  const app = module.createNestApplication<INestApplication<Server>>();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new SentryHttpExceptionFilter(app.get(HttpAdapterHost)));
  return app;
}
