"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/**
 * Shared trust footer for chart-alert forms: a single refund-assurance line
 * (with a link to the manual refund form) above the social-proof strip,
 * separated from the form by a divider. Tailwind only.
 */
export function ChartAlertTrustFooter() {
  return (
    <div className="w-full space-y-2 border-t border-blue-100 pt-3">
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          Facing any issue?{" "}
          <Link
            href="/refund"
            className="font-semibold text-blue-600 hover:underline"
          >
            Request a refund
          </Link>
        </span>
      </p>
      <p className="w-full rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-center text-[11px] font-semibold text-amber-800">
        60% times found tickets · Trusted by 10K+ travelers
      </p>
    </div>
  );
}
