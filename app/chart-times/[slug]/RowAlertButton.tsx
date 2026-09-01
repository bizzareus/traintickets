"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent, trackAlertRequested } from "@/lib/analytics/track";

function ymdPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Per-station "Get Alert" button. Opens a compact dialog that asks only for the
 * journey date and contact details — the boarding station is taken from the table
 * row. Subscribes via the journey monitoring engine so the user is notified at
 * this station's chart-preparation time.
 */
export default function RowAlertButton({
  trainNumber,
  trainName,
  stationCode,
  stationName,
  destinationCode,
  initialJourneyDate,
}: {
  trainNumber: string;
  trainName: string;
  stationCode: string;
  stationName: string;
  destinationCode: string;
  initialJourneyDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [journeyDate, setJourneyDate] = useState(initialJourneyDate || "");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Default the journey date to the next day unless the page supplied one.
  useEffect(() => {
    if (!initialJourneyDate) setJourneyDate(ymdPlusDays(1));
  }, [initialJourneyDate]);

  // Close on Escape while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async () => {
    const em = email.trim();
    const mob = mobile.trim();
    if (!em && !mob) {
      setError("Please enter an email or mobile number so we can reach you.");
      return;
    }
    if (!journeyDate.trim()) {
      setError("Please pick a journey date.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: stationCode,
        toStationCode: destinationCode,
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: "SL",
        stationCodesToMonitor: [stationCode],
        email: em || undefined,
        mobile: mob || undefined,
      });
      setSuccess(true);
      trackAlertRequested({
        success: true,
        source: "chart_times_row",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: stationCode,
        toCode: destinationCode,
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: "SL",
        email: em || undefined,
        mobile: mob || undefined,
      });
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { message?: string; errors?: Array<{ message?: string }> } };
      };
      const msg =
        e?.response?.data?.errors?.[0]?.message ||
        e?.response?.data?.message ||
        "Couldn't set up the alert. Please try again.";
      const errMsg = typeof msg === "string" ? msg : JSON.stringify(msg);
      setError(errMsg);
      trackAlertRequested({
        success: false,
        source: "chart_times_row",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: stationCode,
        toCode: destinationCode,
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: "SL",
        email: em || undefined,
        mobile: mob || undefined,
        error: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackAnalyticsEvent({
            name: "chart_alert_opened",
            properties: { source: "row", train_number: trainNumber, station_code: stationCode },
          });
        }}
        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 whitespace-nowrap touch-manipulation"
      >
        <BellRing className="h-3.5 w-3.5" />
        Get Alert
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <BellRing className="h-4 w-4 text-blue-700" />
                Chart alert — {stationName} ({stationCode})
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {success ? (
              <p className="mt-2 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
                Alert set! We&apos;ll notify you when the chart for {trainName} (
                {trainNumber}) is prepared at {stationCode} on{" "}
                {journeyDate.slice(0, 10)} — so you can check live tickets.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  We&apos;ll notify you when the chart is prepared at{" "}
                  <span className="font-medium">{stationName}</span> so you can
                  grab live current-availability tickets.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                  className="flex flex-col gap-3"
                >
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">
                      Journey date
                    </span>
                    <input
                      type="date"
                      value={journeyDate.slice(0, 10)}
                      min={ymdPlusDays(0)}
                      onChange={(e) => setJourneyDate(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                    />
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="Mobile (for WhatsApp/SMS)"
                    autoComplete="tel"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                  {error && (
                    <p className="text-sm font-medium text-red-700">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Setting up…" : "Set alert"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
