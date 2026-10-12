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
import {
  bookingPrice,
  calculateBookingCharges,
} from '../src/split-booking/split-booking.pricing';
import type { CreateSplitBookingDto } from '../src/split-booking/split-booking.types';
import type { SplitBookingQuoteDto } from '../src/split-booking/split-booking.dto';

/** Real routing, DTO transform, validation and error handling; no external side effects. */
export async function createBookingTestApp(
  service?: Partial<SplitBookingService>,
): Promise<INestApplication<Server>> {
  const module = await Test.createTestingModule({
    controllers: [SplitBookingController],
    providers: [
      {
        provide: SplitBookingService,
        useValue: {
          quoteBooking({ totalFare, legs }: SplitBookingQuoteDto) {
            try {
              return bookingPrice(calculateBookingCharges(totalFare, legs));
            } catch (error: unknown) {
              throw new BadRequestException((error as Error).message);
            }
          },
          createBooking(dto: CreateSplitBookingDto) {
            try {
              validateBookingItinerary(dto);
              return {
                bookingRef: 'LB-TEST',
                bookingMode: 'AI',
                ...bookingPrice(
                  calculateBookingCharges(dto.totalFare, dto.legs),
                ),
                payUrl: 'https://muzobox.com/pay/mb_test?source=reservation',
              };
            } catch (error: unknown) {
              throw new BadRequestException((error as Error).message);
            }
          },
          ...service,
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
