import type { SplitBookingPrice } from "@/lib/split-booking";
import { bookingPriceItems, formatBookingAmount } from "@/lib/bookingPrice";

export function BookingPriceBreakdown({ price }: { price: SplitBookingPrice }) {
  return (
    <section
      aria-label="Fare breakdown"
      className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left"
    >
      <dl className="space-y-2.5 text-sm">
        {bookingPriceItems(price).map(([label, amount]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4"
          >
            <dt className="text-slate-600">{label}</dt>
            <dd className="shrink-0 font-medium tabular-nums text-slate-900">
              {formatBookingAmount(amount)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3 font-bold text-slate-900">
          <dt>Total Amount</dt>
          <dd className="shrink-0 tabular-nums">
            {formatBookingAmount(price.amount)}
          </dd>
        </div>
      </dl>
      {(price.irctcServiceFee > 0 || price.paymentGatewayFee > 0) && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          IRCTC charges include GST. LastBerth charges ₹40 per leg. Gateway fees
          are 3% of ticket fare and service charges.
        </p>
      )}
      {Math.abs(
        price.totalFare +
          price.irctcServiceFee +
          price.serviceFee +
          price.paymentGatewayFee -
          price.amount,
      ) > 0.001 && (
        <p className="mt-1 text-xs text-slate-500">
          The payable total is rounded to the nearest whole rupee.
        </p>
      )}
    </section>
  );
}
