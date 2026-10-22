import {
  BadRequestException,
  Logger,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { createBookingTestApp } from './booking-test-app';
import { bookingPayload } from './booking-payload';

describe('Booking HTTP contract', () => {
  let app: INestApplication<Server>;
  const createBooking = jest.fn();
  beforeAll(async () => {
    app = await createBookingTestApp({ createBooking });
    await app.init();
  });
  beforeEach(() => {
    createBooking
      .mockReset()
      .mockResolvedValue({ bookingRef: 'LB-TEST', amount: 1019 });
  });
  afterAll(async () => app.close());

  it('quotes mixed classes with per-leg fees and an exact paise payment total', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/split-booking/quote')
      .send({
        totalFare: 1100,
        legs: [{ travelClass: '3A' }, { travelClass: 'SL' }],
      })
      .expect(201);
    expect(response.body).toEqual({
      totalFare: 1100,
      irctcServiceFee: 53.1,
      serviceFee: 80,
      paymentGatewayFee: 13.62,
      travelInsuranceFee: 0.9,
      amount: 1247.62,
    });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it.each([
    { totalFare: 1100, legs: [{ travelClass: 'INVALID' }] },
    { totalFare: 1100.5, legs: [{ travelClass: 'SL' }] },
    { totalFare: 1100, legs: [{ travelClass: 'SL', fee: 0 }] },
  ])('rejects invalid booking quote input %j', async (payload) => {
    await request(app.getHttpServer())
      .post('/api/split-booking/quote')
      .send(payload)
      .expect(400);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('accepts every field sent by the form, including nullable leg metadata', async () => {
    const payload = bookingPayload();
    const response = await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send(payload)
      .expect(201);
    expect(response.body).toEqual({ bookingRef: 'LB-TEST', amount: 1019 });
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining(payload),
    );
    await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send({
        ...payload,
        legs: payload.legs.map((leg) => ({
          ...leg,
          availability: null,
          departureTime: null,
          arrivalTime: null,
          durationMinutes: null,
        })),
      })
      .expect(201);
  });

  it.each([5, 125])('accepts passenger age %i', async (age) => {
    const payload = bookingPayload();
    payload.passengers[0].age = age;
    await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send(payload)
      .expect(201);
  });

  it.each([
    [
      'unknown top-level field',
      () => ({ ...bookingPayload(), injectedField: 'nope' }),
    ],
    [
      'unknown leg field',
      () => {
        const p = bookingPayload();
        return { ...p, legs: [{ ...p.legs[0], bogus: true }] };
      },
    ],
    [
      'unknown passenger field',
      () => {
        const p = bookingPayload();
        return { ...p, passengers: [{ ...p.passengers[0], bogus: true }] };
      },
    ],
    [
      'age below minimum',
      () => {
        const p = bookingPayload();
        p.passengers[0].age = 4;
        return p;
      },
    ],
    [
      'age above maximum',
      () => {
        const p = bookingPayload();
        p.passengers[0].age = 126;
        return p;
      },
    ],
    [
      'two passengers',
      () => {
        const p = bookingPayload();
        p.passengers.push(p.passengers[0]);
        return p;
      },
    ],
    [
      'infant passenger',
      () => ({
        ...bookingPayload(),
        childPassengers: [{ name: 'Child', age: 2, gender: 'Male' }],
      }),
    ],
    ['no legs', () => ({ ...bookingPayload(), legs: [] })],
    ['invalid email', () => ({ ...bookingPayload(), contactEmail: 'test@' })],
    [
      'numeric string age',
      () => {
        const p = bookingPayload();
        return { ...p, passengers: [{ ...p.passengers[0], age: '22' }] };
      },
    ],
  ])('rejects %s before reaching the service', async (_label, payload) => {
    await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send(payload())
      .expect(400);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('logs nested validation failures without logging passenger or contact data', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      const p = bookingPayload();
      const response = await request(app.getHttpServer())
        .post('/api/split-booking/create')
        .send({ ...p, legs: [{ ...p.legs[0], bogus: true }] })
        .expect(400);
      expect((response.body as { message: string[] }).message).toContain(
        'legs.0.property bogus should not exist',
      );
      const lines = JSON.stringify(warn.mock.calls);
      expect(lines).toContain('POST /api/split-booking/create -> 400');
      expect(lines).toContain('legs.0.property bogus should not exist');
      expect(lines).not.toContain(p.contactEmail);
      expect(lines).not.toContain(p.passengers[0].name);
    } finally {
      warn.mockRestore();
    }
  });

  it('preserves array error responses for the frontend', async () => {
    createBooking.mockRejectedValueOnce(
      new BadRequestException(['Fare changed', 'Please select tickets again']),
    );
    const response = await request(app.getHttpServer())
      .post('/api/split-booking/create')
      .send(bookingPayload())
      .expect(400);
    expect((response.body as { message: string[] }).message).toEqual([
      'Fare changed',
      'Please select tickets again',
    ]);
  });
});
