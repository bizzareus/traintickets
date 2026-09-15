"use client";

import Link from "next/link";

/**
 * Shared trust footer for chart-alert forms: a yellow social-proof strip
 * plus a link to the manual refund request form. Tailwind only.
 */
export function ChartAlertTrustFooter() {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-center text-[11px] font-semibold text-amber-800">
        60% times found tickets · Trusted by 10K+ travelers
      </p>
      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        No ticket found? Your refund is automatic. Facing any other issue?{" "}
        <Link
          href="/refund"
          className="font-semibold text-blue-600 hover:underline"
        >
          Request a refund
        </Link>
      </p>
    </div>
  );
}
