import type { SplitBookingPrice } from "@/lib/split-booking";
import {
  bookingPriceItems,
  calculatePayableTotal,
  formatBookingAmount,
} from "@/lib/bookingPrice";

export interface BookingPriceBreakdownProps {
  price: SplitBookingPrice;
  travelInsurance?: boolean;
  legCount?: number;
}

export function BookingPriceBreakdown({
  price,
  travelInsurance = true,
  legCount,
}: BookingPriceBreakdownProps) {
  const items = bookingPriceItems(price, { travelInsurance, legCount });
  const totalAmount = calculatePayableTotal(price, { travelInsurance, legCount });

  return (
    <section
      aria-label="Fare breakdown"
      className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left"
    >
      <dl className="space-y-2.5 text-sm">
        {items.map(([label, amount]) => (
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
        <div className="flex items-baseline justify-between gap-4 text-xs text-slate-500">
          <dt className="text-slate-600">Checkout Payment Processing</dt>
          <dd className="shrink-0 font-medium text-slate-500">
            Charged at checkout by payment gateway
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3 font-bold text-slate-900">
          <dt>Total Amount</dt>
          <dd className="shrink-0 tabular-nums">
            {formatBookingAmount(totalAmount)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
