import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateSplitBookingDto } from './split-booking.dto';
import { validateBookingItinerary } from './split-booking.validation';

/**
 * Regression net for the booking form -> API contract.
 *
 * The frontend (`SplitTicketBookingModal` + `buildSplitBookingSelection`)
 * sends every field below on each `POST /api/split-booking/create`, including
 * per-leg `availability` text. The app's global pipe runs with
 * `whitelist + forbidNonWhitelisted`, so any form field missing from
 * `split-booking.dto.ts` becomes a user-facing 400 ("property X should not
 * exist") — which bare `validate()` specs never catch. These tests run the
 * exact pipe configuration from `app.module.ts` over every booking-form
 * scenario, so DTO/frontend drift fails here instead of in production.
 */
function appValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
}

async function passesPipe(payload: unknown): Promise<CreateSplitBookingDto> {
  const out: unknown = await appValidationPipe().transform(payload, {
    type: 'body',
    metatype: CreateSplitBookingDto,
  });
  return out as CreateSplitBookingDto;
}

/** Exact shape the passenger form submits (all optional preference fields). */
function passenger() {
  return {
    name: 'IRFAN',
    age: 22,
    gender: 'Male' as const,
    berthPreference: 'No Preference',
    optBerth: true,
    foodChoice: 'Veg' as const,
    seniorCitizen: false,
  };
}

describe('split-booking create payload (booking-form scenarios)', () => {
  it('accepts the two-leg split journey from the booking form, availability included', async () => {
    const payload = {
      trainNumber: '09065',
      trainName: 'ST CPR SPL',
      fromStationCode: 'CYI',
      toStationCode: 'GOY',
      journeyDate: '2026-11-10',
      travelClass: 'SL',
      quota: 'GN',
      totalFare: 980,
      legs: [
        {
          from: 'CYI',
          to: 'VGLJ',
          travelClass: 'SL',
          fare: 580,
          boardingDate: '2026-11-10',
          availability: 'AVL 42',
        },
        {
          from: 'VGLJ',
          to: 'GOY',
          travelClass: 'SL',
          fare: 400,
          boardingDate: '2026-11-10',
          availability: 'AVL 18',
        },
      ],
      passengers: [passenger()],
      childPassengers: [],
      autoUpgrade: true,
      confirmBerthsOnly: true,
      travelInsurance: true,
      contactMobile: '8511272626',
      contactEmail: 'barotdhiraj.bd@gmail.com',
    };

    const out = await passesPipe(payload);
    expect(out.legs).toHaveLength(2);
    expect(out.legs.map((leg) => leg.availability)).toEqual([
      'AVL 42',
      'AVL 18',
    ]);
    expect(() => validateBookingItinerary(out)).not.toThrow();
  });

  it('accepts a single-leg direct booking with timings and a coach preference', async () => {
    const payload = {
      trainNumber: '12951',
      trainName: 'MMCT RAJDHANI',
      fromStationCode: 'BCT',
      toStationCode: 'NDLS',
      journeyDate: '2026-11-10',
      travelClass: '3A',
      quota: 'GN',
      totalFare: 1425,
      legs: [
        {
          from: 'BCT',
          to: 'NDLS',
          travelClass: '3A',
          fare: 1425,
          boardingDate: '2026-11-10',
          departureTime: '16:35',
          arrivalTime: '08:32',
          durationMinutes: 957,
          availability: 'AVL 10',
        },
      ],
      passengers: [passenger()],
      childPassengers: [],
      autoUpgrade: false,
      confirmBerthsOnly: false,
      preferredCoach: 'B1',
      travelInsurance: false,
      contactMobile: '9876543210',
      contactEmail: 'test@example.com',
    };

    const out = await passesPipe(payload);
    expect(out.legs).toHaveLength(1);
    expect(out.legs[0].availability).toBe('AVL 10');
    expect(() => validateBookingItinerary(out)).not.toThrow();
  });

  it('still rejects unknown top-level fields (whitelist stays protective)', async () => {
    const err = await passesPipe({
      trainNumber: '09065',
      fromStationCode: 'CYI',
      toStationCode: 'GOY',
      journeyDate: '2026-11-10',
      travelClass: 'SL',
      totalFare: 980,
      legs: [
        {
          from: 'CYI',
          to: 'GOY',
          travelClass: 'SL',
          fare: 980,
          boardingDate: '2026-11-10',
        },
      ],
      passengers: [passenger()],
      contactMobile: '8511272626',
      contactEmail: 'barotdhiraj.bd@gmail.com',
      // @ts-expect-error deliberate unknown field for the negative test
      injectedField: 'nope',
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((err as BadRequestException).getResponse()),
    ).toContain('injectedField should not exist');
  });

  it('still rejects unknown leg-level fields', async () => {
    const err = await passesPipe({
      trainNumber: '09065',
      fromStationCode: 'CYI',
      toStationCode: 'GOY',
      journeyDate: '2026-11-10',
      travelClass: 'SL',
      totalFare: 980,
      legs: [
        {
          from: 'CYI',
          to: 'GOY',
          travelClass: 'SL',
          fare: 980,
          boardingDate: '2026-11-10',
          // @ts-expect-error deliberate unknown field for the negative test
          bogus: 'x',
        },
      ],
      passengers: [passenger()],
      contactMobile: '8511272626',
      contactEmail: 'barotdhiraj.bd@gmail.com',
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((err as BadRequestException).getResponse()),
    ).toContain('bogus should not exist');
  });
});
