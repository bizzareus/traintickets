"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

const CLASSES = ["SL", "3A", "2A", "1A", "CC", "EC", "2S"] as const;

type StationOption = { stationCode: string; stationName: string };

function ymdPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function todayYmd(): string {
  return ymdPlusDays(0);
}

/**
 * Subscribe to a chart-preparation alert for this train. Reuses the journey
 * monitoring engine (`POST /api/availability/journey`), which schedules a task
 * at the station's chart-preparation time and notifies the user on the email /
 * mobile they provide so they can check live (current-availability) tickets.
 */
export default function ChartTimeAlertCTA({
  trainNumber,
  trainName,
  destinationCode,
  stations,
  initialJourneyDate,
  initialStationCode,
}: {
  trainNumber: string;
  trainName: string;
  destinationCode: string;
  /** Boarding stations the user can be alerted for (destination excluded). */
  stations: StationOption[];
  initialJourneyDate?: string | null;
  initialStationCode?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [stationCode, setStationCode] = useState(
    initialStationCode || stations[0]?.stationCode || "",
  );
  const [classCode, setClassCode] = useState<string>("SL");
  const [journeyDate, setJourneyDate] = useState(initialJourneyDate || "");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Default the journey date to the next day (tomorrow) unless the page already
  // supplied one. Done after mount to avoid an SSR/client "today" mismatch.
  useEffect(() => {
    if (!initialJourneyDate) {
      setJourneyDate(ymdPlusDays(1));
    }
  }, [initialJourneyDate]);

  const subscribe = async () => {
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
    setSuccess(false);
    try {
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: stationCode,
        toStationCode: destinationCode,
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: classCode.trim().toUpperCase(),
        stationCodesToMonitor: [stationCode],
        email: em || undefined,
        mobile: mob || undefined,
      });
      setSuccess(true);
      trackAnalyticsEvent({
        name: "chart_alert_submitted",
        properties: {
          success: true,
          source: "page",
          train_number: trainNumber,
          station_code: stationCode,
          has_email: Boolean(em),
          has_mobile: Boolean(mob),
        },
      });
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { message?: string; errors?: Array<{ message?: string }> } };
      };
      const msg =
        e?.response?.data?.errors?.[0]?.message ||
        e?.response?.data?.message ||
        "Couldn't set up the alert. Please check your inputs and try again.";
      const errMsg = typeof msg === "string" ? msg : JSON.stringify(msg);
      setError(errMsg);
      trackAnalyticsEvent({
        name: "chart_alert_submitted",
        properties: {
          success: false,
          source: "page",
          train_number: trainNumber,
          station_code: stationCode,
          has_email: Boolean(em),
          has_mobile: Boolean(mob),
          error: errMsg,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">
          Alert set! We&apos;ll notify you the moment the chart for {trainName} (
          {trainNumber}) is prepared at {stationCode} on{" "}
          {journeyDate.slice(0, 10)} — so you can check live tickets.
        </p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <BellRing className="h-4 w-4 text-blue-700" />
            Get a chart preparation alert
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            We&apos;ll text or email you the moment IRCTC prepares the chart for
            this train, so you can grab live current-availability tickets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            trackAnalyticsEvent({
              name: "chart_alert_opened",
              properties: { source: "page", train_number: trainNumber, station_code: stationCode },
            });
          }}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700"
        >
          Set up alert
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <BellRing className="h-4 w-4 text-blue-700" />
        Chart preparation alert for {trainName} ({trainNumber})
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        We&apos;ll notify you on the contact below when the chart is prepared at
        your boarding station, so you can check live tickets.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Boarding station</span>
          <select
            value={stationCode}
            onChange={(e) => setStationCode(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            {stations.map((s) => (
              <option key={s.stationCode} value={s.stationCode}>
                {s.stationName} ({s.stationCode})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Class</span>
          <select
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Journey date</span>
          <input
            type="date"
            value={journeyDate.slice(0, 10)}
            min={todayYmd()}
            onChange={(e) => setJourneyDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={subscribe}
          className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Setting up…" : "Set alert"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
