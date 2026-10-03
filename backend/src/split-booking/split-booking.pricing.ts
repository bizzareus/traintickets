export const DEFAULT_SPLIT_BOOKING_SERVICE_FEE_RATE = 0.04;

export function getSplitBookingServiceFeeRate(): number {
  const envVal = process.env.SPLIT_BOOKING_SERVICE_FEE_RATE;
  if (envVal !== undefined && envVal !== '') {
    const parsed = Number(envVal);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_SPLIT_BOOKING_SERVICE_FEE_RATE;
}

export const SPLIT_BOOKING_SERVICE_FEE_RATE =
  DEFAULT_SPLIT_BOOKING_SERVICE_FEE_RATE;

export function calculateSplitBookingServiceFee(
  totalFare: number,
  rate = getSplitBookingServiceFeeRate(),
): number {
  return Math.round(totalFare * rate);
}

/** Use the persisted fee for existing bookings, or compute payment service charge using rate. */
export function bookingPrice(
  totalFare: number,
  serviceFee?: number,
  rate = getSplitBookingServiceFeeRate(),
) {
  const fee =
    typeof serviceFee === 'number'
      ? serviceFee
      : calculateSplitBookingServiceFee(totalFare, rate);
  return { totalFare, serviceFee: fee, amount: totalFare + fee };
}
