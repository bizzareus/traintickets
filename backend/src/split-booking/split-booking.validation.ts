import moment from 'moment';
import type { CreateSplitBookingDto } from './split-booking.types';
import { canonicalStation } from '../booking-v2/station-hubs';

/** Never guess the boarding date of a split leg that may cross midnight. */
export function validateBookingItinerary(booking: CreateSplitBookingDto): void {
  if (
    !booking.legs ||
    booking.legs.length < 2 ||
    !Number.isSafeInteger(booking.totalFare) ||
    booking.totalFare <= 0
  ) {
    throw new Error(
      'A split booking requires at least two legs and a positive total fare in whole rupees',
    );
  }
  for (const leg of booking.legs) {
    if (
      !/^[A-Z0-9]{1,10}$/.test(leg.from) ||
      !/^[A-Z0-9]{1,10}$/.test(leg.to) ||
      leg.from === leg.to ||
      !/^[A-Z0-9]{1,5}$/.test(leg.travelClass) ||
      !leg.boardingDate ||
      !moment(leg.boardingDate, 'YYYY-MM-DD', true).isValid() ||
      !Number.isFinite(leg.fare) ||
      leg.fare <= 0
    ) {
      throw new Error(
        'Each leg requires station codes, class, a valid boardingDate and a positive fare',
      );
    }
  }
  const first = booking.legs[0];
  const last = booking.legs[booking.legs.length - 1];
  if (
    canonicalStation(first.from) !==
      canonicalStation(booking.fromStationCode) ||
    canonicalStation(last.to) !== canonicalStation(booking.toStationCode) ||
    first.boardingDate !== booking.journeyDate ||
    booking.legs.some(
      (leg, index) =>
        index > 0 && booking.legs[index - 1].boardingDate > leg.boardingDate,
    ) ||
    booking.legs.reduce((sum, leg) => sum + Math.round(leg.fare * 100), 0) >
      Math.round(booking.totalFare * 100)
  ) {
    throw new Error(
      'Split legs must form the requested journey within its paid fare',
    );
  }
}
