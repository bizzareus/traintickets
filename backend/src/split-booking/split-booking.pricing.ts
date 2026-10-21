import type { SplitTicketBooking } from '@prisma/client';
import charges from './booking-charges.json';
import type { SplitBookingLeg } from './split-booking.types';

type StoredBookingPrice = Pick<
  SplitTicketBooking,
  'totalFare' | 'serviceFee' | 'irctcServiceFeePaise' | 'paymentGatewayFeePaise'
> & {
  travelInsurance?: boolean;
  travelInsurancePaise?: number;
  passengers?: unknown;
};

const irctcCharges: Readonly<Record<string, number>> =
  charges.irctcServiceChargeByClass;

export function irctcServiceChargePaise(travelClass: string): number {
  const code = travelClass.trim().toUpperCase();
  const fee = irctcCharges[code];
  if (fee === undefined) throw new Error(`Unsupported travel class: ${code}`);
  return Math.round(fee * 100);
}

export function hasTravelInsurance(booking: StoredBookingPrice): boolean {
  if (booking.travelInsurance !== undefined) {
    return Boolean(booking.travelInsurance);
  }
  if (booking.passengers && typeof booking.passengers === 'object') {
    const p = booking.passengers as Record<string, unknown>;
    if (typeof p.travelInsurance === 'boolean') {
      return p.travelInsurance;
    }
  }
  return false;
}

/** Both service charges are per leg; gateway fee is 0 unless configured. */
export function calculateBookingCharges(
  totalFare: number,
  legs: ReadonlyArray<Pick<SplitBookingLeg, 'travelClass'>>,
  options?: { travelInsurance?: boolean },
): StoredBookingPrice {
  if (!Number.isSafeInteger(totalFare) || totalFare <= 0 || !legs.length) {
    throw new Error('A positive ticket fare and at least one leg are required');
  }
  const serviceFee = legs.length * charges.lastBerthServiceChargePerLeg;
  const irctcServiceFeePaise = legs.reduce(
    (sum, leg) => sum + irctcServiceChargePaise(leg.travelClass),
    0,
  );
  const travelInsurance = options?.travelInsurance ?? true;
  const travelInsurancePaise = travelInsurance
    ? Math.round((charges.travelInsuranceCharge ?? 0.45) * 100)
    : 0;
  const subtotalPaise =
    (totalFare + serviceFee) * 100 +
    irctcServiceFeePaise +
    travelInsurancePaise;
  const paymentGatewayPercent = charges.paymentGatewayPercent ?? 0;
  if (
    !Number.isSafeInteger(subtotalPaise) ||
    !Number.isSafeInteger(subtotalPaise * (paymentGatewayPercent || 1))
  ) {
    throw new Error('Ticket fare exceeds the supported payment amount');
  }
  const paymentGatewayFeePaise = paymentGatewayPercent
    ? Math.round((subtotalPaise * paymentGatewayPercent) / 100)
    : 0;

  return {
    totalFare,
    serviceFee,
    irctcServiceFeePaise,
    paymentGatewayFeePaise,
    travelInsurance,
    travelInsurancePaise,
  };
}

/** Never recalculate historical charges using today's configuration. */
export function bookingAmountPaise(booking: StoredBookingPrice): number {
  const travelInsurancePaise =
    booking.travelInsurancePaise !== undefined
      ? booking.travelInsurancePaise
      : hasTravelInsurance(booking)
        ? Math.round((charges.travelInsuranceCharge ?? 0.45) * 100)
        : 0;

  return (
    (booking.totalFare + booking.serviceFee) * 100 +
    (booking.irctcServiceFeePaise ?? 0) +
    (booking.paymentGatewayFeePaise ?? 0) +
    travelInsurancePaise
  );
}

export function bookingPrice(booking: StoredBookingPrice) {
  const travelInsurancePaise =
    booking.travelInsurancePaise !== undefined
      ? booking.travelInsurancePaise
      : hasTravelInsurance(booking)
        ? Math.round((charges.travelInsuranceCharge ?? 0.45) * 100)
        : 0;

  return {
    totalFare: booking.totalFare,
    irctcServiceFee: (booking.irctcServiceFeePaise ?? 0) / 100,
    serviceFee: booking.serviceFee,
    paymentGatewayFee: (booking.paymentGatewayFeePaise ?? 0) / 100,
    travelInsuranceFee: travelInsurancePaise / 100,
    // Muzobox only accepts whole rupees: the chargeable total is the exact
    // paise sum rounded once, while the itemized components stay exact.
    amount: Math.round(bookingAmountPaise(booking) / 100),
  };
}

export type SplitBookingPrice = ReturnType<typeof bookingPrice>;
