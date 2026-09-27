import { cn } from "@/lib/utils";

export function ChartAlertDiscountPrice({
  price,
  className,
}: {
  price: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-slate-400 line-through">₹{price * 2}</span>
      <span className="font-bold text-slate-900">₹{price}</span>
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        50% off
      </span>
    </span>
  );
}
