import type { SplitTicketBooking } from '@prisma/client';
import charges from './booking-charges.json';
import type { SplitBookingLeg } from './split-booking.types';

type StoredBookingPrice = Pick<
  SplitTicketBooking,
  'totalFare' | 'serviceFee' | 'irctcServiceFeePaise' | 'paymentGatewayFeePaise'
>;

const irctcCharges: Readonly<Record<string, number>> =
  charges.irctcServiceChargeByClass;

export function irctcServiceChargePaise(travelClass: string): number {
  const code = travelClass.trim().toUpperCase();
  const fee = irctcCharges[code];
  if (fee === undefined) throw new Error(`Unsupported travel class: ${code}`);
  return Math.round(fee * 100);
}

/** Both service charges are per leg; the gateway fee is rounded once on the combined subtotal. */
export function calculateBookingCharges(
  totalFare: number,
  legs: ReadonlyArray<Pick<SplitBookingLeg, 'travelClass'>>,
): StoredBookingPrice {
  if (!Number.isSafeInteger(totalFare) || totalFare <= 0 || !legs.length) {
    throw new Error('A positive ticket fare and at least one leg are required');
  }
  const serviceFee = legs.length * charges.lastBerthServiceChargePerLeg;
  const irctcServiceFeePaise = legs.reduce(
    (sum, leg) => sum + irctcServiceChargePaise(leg.travelClass),
    0,
  );
  const subtotalPaise = (totalFare + serviceFee) * 100 + irctcServiceFeePaise;
  if (!Number.isSafeInteger(subtotalPaise * charges.paymentGatewayPercent)) {
    throw new Error('Ticket fare exceeds the supported payment amount');
  }
  return {
    totalFare,
    serviceFee,
    irctcServiceFeePaise,
    paymentGatewayFeePaise: Math.round(
      (subtotalPaise * charges.paymentGatewayPercent) / 100,
    ),
  };
}

/** Never recalculate historical charges using today's configuration. */
export function bookingAmountPaise(booking: StoredBookingPrice): number {
  return (
    (booking.totalFare + booking.serviceFee) * 100 +
    (booking.irctcServiceFeePaise ?? 0) +
    (booking.paymentGatewayFeePaise ?? 0)
  );
}

export function bookingPrice(booking: StoredBookingPrice) {
  return {
    totalFare: booking.totalFare,
    irctcServiceFee: (booking.irctcServiceFeePaise ?? 0) / 100,
    serviceFee: booking.serviceFee,
    paymentGatewayFee: (booking.paymentGatewayFeePaise ?? 0) / 100,
    amount: bookingAmountPaise(booking) / 100,
  };
}

export type SplitBookingPrice = ReturnType<typeof bookingPrice>;
