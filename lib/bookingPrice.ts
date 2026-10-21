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
  options?: { travelInsurance?: boolean },
): Array<[string, number]> {
  const items: Array<[string, number]> = [
    ["Ticket Fare", price.totalFare],
    ["IRCTC Service Charge", price.irctcServiceFee ?? 0],
    ["LastBerth Service Charge", price.serviceFee],
  ];

  const hasInsurance =
    options?.travelInsurance ??
    (price.travelInsuranceFee !== undefined && price.travelInsuranceFee > 0);

  if (hasInsurance) {
    items.push(["Travel Insurance", price.travelInsuranceFee ?? 0.45]);
  }

  return items;
}

export function calculatePayableTotal(
  price: SplitBookingPrice,
  options?: { travelInsurance?: boolean },
): number {
  const hasInsurance =
    options?.travelInsurance ??
    (price.travelInsuranceFee !== undefined && price.travelInsuranceFee > 0);
  const insuranceFee = hasInsurance ? (price.travelInsuranceFee ?? 0.45) : 0;

  return (
    price.totalFare +
    (price.irctcServiceFee ?? 0) +
    price.serviceFee +
    insuranceFee
  );
}

