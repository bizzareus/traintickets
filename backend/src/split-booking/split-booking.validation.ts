import moment from 'moment';
import type { CreateSplitBookingDto } from './split-booking.types';

/** Never guess the boarding date of a split leg that may cross midnight. */
export function validateBookingItinerary(booking: CreateSplitBookingDto): void {
  if (
    !booking.legs ||
    booking.legs.length !== 2 ||
    !Number.isFinite(booking.totalFare) ||
    booking.totalFare <= 0
  ) {
    throw new Error(
      'A split booking requires exactly two legs and a positive total fare',
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
  const [first, second] = booking.legs;
  if (
    first.from !== booking.fromStationCode ||
    first.to !== second.from ||
    second.to !== booking.toStationCode ||
    first.boardingDate !== booking.journeyDate ||
    second.boardingDate < first.boardingDate ||
    Math.round((first.fare + second.fare) * 100) >
      Math.round(booking.totalFare * 100)
  ) {
    throw new Error(
      'Split legs must form the requested journey within its paid fare',
    );
  }
}
