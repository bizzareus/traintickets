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
  legsPayload?: unknown;
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

export function getBookingLegCount(booking: StoredBookingPrice): number {
  if (Array.isArray(booking.legsPayload)) {
    return Math.max(1, booking.legsPayload.length);
  }
  if (typeof booking.legsPayload === 'string') {
    try {
      const parsed: unknown = JSON.parse(booking.legsPayload);
      if (Array.isArray(parsed)) return Math.max(1, parsed.length);
    } catch {
      // Ignore malformed legacy JSON payloads
    }
  }
  const custom = booking as { legs?: unknown };
  if (Array.isArray(custom.legs)) {
    return Math.max(1, custom.legs.length);
  }
  if (booking.serviceFee && charges.lastBerthServiceChargePerLeg) {
    const derived = Math.round(
      booking.serviceFee / charges.lastBerthServiceChargePerLeg,
    );
    if (derived >= 1) return derived;
  }
  return 1;
}

export function getTravelInsurancePaise(booking: StoredBookingPrice): number {
  if (booking.travelInsurancePaise !== undefined) {
    return booking.travelInsurancePaise;
  }
  if (booking.passengers && typeof booking.passengers === 'object') {
    const p = booking.passengers as Record<string, unknown>;
    if (typeof p.travelInsurancePaise === 'number') {
      return p.travelInsurancePaise;
    }
  }
  if (!hasTravelInsurance(booking)) {
    return 0;
  }
  const legs = getBookingLegCount(booking);
  return Math.round(legs * (charges.travelInsuranceCharge ?? 0.45) * 100);
}

/** Both service charges and travel insurance are per leg; gateway fee is 0 unless configured. */
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
    ? Math.round(legs.length * (charges.travelInsuranceCharge ?? 0.45) * 100)
    : 0;
  const irctcSubtotalPaise =
    totalFare * 100 + irctcServiceFeePaise + travelInsurancePaise;
  const configuredCharges = charges as {
    irctcPaymentGatewayPercent?: number;
    paymentGatewayPercent?: number;
  };
  const irctcPgPercent =
    configuredCharges.irctcPaymentGatewayPercent ??
    configuredCharges.paymentGatewayPercent ??
    0;
  if (
    !Number.isSafeInteger(irctcSubtotalPaise) ||
    irctcSubtotalPaise * (irctcPgPercent || 1) > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Ticket fare exceeds the supported payment amount');
  }
  const paymentGatewayFeePaise = irctcPgPercent
    ? Math.round((irctcSubtotalPaise * irctcPgPercent) / 100)
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
  const travelInsurancePaise = getTravelInsurancePaise(booking);

  return (
    (booking.totalFare + booking.serviceFee) * 100 +
    (booking.irctcServiceFeePaise ?? 0) +
    (booking.paymentGatewayFeePaise ?? 0) +
    travelInsurancePaise
  );
}

export function bookingPrice(booking: StoredBookingPrice) {
  const travelInsurancePaise = getTravelInsurancePaise(booking);

  return {
    totalFare: booking.totalFare,
    irctcServiceFee: (booking.irctcServiceFeePaise ?? 0) / 100,
    serviceFee: booking.serviceFee,
    paymentGatewayFee: (booking.paymentGatewayFeePaise ?? 0) / 100,
    travelInsuranceFee: travelInsurancePaise / 100,
    amount: Number((bookingAmountPaise(booking) / 100).toFixed(2)),
  };
}

export type SplitBookingPrice = ReturnType<typeof bookingPrice>;
