"use client";

import { CheckCircle2 } from "lucide-react";
import type { ChartAlertPaymentModalJourney } from "@/components/payments/ChartAlertPaymentModal";
import { cn } from "@/lib/utils";

interface ChartAlertSuccessBoxProps {
  journey: ChartAlertPaymentModalJourney;
  className?: string;
  compact?: boolean;
}

/**
 * Shared paid-alert success state. Rendered in place of the subscription
 * fields box once payment verifies and the alert is queued.
 */
export function ChartAlertSuccessBox({
  journey,
  className,
  compact = false,
}: ChartAlertSuccessBoxProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm",
        compact ? "p-3.5" : "mb-6 p-5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <h2
            className={cn(
              "font-bold text-emerald-900",
              compact ? "text-sm" : "text-base",
            )}
          >
            Alert subscribed!
          </h2>
          <p
            className={cn(
              "mt-1 leading-relaxed text-emerald-800",
              compact ? "text-xs" : "text-sm",
            )}
          >
            We&apos;ll notify you when the chart for{" "}
            <strong>
              {journey.trainName ?? journey.trainNumber} ({journey.trainNumber})
            </strong>{" "}
            is prepared at <strong>{journey.fromStationCode}</strong>
            {journey.toStationCode
              ? ` for ${journey.fromStationCode} → ${journey.toStationCode}`
              : ""}
            {journey.journeyDate
              ? ` on ${journey.journeyDate.slice(0, 10)}`
              : ""}{" "}
            ({journey.classCode}).
          </p>
        </div>
      </div>
    </div>
  );
}
