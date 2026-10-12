import type { SplitBookingPrice } from "./split-booking";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBookingAmount(amount: number): string {
  return currency.format(amount);
}

export function bookingPriceItems(
  price: SplitBookingPrice,
): Array<[string, number]> {
  return [
    ["Ticket Fare", price.totalFare],
    ["IRCTC Service Charge", price.irctcServiceFee ?? 0],
    ["LastBerth Service Charge", price.serviceFee],
    ["Payment Gateway Fees (3%)", price.paymentGatewayFee ?? 0],
  ];
}
