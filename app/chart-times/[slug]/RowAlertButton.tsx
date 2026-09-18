"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import {
  trackAnalyticsEvent,
  trackAlertRequested,
} from "@/lib/analytics/track";
import { isValidIndianMobile, isValidEmail } from "@/lib/validation";
import { useContactFields } from "@/lib/contact";
import { isAdminUser } from "@/lib/admin";
import { addYmdDays, boardingYmdForStation } from "@/lib/chartTimeDisplay";
import {
  chartAlertPriceForClass,
  createFreeChartAlert,
  getChartAlertErrorMessage,
  startChartAlertPayment,
} from "@/lib/chart-alert-payments";
import {
  ChartAlertPaymentModal,
  type ChartAlertPaymentModalJourney,
} from "@/components/payments/ChartAlertPaymentModal";
import { ChartAlertSuccessBox } from "@/components/payments/ChartAlertSuccessBox";
import { ChartAlertTrustFooter } from "@/components/payments/ChartAlertTrustFooter";

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
  destinationStations,
  availableClasses: initialAvailableClasses,
  initialJourneyDate,
  stationDay,
  trainStartDate,
  chartTimeLocal,
  chartOneDayOffset,
  chartTwoTimeLocal,
  chartTwoDayOffset,
}: {
  trainNumber: string;
  trainName: string;
  stationCode: string;
  stationName: string;
  destinationStations?: StationOption[];
  availableClasses?: string[];
  /** Train-start date (`?date=`, Day-1 origin departure) for this table run. */
  initialJourneyDate?: string | null;
  /** Day count of this boarding station (1 = origin) — boarding = start + day - 1. */
  stationDay?: number | null;
  /** Explicit train-start date; defaults to `initialJourneyDate`. */
  trainStartDate?: string | null;
  /** Pinned chart times from the table row — scheduled + written to DB. */
  chartTimeLocal?: string | null;
  chartOneDayOffset?: number | null;
  chartTwoTimeLocal?: string | null;
  chartTwoDayOffset?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const destinationOptions = useMemo(
    () => destinationStations || [],
    [destinationStations],
  );
  // Destination is mandatory — default to the last station on the route
  // (the full end-to-end journey) until the user picks one.
  const [toStationCode, setToStationCode] = useState("");

  // Default empty to the last downstream station; correct stale values.
  useEffect(() => {
    if (destinationOptions.length === 0) return;
    const isValid =
      toStationCode &&
      destinationOptions.some((s) => s.stationCode === toStationCode);
    if (!isValid) {
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
  }, [open, trainNumber, classesList.length]);

  const activeClasses = useMemo(() => {
    const list = classesList.length > 0 ? classesList : FALLBACK_CLASSES;
    const withoutAny = list.filter((c) => c !== "ANY");
    return ["ANY", ...withoutAny];
  }, [classesList]);

  const [classCode, setClassCode] = useState<string>("ANY");
  const alertPrice = chartAlertPriceForClass(classCode);

  useEffect(() => {
    if (activeClasses.length > 0 && !activeClasses.includes(classCode)) {
      setClassCode("ANY");
    }
  }, [activeClasses, classCode]);

  const trainStartYmd = useMemo(() => {
    const v = (trainStartDate ?? initialJourneyDate ?? "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  }, [trainStartDate, initialJourneyDate]);

  const initialBoardingYmd = useMemo(() => {
    if (!trainStartYmd) return "";
    return boardingYmdForStation(trainStartYmd, stationDay) ?? trainStartYmd;
  }, [trainStartYmd, stationDay]);

  const [journeyDate, setJourneyDate] = useState(initialBoardingYmd || "");
  const { email, setEmail, mobile, setMobile, persistContact } =
    useContactFields();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribedJourney, setSubscribedJourney] =
    useState<ChartAlertPaymentModalJourney | null>(null);
  const [adminFree, setAdminFree] = useState(false);
  useEffect(() => {
    setAdminFree(isAdminUser());
  }, []);
  const [payment, setPayment] = useState<{
    payUrl: string;
    ref: string;
    journey: ChartAlertPaymentModalJourney;
  } | null>(null);

  // Default the boarding date: same run's boarding day when the page supplied
  // a train-start date, else tomorrow. `journeyDate` is the boarding date.
  useEffect(() => {
    if (initialBoardingYmd) setJourneyDate(initialBoardingYmd);
    else if (!trainStartYmd) setJourneyDate(ymdPlusDays(1));
  }, [initialBoardingYmd, trainStartYmd]);

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

    // Admins (localStorage admin flag) skip the payment popup and create
    // the alert directly; everyone else pays via the in-page iframe modal.
    // `journeyDate` state is the boarding date; `trainStartDate` pins the run.
    setLoading(true);
    setError(null);
    try {
      persistContact();
      const boardingYmd = journeyDate.trim().slice(0, 10);
      const day = Math.max(1, Math.trunc(Number(stationDay) || 1));
      const resolvedTrainStart =
        trainStartYmd || addYmdDays(boardingYmd, -(day - 1)) || undefined;
      const journey: ChartAlertPaymentModalJourney = {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: stationCode.trim().toUpperCase(),
        toStationCode: toStationCode.trim().toUpperCase(),
        journeyDate: boardingYmd,
        classCode: classCode.trim().toUpperCase(),
      };
      if (adminFree) {
        await createFreeChartAlert({
          ...journey,
          trainStartDate: resolvedTrainStart,
          stationCodesToMonitor: [stationCode.trim().toUpperCase()],
          email: em || undefined,
          mobile: mob || undefined,
          chartTimeLocal: chartTimeLocal?.trim() || undefined,
          chartOneDayOffset:
            chartOneDayOffset === null || chartOneDayOffset === undefined
              ? undefined
              : chartOneDayOffset,
          chartTwoTimeLocal: chartTwoTimeLocal?.trim() || undefined,
          chartTwoDayOffset:
            chartTwoDayOffset === null || chartTwoDayOffset === undefined
              ? undefined
              : chartTwoDayOffset,
        });
        setOpen(false);
        setSubscribedJourney(journey);
        trackAlertRequested({
          success: true,
          source: "chart_times_row",
          trainNumber: journey.trainNumber,
          trainName: journey.trainName,
          fromCode: journey.fromStationCode,
          toCode: journey.toStationCode,
          journeyDate: journey.journeyDate,
          classCode: journey.classCode,
          email: em || undefined,
          mobile: mob || undefined,
        });
        return;
      }
      const link = await startChartAlertPayment(
        {
          ...journey,
          trainStartDate: resolvedTrainStart,
          stationCodesToMonitor: [stationCode.trim().toUpperCase()],
          email: em || undefined,
          mobile: mob || undefined,
          chartTimeLocal: chartTimeLocal?.trim() || undefined,
          chartOneDayOffset:
            chartOneDayOffset === null || chartOneDayOffset === undefined
              ? undefined
              : chartOneDayOffset,
          chartTwoTimeLocal: chartTwoTimeLocal?.trim() || undefined,
          chartTwoDayOffset:
            chartTwoDayOffset === null || chartTwoDayOffset === undefined
              ? undefined
              : chartTwoDayOffset,
        },
        "row",
      );
      setOpen(false);
      setPayment({ payUrl: link.payUrl, ref: link.ref, journey });
    } catch (err: unknown) {
      const errMsg = getChartAlertErrorMessage(
        err,
        "Couldn't set up the alert. Please try again.",
      );
      setError(errMsg);
      trackAnalyticsEvent({
        name: "chart_alert_payment_link_failed",
        properties: {
          source: "row",
          train_number: trainNumber.trim(),
          error: errMsg.slice(0, 200),
        },
      });
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
      {subscribedJourney ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Alert set
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
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
      )}

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

            <p className="mb-3 text-xs text-slate-600">
              Select your destination — when the chart is prepared at{" "}
              <span className="font-semibold text-slate-800">
                {stationName}
              </span>
              , we scan your full {stationCode} &lt;&gt;{" "}
              {toStationCode || "…"} route for any ticket that opens up and
              notify you instantly. If no ticket is available, you get a 100%
              automated refund.
            </p>
            {subscribedJourney ? (
              <ChartAlertSuccessBox journey={subscribedJourney} compact />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                className="flex flex-col gap-3"
              >
              {destinationOptions.length > 0 && (
                <label className="text-xs font-semibold text-slate-700">
                  <span className="mb-1 block">Destination station *</span>
                  <select
                    value={toStationCode}
                    onChange={(e) => setToStationCode(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 font-normal"
                  >
                    <option value="" disabled>
                      Select destination
                    </option>
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
                <span className="mb-1 block">
                  Mobile number (WhatsApp / SMS)
                </span>
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
                <p className="rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? adminFree
                    ? "Setting up…"
                    : "Opening payment…"
                  : adminFree
                    ? "Set alert free (admin)"
                    : `Pay ₹${alertPrice} & set alert`}
              </button>
              {adminFree && (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Admin mode — no charge, the alert is created directly.
                </p>
              )}
              <ChartAlertTrustFooter />
            </form>
            )}
          </div>
        </div>
      )}
      {payment && (
        <ChartAlertPaymentModal
          open
          onClose={() => setPayment(null)}
          payUrl={payment.payUrl}
          paymentRef={payment.ref}
          journey={payment.journey}
          source="row"
          onPaid={(j) => {
            setSubscribedJourney(j);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
