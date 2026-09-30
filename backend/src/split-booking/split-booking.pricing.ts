/** Charged once per booking, regardless of the number of ticket legs. */
export const SPLIT_BOOKING_SERVICE_FEE_RUPEES = 50;

/** Use the persisted fee for existing bookings, including legacy zero-fee orders. */
export function bookingPrice(totalFare: number, serviceFee: number) {
  return { totalFare, serviceFee, amount: totalFare + serviceFee };
}
