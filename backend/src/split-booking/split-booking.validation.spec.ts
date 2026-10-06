import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSplitBookingDto } from './split-booking.dto';
import { validateBookingItinerary } from './split-booking.validation';

describe('Multi-leg booking validation', () => {
  const request = {
    trainNumber: '12215',
    trainName: 'BDTS GARIB RATH',
    fromStationCode: 'NDLS',
    toStationCode: 'AII',
    journeyDate: '2026-10-01',
    travelClass: '3A',
    quota: 'GN',
    totalFare: 1110,
    legs: [
      {
        from: 'DEE',
        to: 'AWR',
        travelClass: '3A',
        fare: 385,
        boardingDate: '2026-10-01',
      },
      {
        from: 'AWR',
        to: 'JP',
        travelClass: '3A',
        fare: 385,
        boardingDate: '2026-10-01',
      },
      {
        from: 'JP',
        to: 'AII',
        travelClass: '3A',
        fare: 340,
        boardingDate: '2026-10-01',
      },
    ],
    passengers: [
      { name: 'Test Passenger', age: 30, gender: 'Female' as const },
    ],
    childPassengers: [],
    autoUpgrade: true,
    contactMobile: '9876543210',
    contactEmail: 'test@example.com',
  };

  it('accepts the reported three-leg route at the API validation boundary', async () => {
    const errors = await validate(
      plainToInstance(CreateSplitBookingDto, request),
    );
    expect(errors).toEqual([]);
  });

  it('accepts all three contiguous legs and the Delhi station alias', () => {
    expect(() => validateBookingItinerary(request)).not.toThrow();
  });

  it('accepts non-contiguous intermediate legs when user books confirmed segments', () => {
    const nonContiguous = structuredClone(request);
    nonContiguous.legs[1].from = 'OTHER';
    expect(() => validateBookingItinerary(nonContiguous)).not.toThrow();
  });

  it('still rejects an unrelated search origin', () => {
    expect(() =>
      validateBookingItinerary({ ...request, fromStationCode: 'HWH' }),
    ).toThrow();
  });

  it('has no fixed maximum leg count', async () => {
    const stations = Array.from({ length: 51 }, (_, index) => `ST${index}`);
    const legs = stations.slice(0, -1).map((from, index) => ({
      from,
      to: stations[index + 1],
      travelClass: '3A',
      fare: 10,
      boardingDate: '2026-10-01',
    }));
    const manyLegs = {
      ...request,
      fromStationCode: stations[0],
      toStationCode: stations[50],
      legs,
      totalFare: 500,
    };
    expect(
      await validate(plainToInstance(CreateSplitBookingDto, manyLegs)),
    ).toEqual([]);
    expect(() => validateBookingItinerary(manyLegs)).not.toThrow();
  });

  it('rejects a later leg whose boarding date moves backwards', () => {
    const invalid = structuredClone(request);
    invalid.legs[2].boardingDate = '2026-09-30';
    expect(() => validateBookingItinerary(invalid)).toThrow();
  });

  it('counts every leg when validating the ticket fare', () => {
    expect(() =>
      validateBookingItinerary({ ...request, totalFare: 770 }),
    ).toThrow();
  });

  it('accepts split booking with a station gap between legs', () => {
    const splitWithGap = {
      trainNumber: '12066',
      trainName: 'JANSHATABDI EXP',
      fromStationCode: 'DEE',
      toStationCode: 'AII',
      journeyDate: '2026-10-03',
      travelClass: 'CC',
      quota: 'GN',
      totalFare: 720,
      legs: [
        {
          from: 'DEE',
          to: 'RE',
          travelClass: 'CC',
          fare: 300,
          boardingDate: '2026-10-03',
          departureTime: '16:15',
          arrivalTime: '17:35',
          durationMinutes: 80,
        },
        {
          from: 'NMK',
          to: 'AII',
          travelClass: 'CC',
          fare: 420,
          boardingDate: '2026-10-03',
          departureTime: '18:59',
          arrivalTime: '22:20',
          durationMinutes: 201,
        },
      ],
      passengers: [{ name: 'Kartik Arora', age: 30, gender: 'Male' as const }],
      childPassengers: [],
      autoUpgrade: true,
      contactMobile: '9999224767',
      contactEmail: 'me@example.com',
    };
    expect(() => validateBookingItinerary(splitWithGap)).not.toThrow();
  });

  it('accepts a single selected leg when user skips other legs', async () => {
    const singleLeg = {
      ...request,
      fromStationCode: 'DEE',
      toStationCode: 'AWR',
      totalFare: 385,
      legs: [request.legs[0]],
    };
    const errors = await validate(
      plainToInstance(CreateSplitBookingDto, singleLeg),
    );
    expect(errors).toEqual([]);
    expect(() => validateBookingItinerary(singleLeg)).not.toThrow();
  });

  it('rejects booking with zero legs', () => {
    const zeroLegs = {
      ...request,
      legs: [],
    };
    expect(() => validateBookingItinerary(zeroLegs)).toThrow(
      'A booking requires at least one leg and a positive total fare in whole rupees',
    );
  });
});
