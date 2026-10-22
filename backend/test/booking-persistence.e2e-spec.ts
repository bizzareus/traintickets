import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AxiosInstance } from 'axios';
import { firstValueFrom, timer, mergeMap, filter, take, timeout } from 'rxjs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SplitBookingService } from '../src/split-booking/split-booking.service';
import {
  TripmgtBookingService,
  type TripmgtBookingParams,
} from '../src/split-booking/tripmgt-booking.service';
import { ManualBookingService } from '../src/split-booking/manual-booking.service';
import { createMuzoboxClient } from '../src/common/muzobox-client';
import { createBookingTestApp } from './booking-test-app';
import { bookingPayload } from './booking-payload';
import type { SplitBookingStatusResponse } from '../src/split-booking/split-booking.types';

jest.mock('../src/common/muzobox-client', () => ({
  ...jest.requireActual<object>('../src/common/muzobox-client'),
  createMuzoboxClient: jest.fn(),
}));

/** Real PostgreSQL + Prisma + service + HTTP; only money-moving/external providers are fakes. */
describe('Booking persistence and fulfillment integration', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let config: ConfigService;
  let email: string;
  const muzobox = { post: jest.fn(), get: jest.fn() };
  const tripmgt = { executeBooking: jest.fn() };
  const manual = { notify: jest.fn() };
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const url = process.env.BOOKING_TEST_DATABASE_URL;
    if (
      !url ||
      !/^booking_test(?:_|$)/.test(new URL(url).pathname.slice(1)) ||
      !['localhost', '127.0.0.1', 'postgres'].includes(new URL(url).hostname)
    ) {
      throw new Error(
        'BOOKING_TEST_DATABASE_URL must point to a local booking_test database.',
      );
    }
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    config = new ConfigService({
      SPLIT_BOOKING_MODE: 'ai',
      SPLIT_BOOKING_ENABLED: 'true',
      API_URL: 'http://localhost:3109',
    });
    jest
      .mocked(createMuzoboxClient)
      .mockReturnValue(muzobox as unknown as AxiosInstance);
    const module = await Test.createTestingModule({
      providers: [
        SplitBookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: TripmgtBookingService, useValue: tripmgt },
        { provide: ManualBookingService, useValue: manual },
      ],
    }).compile();
    app = await createBookingTestApp(module.get(SplitBookingService));
    await app.init();
  });

  beforeEach(() => {
    email = `booking-${randomUUID()}@example.com`;
    config.set('SPLIT_BOOKING_MODE', 'ai');
    muzobox.post
      .mockReset()
      .mockImplementation(
        (_path: string, data: { amount: number; referenceId: string }) =>
          Promise.resolve({
            data: {
              id: `mb_${data.referenceId}`,
              referenceId: data.referenceId,
              amount: data.amount,
              payUrl: 'https://muzobox.com/pay/test',
              razorpayOrderId: `order_${data.referenceId}`,
            },
          }),
      );
    muzobox.get.mockReset();
    tripmgt.executeBooking
      .mockReset()
      .mockImplementation(
        async (
          params: TripmgtBookingParams,
          callbacks: { onPnr: (index: number, pnr: string) => Promise<void> },
        ) => {
          const pnrs = params.legs.map((_leg, index) =>
            String(1234567890 + index),
          );
          for (const [index, pnr] of pnrs.entries())
            await callbacks.onPnr(index, pnr);
          return { success: true, pnrs };
        },
      );
    manual.notify
      .mockReset()
      .mockImplementation(async (booking: { id: string }) => {
        await prisma.splitTicketBooking.update({
          where: { id: booking.id },
          data: {
            manualEmailSentAt: new Date(),
            manualWhatsappSentAt: new Date(),
          },
        });
        return { emailSent: true, whatsappSent: true };
      });
  });
  afterEach(async () => {
    if (prisma)
      await prisma.splitTicketBooking.deleteMany({
        where: { contactEmail: email },
      });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  async function create() {
    const payload = { ...bookingPayload(), contactEmail: email };
    const response = await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send(payload)
      .expect(201);
    return {
      payload,
      checkout: response.body as {
        bookingRef: string;
        totalFare: number;
        serviceFee: number;
        amount: number;
      },
    };
  }
  function waitForStatus(
    ref: string,
    status: 'CONFIRMED' | 'FAILED' | 'MANUAL_PENDING',
  ) {
    return firstValueFrom(
      timer(0, 20).pipe(
        mergeMap(() =>
          prisma.splitTicketBooking.findUniqueOrThrow({
            where: { bookingRef: ref },
          }),
        ),
        filter((row) => row.bookingStatus === status),
        take(1),
        timeout(5000),
      ),
    );
  }
  function remotePayment(ref: string, amount: number, status = 'paid') {
    return {
      referenceId: ref,
      amount,
      status,
      razorpayPaymentId: status === 'paid' ? 'pay_test' : null,
      razorpayOrderId: `order_${ref}`,
    };
  }

  it('persists per-leg service charges and 0 gateway fee', async () => {
    const { checkout, payload } = await create();
    expect(checkout).toMatchObject({
      totalFare: 980,
      irctcServiceFee: 35.4,
      serviceFee: 80,
      paymentGatewayFee: 11.99,
      travelInsuranceFee: 0.9,
      amount: 1108.29,
    });
    expect(checkout.amount).toBe(1108.29);
    const row = await prisma.splitTicketBooking.findUniqueOrThrow({
      where: { bookingRef: checkout.bookingRef },
    });
    expect(row.legsPayload).toEqual(
      payload.legs.map((leg) => ({ ...leg, irctcServiceFeePaise: 1770 })),
    );
    expect(row.irctcServiceFeePaise).toBe(3540);
    expect(row.paymentGatewayFeePaise).toBe(1199);
    expect(row.serviceFee).toBe(80);
    expect(row.passengers).toMatchObject({
      adults: payload.passengers,
      children: [],
      preferredCoach: 'S1',
      confirmBerthsOnly: false,
      travelInsurance: true,
    });
    expect(row.paymentStatus).toBe('PENDING');
    expect(row.bookingStatus).toBe('IDLE');
    expect(row.muzoboxPaymentId).toBe(`mb_${checkout.bookingRef}`);
    expect(tripmgt.executeBooking).not.toHaveBeenCalled();
  });

  it('persists provider failure and returns a recoverable checkout error', async () => {
    muzobox.post.mockRejectedValueOnce(
      new Error('Test payment provider unavailable'),
    );
    await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send({ ...bookingPayload(), contactEmail: email })
      .expect(503);
    const row = await prisma.splitTicketBooking.findFirstOrThrow({
      where: { contactEmail: email },
    });
    expect(row.paymentStatus).toBe('FAILED');
    expect(tripmgt.executeBooking).not.toHaveBeenCalled();
  });

  it('concurrent verified polling/callbacks dispatch exactly one reservation and persist all PNRs', async () => {
    const { checkout } = await create();
    muzobox.get.mockResolvedValue({
      data: remotePayment(checkout.bookingRef, checkout.amount),
    });
    await Promise.all([
      request(app.getHttpServer())
        .get(`/api/split-booking/status/${checkout.bookingRef}`)
        .expect(200),
      request(app.getHttpServer())
        .post('/api/split-booking/muzobox-callback')
        .send({
          paymentId: `mb_${checkout.bookingRef}`,
          referenceId: checkout.bookingRef,
        })
        .expect(201),
    ]);
    const row = await waitForStatus(checkout.bookingRef, 'CONFIRMED');
    expect(tripmgt.executeBooking).toHaveBeenCalledTimes(1);
    expect(row.pnrs).toEqual(['1234567890', '1234567891']);
    expect(row.pnrLeg1).toBe(row.pnrs[0]);
    expect(row.pnrLeg2).toBe(row.pnrs[1]);
    expect(row.paidAt).not.toBeNull();
    expect(row.completedAt).not.toBeNull();
    await request(app.getHttpServer())
      .get(`/api/split-booking/status/${checkout.bookingRef}`)
      .expect(200);
    expect(tripmgt.executeBooking).toHaveBeenCalledTimes(1);
  });

  it.each(['amount', 'referenceId', 'razorpayOrderId'])(
    'does not fulfill a provider payment with mismatching %s',
    async (field) => {
      const { checkout } = await create();
      muzobox.get.mockResolvedValue({
        data: {
          ...remotePayment(checkout.bookingRef, checkout.amount),
          [field]: field === 'amount' ? checkout.amount - 1 : 'wrong',
        },
      });
      const response = await request(app.getHttpServer())
        .get(`/api/split-booking/status/${checkout.bookingRef}`)
        .expect(200);
      expect((response.body as SplitBookingStatusResponse).paymentStatus).toBe(
        'PENDING',
      );
      expect(tripmgt.executeBooking).not.toHaveBeenCalled();
    },
  );

  it('failed payment never starts fulfillment', async () => {
    const { checkout } = await create();
    muzobox.get.mockResolvedValue({
      data: remotePayment(checkout.bookingRef, checkout.amount, 'failed'),
    });
    const response = await request(app.getHttpServer())
      .get(`/api/split-booking/status/${checkout.bookingRef}`)
      .expect(200);
    expect((response.body as SplitBookingStatusResponse).paymentStatus).toBe(
      'FAILED',
    );
    expect(tripmgt.executeBooking).not.toHaveBeenCalled();
  });

  it('preserves an issued PNR when a later reservation fails', async () => {
    tripmgt.executeBooking.mockImplementationOnce(
      async (
        _params: unknown,
        callbacks: { onPnr: (index: number, pnr: string) => Promise<void> },
      ) => {
        await callbacks.onPnr(0, '1234567890');
        return {
          success: false,
          pnrs: ['1234567890'],
          error: 'Second leg requires OTP',
        };
      },
    );
    const { checkout } = await create();
    muzobox.get.mockResolvedValue({
      data: remotePayment(checkout.bookingRef, checkout.amount),
    });
    await request(app.getHttpServer())
      .get(`/api/split-booking/status/${checkout.bookingRef}`)
      .expect(200);
    const row = await waitForStatus(checkout.bookingRef, 'FAILED');
    expect(row.pnrs).toEqual(['1234567890']);
    expect(row.bookingError).toBe('Second leg requires OTP');
  });

  it('manual handoff remains pending with no PNR and duplicate callbacks do not resend it', async () => {
    config.set('SPLIT_BOOKING_MODE', 'manual');
    const { checkout } = await create();
    muzobox.get.mockResolvedValue({
      data: remotePayment(checkout.bookingRef, checkout.amount),
    });
    await request(app.getHttpServer())
      .get(`/api/split-booking/status/${checkout.bookingRef}`)
      .expect(200);
    const row = await waitForStatus(checkout.bookingRef, 'MANUAL_PENDING');
    expect(row.pnrs).toEqual([]);
    expect(row.completedAt).toBeNull();
    expect(tripmgt.executeBooking).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/api/split-booking/muzobox-callback')
      .send({
        paymentId: `mb_${checkout.bookingRef}`,
        referenceId: checkout.bookingRef,
      })
      .expect(201);
    expect(manual.notify).toHaveBeenCalledTimes(1);
  });

  it('persists one cancellation request, verifies mobile and rejects duplicates', async () => {
    const { checkout } = await create();
    await request(app.getHttpServer())
      .post('/api/split-booking/cancellation/lookup')
      .send({ bookingRef: checkout.bookingRef, mobile: '9999999999' })
      .expect(400);
    const cancellation = {
      bookingRef: checkout.bookingRef,
      mobile: '9876543210',
      reason: 'Travel plans changed',
    };
    const response = await request(app.getHttpServer())
      .post('/api/split-booking/cancellation/request')
      .send(cancellation)
      .expect(201);
    const row = await prisma.bookingCancellationRequest.findUniqueOrThrow({
      where: { id: (response.body as { requestId: string }).requestId },
    });
    expect(row).toMatchObject({
      bookingRef: checkout.bookingRef,
      mobile: cancellation.mobile,
      reason: cancellation.reason,
      status: 'PENDING',
    });
    await request(app.getHttpServer())
      .post('/api/split-booking/cancellation/request')
      .send(cancellation)
      .expect(400);
  });
});
