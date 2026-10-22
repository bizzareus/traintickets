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
  options?: { travelInsurance?: boolean; legCount?: number },
): Array<[string, number]> {
  const items: Array<[string, number]> = [
    ["Ticket Fare", price.totalFare],
    ["IRCTC Service Charge", price.irctcServiceFee ?? 0],
  ];

  if (price.paymentGatewayFee !== undefined && price.paymentGatewayFee > 0) {
    items.push(["IRCTC Payment Gateway Fee", price.paymentGatewayFee]);
  }

  items.push(["LastBerth Service Charge", price.serviceFee]);

  const hasInsurance =
    options?.travelInsurance ??
    (price.travelInsuranceFee !== undefined && price.travelInsuranceFee > 0);

  if (hasInsurance) {
    const legs = options?.legCount ?? 1;
    const fallbackFee = Number((legs * 0.45).toFixed(2));
    items.push(["Travel Insurance", price.travelInsuranceFee ?? fallbackFee]);
  }

  return items;
}

export function calculatePayableTotal(
  price: SplitBookingPrice,
  options?: { travelInsurance?: boolean; legCount?: number },
): number {
  const hasInsurance =
    options?.travelInsurance ??
    (price.travelInsuranceFee !== undefined && price.travelInsuranceFee > 0);
  const legs = options?.legCount ?? 1;
  const fallbackFee = Number((legs * 0.45).toFixed(2));
  const insuranceFee = hasInsurance
    ? (price.travelInsuranceFee ?? fallbackFee)
    : 0;

  return Number(
    (
      price.totalFare +
      (price.irctcServiceFee ?? 0) +
      (price.paymentGatewayFee ?? 0) +
      price.serviceFee +
      insuranceFee
    ).toFixed(2),
  );
}

