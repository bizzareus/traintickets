import { bookingPrice } from './split-booking.pricing';

type StoredPrice = Parameters<typeof bookingPrice>[0];
const currency = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function priceItems(booking: StoredPrice): Array<[string, number]> {
  const price = bookingPrice(booking);
  return [
    ['Ticket Fare', price.totalFare],
    ['IRCTC Service Charge', price.irctcServiceFee],
    ['LastBerth Service Charge', price.serviceFee],
    ['Payment Gateway Fees (3%)', price.paymentGatewayFee],
  ];
}

export function bookingPriceText(booking: StoredPrice): string {
  return priceItems(booking)
    .map(([label, amount]) => `${label}: INR ${currency.format(amount)}`)
    .join('\n');
}

/** Shared payment receipt, ticket confirmation, and cancellation email breakdown. */
export function bookingPriceHtml(booking: StoredPrice): string {
  return `<table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
    ${priceItems(booking)
      .map(
        ([label, amount]) =>
          `<tr><td style="padding: 6px 0; color: #64748b;">${label}</td><td style="padding: 6px 0; text-align: right;">₹${currency.format(amount)}</td></tr>`,
      )
      .join('')}
    <tr style="border-top: 1px solid #e2e8f0; font-weight: 700;"><td style="padding: 10px 0;">Total Amount</td><td style="padding: 10px 0; text-align: right;">₹${currency.format(bookingPrice(booking).amount)}</td></tr>
  </table>`;
}
