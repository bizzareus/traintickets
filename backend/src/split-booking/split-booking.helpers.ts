import type { SplitTicketBooking } from '@prisma/client';
import type { CreateSplitBookingDto } from './split-booking.types';
import { bookingPrice } from './split-booking.pricing';

/** Retain the first two PNR aliases for older clients while storing every leg. */
export function bookingPnrFields(pnrs: string[]) {
  return {
    pnrs: [...pnrs],
    pnrLeg1: pnrs[0] || null,
    pnrLeg2: pnrs[1] || null,
  };
}

/** Both fulfillment paths consume the same persisted customer details. */
export function bookingDetails(
  booking: SplitTicketBooking,
): CreateSplitBookingDto & { bookingRef: string } {
  const passengers = booking.passengers as unknown as {
    adults: CreateSplitBookingDto['passengers'];
    children?: CreateSplitBookingDto['childPassengers'];
    confirmBerthsOnly?: boolean;
    preferredCoach?: string;
    travelInsurance?: boolean;
  };
  return {
    bookingRef: booking.bookingRef,
    trainNumber: booking.trainNumber,
    trainName: booking.trainName ?? undefined,
    fromStationCode: booking.fromStationCode,
    toStationCode: booking.toStationCode,
    journeyDate: booking.journeyDate.toISOString().slice(0, 10),
    travelClass: booking.travelClass,
    quota: booking.quota,
    totalFare: booking.totalFare,
    legs: booking.legsPayload as unknown as CreateSplitBookingDto['legs'],
    passengers: passengers.adults,
    childPassengers: passengers.children ?? [],
    autoUpgrade: booking.autoUpgrade,
    confirmBerthsOnly: passengers.confirmBerthsOnly,
    preferredCoach: passengers.preferredCoach,
    travelInsurance: passengers.travelInsurance,
    contactMobile: booking.contactMobile,
    contactEmail: booking.contactEmail,
  };
}

export function manualBookingMessage(booking: SplitTicketBooking): string {
  const details = bookingDetails(booking);
  const price = bookingPrice(booking.totalFare, booking.serviceFee);
  return [
    'MANUAL TRAIN BOOKING REQUEST',
    `Booking reference: ${booking.bookingRef}`,
    `Train: ${booking.trainNumber}${booking.trainName ? ` - ${booking.trainName}` : ''}`,
    `Journey: ${booking.fromStationCode} → ${booking.toStationCode} on ${details.journeyDate}`,
    `Requested class: ${booking.travelClass} | Quota: ${booking.quota}`,
    `Ticket fare: INR ${price.totalFare} + Payment service charge: INR ${price.serviceFee}`,
    `Total collected: INR ${price.amount} | Payment status: ${booking.paymentStatus}`,
    `Payment ID: ${booking.razorpayPaymentId ?? 'Not supplied'}`,
    `Order ID: ${booking.razorpayOrderId ?? 'Not supplied'}`,
    `Paid at: ${booking.paidAt?.toISOString() ?? 'Not supplied'}`,
    `Requested at: ${booking.createdAt.toISOString()}`,
    '',
    'JOURNEY LEGS',
    ...details.legs.map((leg, index) =>
      [
        `${index + 1}. ${leg.from} → ${leg.to} | Boarding date: ${leg.boardingDate}`,
        `Class: ${leg.travelClass} | Fare: INR ${leg.fare}`,
        `Departure: ${leg.departureTime ?? 'Not supplied'} | Arrival: ${leg.arrivalTime ?? 'Not supplied'} | Duration (minutes): ${leg.durationMinutes ?? 'Not supplied'}`,
      ].join('\n'),
    ),
    '',
    'PASSENGERS',
    ...details.passengers.map(
      (passenger, index) =>
        `${index + 1}. ${passenger.name} | Age: ${passenger.age} | Gender: ${passenger.gender} | Berth: ${passenger.berthPreference || 'No Preference'}${passenger.optBerth ? ' (Opt Berth)' : ''}${passenger.foodChoice ? ` | Food: ${passenger.foodChoice}` : ''} | Senior citizen: ${passenger.seniorCitizen ? 'Yes' : 'No'}`,
    ),
    '',
    'CHILDREN / INFANTS (BELOW 5)',
    ...(details.childPassengers?.length
      ? details.childPassengers.map(
          (child, index) =>
            `${index + 1}. ${child.name} | Age: ${child.age} | Gender: ${child.gender}`,
        )
      : ['None']),
    '',
    `Auto-upgrade: ${booking.autoUpgrade ? 'Yes' : 'No'}`,
    `Book only if confirm berths are allotted: ${details.confirmBerthsOnly ? 'Yes' : 'No'}`,
    details.preferredCoach
      ? `Preferred Coach: ${details.preferredCoach}`
      : null,
    `Travel Insurance: ${details.travelInsurance ? 'Yes' : 'No'}`,
    `Customer mobile: ${booking.contactMobile}`,
    `Customer email: ${booking.contactEmail}`,
    '',
    'Please book these tickets manually. This request has not been reserved by the AI engine.',
  ]
    .filter(Boolean)
    .join('\n');
}
