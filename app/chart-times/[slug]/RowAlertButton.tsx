"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent, trackAlertRequested } from "@/lib/analytics/track";
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

/**
 * Per-station "Get Alert" button. Opens a dialog that asks for the destination
 * station, travel class, journey date, and contact details — with the boarding
 * station pre-selected from the table row. Subscribes via the journey
 * monitoring engine so the user is notified at this station's chart-preparation time.
 */
export default function RowAlertButton({
  trainNumber,
  trainName,
  stationCode,
  stationName,
  destinationCode: initialDestinationCode,
  destinationStations,
  availableClasses: initialAvailableClasses,
  initialJourneyDate,
}: {
  trainNumber: string;
  trainName: string;
  stationCode: string;
  stationName: string;
  destinationCode?: string;
  destinationStations?: StationOption[];
  availableClasses?: string[];
  initialJourneyDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const destinationOptions = useMemo(
    () => destinationStations || [],
    [destinationStations],
  );
  const [toStationCode, setToStationCode] = useState(
    initialDestinationCode ||
      destinationOptions[destinationOptions.length - 1]?.stationCode ||
      "",
  );

  // Ensure destination is valid
  useEffect(() => {
    if (destinationOptions.length > 0) {
      const isValid = destinationOptions.some((s) => s.stationCode === toStationCode);
      if (!isValid) {
        setToStationCode(
          destinationOptions[destinationOptions.length - 1]?.stationCode ||
            destinationOptions[0]?.stationCode ||
            "",
        );
      }
    }
  }, [destinationOptions, toStationCode]);

  const [classesList, setClassesList] = useState<string[]>(
    initialAvailableClasses && initialAvailableClasses.length > 0
      ? initialAvailableClasses
      : [],
  );

  // Fetch train-specific classes if opened and not provided at build time
  useEffect(() => {
    if (!open || classesList.length > 0) return;
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
          ...new Set(raw.map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
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
  }, [open, trainNumber, classesList.length]);

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
    if (!toStationCode) {
      setError("Please select a destination station.");
      return;
    }
    setLoading(true);
    setError(null);
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
        source: "chart_times_row",
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

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess(false);
          trackAnalyticsEvent({
            name: "chart_alert_opened",
            properties: {
              source: "row",
              train_number: trainNumber,
              station_code: stationCode,
              to_code: toStationCode,
            },
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
            <div className="mb-2 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <BellRing className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Chart Alert — {stationName} ({stationCode})
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {trainNumber} · {trainName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {success ? (
              <p className="my-3 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
                Alert set! We&apos;ll notify you when the chart for {trainName} (
                {trainNumber}) is prepared at {stationName} ({stationCode}) for
                travel to {toStationCode}{" "}
                {classCode === "ANY"
                  ? "in any available class"
                  : `in ${classCode}`}{" "}
                on {journeyDate.slice(0, 10)} and send you available tickets.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-600">
                  We&apos;ll notify you on the contact below when the chart is
                  prepared at{" "}
                  <span className="font-semibold text-slate-800">
                    {stationName}
                  </span>
                  , and send you available tickets between the stations.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                  className="flex flex-col gap-3"
                >
                  {destinationOptions.length > 0 && (
                    <label className="text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">Destination station</span>
                      <select
                        value={toStationCode}
                        onChange={(e) => setToStationCode(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 font-normal"
                      >
                        {destinationOptions.map((s) => (
                          <option key={s.stationCode} value={s.stationCode}>
                            {s.stationName} ({s.stationCode})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">Class</span>
                      <select
                        value={classCode}
                        onChange={(e) => setClassCode(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 font-normal"
                      >
                        {activeClasses.map((c) => (
                          <option key={c} value={c}>
                            {CLASS_LABELS[c] || `${c} Class`}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">Journey date</span>
                      <input
                        type="date"
                        value={journeyDate.slice(0, 10)}
                        min={ymdPlusDays(0)}
                        onChange={(e) => setJourneyDate(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 font-normal"
                      />
                    </label>
                  </div>

                  <label className="text-xs font-semibold text-slate-700">
                    <span className="mb-1 block">Email address</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      autoComplete="email"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 font-normal"
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-700">
                    <span className="mb-1 block">Mobile number (WhatsApp / SMS)</span>
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="Mobile"
                      autoComplete="tel"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 font-normal"
                    />
                  </label>

                  {error && (
                    <p className="rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
