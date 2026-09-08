"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

/** Pixels scrolled before the popup appears. */
const SCROLL_THRESHOLD_PX = 400;

function dismissalKey(trainNumber: string): string {
  return `findTicketsPopupDismissed:${trainNumber.trim()}`;
}

/** Tomorrow in IST (YYYY-MM-DD), matching the app's date convention. */
function tomorrowIstYmd(): string {
  const istNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  istNow.setDate(istNow.getDate() + 1);
  const y = istNow.getFullYear();
  const m = String(istNow.getMonth() + 1).padStart(2, "0");
  const d = String(istNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Scroll-triggered promo popup shown on every chart-times train page:
 * "Find Confirmed Tickets in {train name}" + a Find Tickets CTA that
 * redirects to the search page with the train's origin/destination
 * prefilled and the next date preselected (the homepage auto-runs a
 * search when from+to+date query params are present).
 *
 * Mobile renders as a bottom sheet, desktop as a centered modal. Appears
 * once the user scrolls a bit; dismissal persists for the tab session.
 */
export default function FindTicketsBar({
  trainNumber,
  trainName,
  journeyDate,
  fromCode,
  fromName,
  toCode,
  toName,
}: {
  trainNumber: string;
  trainName: string;
  journeyDate?: string | null;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed =
        window.sessionStorage.getItem(dismissalKey(trainNumber)) === "1";
    } catch {
      /* ignore */
    }
    if (dismissed) return;

    const onScroll = () => {
      if (window.scrollY > SCROLL_THRESHOLD_PX) {
        setVisible(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [trainNumber]);

  const resolvedDate = useMemo(
    () => journeyDate?.trim().slice(0, 10) || tomorrowIstYmd(),
    [journeyDate],
  );

  const href = useMemo(() => {
    const qs = new URLSearchParams({
      from: fromCode,
      to: toCode,
      fromName,
      toName,
      date: resolvedDate,
    });
    return `/search?${qs.toString()}`;
  }, [fromCode, toCode, fromName, toName, resolvedDate]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(dismissalKey(trainNumber), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Find confirmed tickets in ${trainName}`}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div className="relative w-full bg-gradient-to-r from-blue-700 to-blue-500 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl rounded-t-2xl sm:rounded-2xl sm:max-w-md sm:p-6">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-blue-100 hover:bg-white/10 touch-manipulation"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="pr-10 text-lg font-bold text-white sm:text-xl">
          Find Confirmed Tickets in {trainName}
        </h2>
        <p className="mt-1 pr-10 text-sm text-blue-100">
          Check live seat availability from {fromCode} to {toCode} on{" "}
          {resolvedDate}.
        </p>
        <Link
          href={href}
          onClick={() => {
            trackAnalyticsEvent({
              name: "find_ticket_cta_clicked",
              properties: {
                source: "chart_times_popup",
                train_number: trainNumber,
                train_name: trainName,
                from_code: fromCode,
                to_code: toCode,
                journey_date: resolvedDate,
              },
            });
            dismiss();
          }}
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-blue-700 shadow-sm transition hover:bg-blue-50 touch-manipulation sm:w-auto"
        >
          Click to find confirmed tickets
        </Link>
      </div>
    </div>
  );
}
