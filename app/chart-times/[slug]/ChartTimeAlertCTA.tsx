"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api";
import {
  trackAnalyticsEvent,
  trackAlertRequested,
} from "@/lib/analytics/track";
import { useChartAlertPricingExperiment } from "@/lib/hooks/useChartAlertPricingExperiment";
import { isValidIndianMobile, isValidEmail } from "@/lib/validation";

const FALLBACK_CLASSES = ["SL", "3E", "3A", "2A", "1A", "CC", "2S"] as const;

const CLASS_LABELS: Record<string, string> = {
  ANY: "ANY (Any Available Class)",
  "1A": "1A (AC First Class)",
  "2A": "2A (AC 2 Tier)",
  "3A": "3A (AC 3 Tier)",
  "3E": "3E (AC 3 Economy)",
  SL: "SL (Sleeper)",
  CC: "CC (AC Chair Car)",
  EC: "EC (Exec Chair Car)",
  EA: "EA (Exec Anubhuti)",
  "2S": "2S (Second Sitting)",
  FC: "FC (First Class)",
};

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
  destinationCode: initialDestinationCode,
  stations,
  availableClasses: initialAvailableClasses,
  initialJourneyDate,
  initialStationCode,
}: {
  trainNumber: string;
  trainName: string;
  destinationCode?: string;
  /** All scheduled stations in order on the train route. */
  stations: StationOption[];
  availableClasses?: string[];
  initialJourneyDate?: string | null;
  initialStationCode?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [stationCode, setStationCode] = useState(
    initialStationCode || stations[0]?.stationCode || "",
  );

  // Downstream destination options based on the chosen boarding station
  const boardingIndex = useMemo(() => {
    const idx = stations.findIndex((s) => s.stationCode === stationCode);
    return idx >= 0 ? idx : 0;
  }, [stations, stationCode]);

  const destinationOptions = useMemo(() => {
    const nextStns = stations.slice(boardingIndex + 1);
    return nextStns.length > 0 ? nextStns : stations.slice(1);
  }, [stations, boardingIndex]);

  const [toStationCode, setToStationCode] = useState(
    // Default to no specific destination — the user opts in to a specific
    // station only if they care. Empty = "chart prepared — go check on our
    // platform" notification; non-empty = the full availability check flow.
    initialDestinationCode ?? "",
  );

  // Ensure destination is always valid downstream (skip when empty, which
  // is a valid "no specific destination" choice).
  useEffect(() => {
    if (!toStationCode) return;
    const isValid = destinationOptions.some(
      (s) => s.stationCode === toStationCode,
    );
    if (!isValid && destinationOptions.length > 0) {
      setToStationCode(
        destinationOptions[destinationOptions.length - 1]?.stationCode ||
          destinationOptions[0]?.stationCode ||
          "",
      );
    }
  }, [destinationOptions, toStationCode]);

  const [classesList, setClassesList] = useState<string[]>(
    initialAvailableClasses && initialAvailableClasses.length > 0
      ? initialAvailableClasses
      : [],
  );

  // Fetch train-specific classes if not provided at build time
  useEffect(() => {
    if (classesList.length > 0) return;
    let active = true;
    apiClient
      .get<{ availableClasses?: string[] } | string[]>(
        `/api/trains/${encodeURIComponent(trainNumber)}/classes`,
      )
      .then((res) => {
        if (!active) return;
        const raw = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.availableClasses)
            ? res.data.availableClasses
            : [];
        const normalized = [
          ...new Set(
            raw.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
          ),
        ];
        if (normalized.length > 0) {
          setClassesList(normalized);
        }
      })
      .catch(() => {
        // Degrades gracefully to fallback classes
      });
    return () => {
      active = false;
    };
  }, [trainNumber, classesList.length]);

  const activeClasses = useMemo(() => {
    const list = classesList.length > 0 ? classesList : FALLBACK_CLASSES;
    const withoutAny = list.filter((c) => c !== "ANY");
    return ["ANY", ...withoutAny];
  }, [classesList]);

  const [classCode, setClassCode] = useState<string>("ANY");

  useEffect(() => {
    if (activeClasses.length > 0 && !activeClasses.includes(classCode)) {
      setClassCode("ANY");
    }
  }, [activeClasses, classCode]);

  const [journeyDate, setJourneyDate] = useState(initialJourneyDate || "");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const { isPaidVariant, variant } = useChartAlertPricingExperiment();
  const [showPaidStep, setShowPaidStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Default journey date to next day (tomorrow) unless provided
  useEffect(() => {
    if (!initialJourneyDate) {
      setJourneyDate(ymdPlusDays(1));
    }
  }, [initialJourneyDate]);

  const boardingOptions = useMemo(() => {
    return stations.length > 1 ? stations.slice(0, -1) : stations;
  }, [stations]);

  const subscribe = async () => {
    const em = email.trim();
    const mob = mobile.trim();
    if (!em && !mob) {
      setError("Please enter an email or mobile number so we can reach you.");
      return;
    }
    if (em && !isValidEmail(em)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (mob && !isValidIndianMobile(mob)) {
      setError(
        "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).",
      );
      return;
    }
    if (!journeyDate.trim()) {
      setError("Please pick a journey date.");
      return;
    }
    if (!stationCode) {
      setError("Please select a boarding station.");
      return;
    }

    if (isPaidVariant && !showPaidStep) {
      setError(null);
      setShowPaidStep(true);
      trackAnalyticsEvent({
        name: "chart_alert_paid_step_shown",
        properties: {
          train_number: trainNumber.trim(),
          from_code: stationCode.trim().toUpperCase(),
          to_code: toStationCode.trim().toUpperCase(),
          journey_date: journeyDate.trim().slice(0, 10),
          class_code: classCode.trim().toUpperCase(),
          price: 5,
          has_email: Boolean(em),
          has_mobile: Boolean(mob),
        },
      });
      return;
    }

    if (isPaidVariant && showPaidStep) {
      trackAnalyticsEvent({
        name: "chart_alert_paid_cta_clicked",
        properties: {
          train_number: trainNumber.trim(),
          from_code: stationCode.trim().toUpperCase(),
          to_code: toStationCode.trim().toUpperCase(),
          journey_date: journeyDate.trim().slice(0, 10),
          class_code: classCode.trim().toUpperCase(),
          price: 5,
          has_email: Boolean(em),
          has_mobile: Boolean(mob),
        },
      });
    }

    // toStationCode is optional — empty means the user just wants a
    // "chart prepared" ping with a shortlink to the search page.
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: stationCode.trim().toUpperCase(),
        toStationCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: classCode.trim().toUpperCase(),
        stationCodesToMonitor: [stationCode.trim().toUpperCase()],
        email: em || undefined,
        mobile: mob || undefined,
      });
      setSuccess(true);
      trackAlertRequested({
        success: true,
        source: "chart_times_cta",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: stationCode.trim().toUpperCase(),
        toCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: classCode.trim().toUpperCase(),
        email: em || undefined,
        mobile: mob || undefined,
      });
    } catch (err: unknown) {
      const e = err as {
        response?: {
          data?: { message?: string; errors?: Array<{ message?: string }> };
        };
      };
      const msg =
        e?.response?.data?.errors?.[0]?.message ||
        e?.response?.data?.message ||
        "Couldn't set up the alert. Please check your inputs and try again.";
      const errMsg = typeof msg === "string" ? msg : JSON.stringify(msg);
      setError(errMsg);
      trackAlertRequested({
        success: false,
        source: "chart_times_cta",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: stationCode.trim().toUpperCase(),
        toCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: classCode.trim().toUpperCase(),
        email: em || undefined,
        mobile: mob || undefined,
        error: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">
          Alert set! We&apos;ll notify you the moment the chart for {trainName}{" "}
          ({trainNumber}) is prepared at {stationCode} on{" "}
          {journeyDate.slice(0, 10)}{" "}
          {toStationCode
            ? `for travel to ${toStationCode} ${
                classCode === "ANY"
                  ? "in any available class"
                  : `in ${classCode}`
              } and send you available tickets.`
            : "and text you a link to check available tickets on LastBerth."}
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
            this train. Leave the destination empty to get a short-link to check
            tickets on our platform, or pick a destination to receive available
            tickets between your stations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            setShowPaidStep(false);
            trackAnalyticsEvent({
              name: "chart_alert_opened",
              properties: {
                source: "page",
                train_number: trainNumber,
                station_code: stationCode,
                to_code: toStationCode,
                variant,
              },
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
        your boarding station. Leave the destination empty to just get a
        short-link to check tickets on our platform, or pick a destination to
        also receive available tickets between the stations.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Boarding station
          </span>
          <select
            value={stationCode}
            onChange={(e) => setStationCode(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            {boardingOptions.map((s) => (
              <option key={s.stationCode} value={s.stationCode}>
                {s.stationName} ({s.stationCode})
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Destination station
          </span>
          <select
            value={toStationCode}
            onChange={(e) => setToStationCode(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            <option value="">Select Destination</option>
            {destinationOptions.map((s) => (
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
            {activeClasses.map((c) => (
              <option key={c} value={c}>
                {CLASS_LABELS[c] || `${c} Class`}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Journey date
          </span>
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
          placeholder="Mobile (for WhatsApp)"
          autoComplete="tel"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
        />
      </div>

      {showPaidStep && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-900 font-extrabold text-xs mt-0.5">
              ₹
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900 text-xs tracking-tight">
                  Activate this Alert for:{" "}
                  <span className="text-amber-950 font-extrabold text-sm">
                    ₹5
                  </span>
                </p>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  100% Refundable
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-700">
                <strong>Money-Back Guarantee:</strong> If confirmed tickets or
                vacant seats are not found when chart is prepared, your{" "}
                <strong>₹5 will be refunded back to you</strong> automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col items-start gap-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={subscribe}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              "Setting up…"
            ) : showPaidStep ? (
              <>
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Pay ₹5 &amp; Subscribe to Alert
              </>
            ) : (
              "Set alert"
            )}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
        {showPaidStep && (
          <p className="mt-1 text-center text-[10px] font-medium text-slate-500">
            Instant setup · Zero-risk money back guarantee
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
