"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
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
  type ChartAlertPaymentLink,
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

type StationOption = {
  stationCode: string;
  stationName: string;
  /** Day count of this station (1 = origin) — boarding = train-start + day - 1. */
  day?: number | null;
  /** Pinned chart times from the page row — scheduled + written to DB. */
  chartTimeLocal?: string | null;
  chartOneDayOffset?: number | null;
  chartTwoTimeLocal?: string | null;
  chartTwoDayOffset?: number | null;
};

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

/** Pinned chart-time args for the subscription, omitting absent values. */
function pinnedChartArgs(s: StationOption | undefined): {
  chartTimeLocal?: string;
  chartOneDayOffset?: number;
  chartTwoTimeLocal?: string;
  chartTwoDayOffset?: number;
} {
  if (!s?.chartTimeLocal?.trim()) return {};
  const out: {
    chartTimeLocal?: string;
    chartOneDayOffset?: number;
    chartTwoTimeLocal?: string;
    chartTwoDayOffset?: number;
  } = { chartTimeLocal: s.chartTimeLocal.trim() };
  if (s.chartOneDayOffset !== null && s.chartOneDayOffset !== undefined) {
    out.chartOneDayOffset = s.chartOneDayOffset;
  }
  if (s.chartTwoTimeLocal?.trim()) {
    out.chartTwoTimeLocal = s.chartTwoTimeLocal.trim();
  }
  if (s.chartTwoDayOffset !== null && s.chartTwoDayOffset !== undefined) {
    out.chartTwoDayOffset = s.chartTwoDayOffset;
  }
  return out;
}

/**
 * Subscribe to a chart-preparation alert for this train. Subscribing is paid:
 * this creates a Muzobox payment link and redirects there; after payment
 * Muzobox sends the customer back to /chart-alert/payment-complete, where the
 * backend verifies payment server-to-server and queues the journey monitoring.
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
  /** Train-start date (`?date=`, Day-1 origin departure) for this table run. */
  initialJourneyDate?: string | null;
  initialStationCode?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [stationCode, setStationCode] = useState(
    initialStationCode || stations[0]?.stationCode || "",
  );

  const trainStartFromUrl = useMemo(() => {
    const v = (initialJourneyDate ?? "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  }, [initialJourneyDate]);

  const boardingDay = useMemo(() => {
    const s = stations.find((x) => x.stationCode === stationCode);
    return Math.max(1, Math.trunc(Number(s?.day) || 1));
  }, [stations, stationCode]);

  // Boarding date for the run in the URL at the *initial* station — used once
  // to seed the input. Later station changes go through `handleStationChange`
  // (which preserves the currently selected run, including manual date edits).
  const initialBoardingYmd = useMemo(() => {
    if (!trainStartFromUrl) return "";
    const initCode = initialStationCode || stations[0]?.stationCode || "";
    const initStation = stations.find((x) => x.stationCode === initCode);
    const initDay = Math.max(1, Math.trunc(Number(initStation?.day) || 1));
    return boardingYmdForStation(trainStartFromUrl, initDay) ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainStartFromUrl]);

  // Downstream destination options based on the chosen boarding station
  const boardingIndex = useMemo(() => {
    const idx = stations.findIndex((s) => s.stationCode === stationCode);
    return idx >= 0 ? idx : 0;
  }, [stations, stationCode]);

  const destinationOptions = useMemo(() => {
    const nextStns = stations.slice(boardingIndex + 1);
    return nextStns.length > 0 ? nextStns : stations.slice(1);
  }, [stations, boardingIndex]);

  // Destination is mandatory — default to the last station on the route
  // (the full end-to-end journey) until the user picks one.
  const [toStationCode, setToStationCode] = useState(
    initialDestinationCode ?? "",
  );

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
  const alertPrice = chartAlertPriceForClass(classCode);

  useEffect(() => {
    if (activeClasses.length > 0 && !activeClasses.includes(classCode)) {
      setClassCode("ANY");
    }
  }, [activeClasses, classCode]);

  // `journeyDate` state is the BOARDING date at the selected station (the day
  // the traveller boards), while `?date=` is the train-start date for the run.
  const [journeyDate, setJourneyDate] = useState(initialBoardingYmd || "");
  const { email, setEmail, mobile, setMobile, persistContact } =
    useContactFields();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminFree, setAdminFree] = useState(false);
  useEffect(() => {
    setAdminFree(isAdminUser());
  }, []);
  const [subscribedJourney, setSubscribedJourney] =
    useState<ChartAlertPaymentModalJourney | null>(null);
  const [payment, setPayment] = useState<{
    link: ChartAlertPaymentLink;
    ref: string;
    journey: ChartAlertPaymentModalJourney;
  } | null>(null);

  // Default boarding date to tomorrow unless the page supplied a train-start
  // date (converted to boarding for the initial station above). Runs only on
  // URL changes — station switches preserve the run via `handleStationChange`.
  useEffect(() => {
    if (!trainStartFromUrl) {
      setJourneyDate(ymdPlusDays(1));
    } else if (initialBoardingYmd) {
      setJourneyDate(initialBoardingYmd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainStartFromUrl]);

  /** Keep the same physical run when the boarding station changes. */
  const handleStationChange = (nextCode: string) => {
    const prev = stations.find((x) => x.stationCode === stationCode);
    const next = stations.find((x) => x.stationCode === nextCode);
    const prevDay = Math.max(1, Math.trunc(Number(prev?.day) || 1));
    const nextDay = Math.max(1, Math.trunc(Number(next?.day) || 1));
    setStationCode(nextCode);
    const cur = journeyDate.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cur) && nextDay !== prevDay) {
      const shifted = addYmdDays(cur, nextDay - prevDay);
      if (shifted) setJourneyDate(shifted);
    }
  };

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
    if (!toStationCode.trim()) {
      setError("Please select a destination station.");
      return;
    }

    // Admins (localStorage admin flag) skip the payment popup and create
    // the alert directly; everyone else pays via the in-page iframe modal.
    // `journeyDate` state is the boarding date; derive the run's train-start.
    setLoading(true);
    setError(null);
    try {
      persistContact();
      const boardingYmd = journeyDate.trim().slice(0, 10);
      const resolvedTrainStart =
        addYmdDays(boardingYmd, -(boardingDay - 1)) || undefined;
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
          ...pinnedChartArgs(
            stations.find((s) => s.stationCode === stationCode),
          ),
        });
        setSubscribedJourney(journey);
        trackAlertRequested({
          success: true,
          source: "chart_times_cta",
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
          ...pinnedChartArgs(
            stations.find((s) => s.stationCode === stationCode),
          ),
        },
        "page",
      );
      setPayment({ link, ref: link.ref, journey });
    } catch (err: unknown) {
      const errMsg = getChartAlertErrorMessage(
        err,
        "Couldn't set up the alert. Please check your inputs and try again.",
      );
      setError(errMsg);
      trackAnalyticsEvent({
        name: "chart_alert_payment_link_failed",
        properties: {
          source: "page",
          train_number: trainNumber.trim(),
          error: errMsg.slice(0, 200),
        },
      });
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

  if (subscribedJourney) {
    return (
      <>
        <ChartAlertSuccessBox journey={subscribedJourney} />
        {payment && (
          <ChartAlertPaymentModal
            open
            onClose={() => setPayment(null)}
            payment={payment.link}
            paymentRef={payment.ref}
            journey={payment.journey}
            source="page"
            onPaid={(j) => setSubscribedJourney(j)}
          />
        )}
      </>
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
            Select your destination — when the chart is prepared, we scan
            your {stationCode} &lt;&gt; {toStationCode || "…"} route for any
            ticket that opens up and notify you instantly. Get 100% refund
            if you didn&apos;t find full journey tickets. One-time charge of ₹
            {alertPrice}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            trackAnalyticsEvent({
              name: "chart_alert_opened",
              properties: {
                source: "page",
                train_number: trainNumber,
                station_code: stationCode,
                to_code: toStationCode,
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
        Get an alert when the chart is prepared at your boarding station, we
        will alert you the time it was prepared and find you confirmed
        tickets across the journey. Get 100% refund if you didn&apos;t
        find full journey tickets.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Boarding station
          </span>
          <select
            value={stationCode}
            onChange={(e) => handleStationChange(e.target.value)}
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
            Destination station *
          </span>
          <select
            value={toStationCode}
            onChange={(e) => setToStationCode(e.target.value)}
            required
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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

      <div className="mt-4 flex flex-col items-start gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={subscribe}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? adminFree
                ? "Setting up…"
                : "Opening payment…"
              : adminFree
                ? "Set alert free (admin)"
                : `Pay ₹${alertPrice} & set alert`}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
        <ChartAlertTrustFooter />
      </div>

      {error && (
        <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
      )}
      {payment && (
        <ChartAlertPaymentModal
          open
          onClose={() => setPayment(null)}
          payment={payment.link}
          paymentRef={payment.ref}
          journey={payment.journey}
          source="page"
          onPaid={(j) => setSubscribedJourney(j)}
        />
      )}
      </div>
  );
}
