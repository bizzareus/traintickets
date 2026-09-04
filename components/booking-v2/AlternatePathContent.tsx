"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent, trackAlertRequested } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";
import { buildAlternatePathDisplayItems } from "@/lib/bookingV2AlternatePathsDisplay";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";
import { EntireJourneyAlertCTA } from "@/components/booking-v2/EntireJourneyAlertCTA";
import { isValidIndianMobile, isValidEmail } from "@/lib/validation";
import { NextReleaseBottomSheet } from "./NextReleaseBottomSheet";
import type {
  AlternateClassOption,
  AlternatePathProgressEvent,
  AlternatePathsResponse,
} from "./alternatePathsTypes";
import {
  MONITOR_CONTACT_STORAGE_KEY,
  chartMomentHasPassedIst,
  collapsedAlternatePathTimingSummary,
  formatChartMomentIst,
  formatDurationMinutes,
  formatTimeAmPm,
  getStationDisplayName,
  isLegAlertSet,
  markLegAlertSet,
  parseChartDateTimeIst,
} from "./alternatePathHelpers";

const IS_TICKET_ALERT_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_TICKET_ALERT_CTA === "true";

/** Converts a raw progress event into a human-readable status line and icon. */
function describeProgressEvent(
  ev: AlternatePathProgressEvent,
  journeyFrom: string,
  journeyTo: string,
): {
  icon: string;
  text: string;
  kind: "neutral" | "success" | "warn" | "done";
} {
  switch (ev.type) {
    case "schedule_ok":
      return {
        icon: "🗺️",
        text: `Route map loaded${ev.trainName ? ` for ${ev.trainName}` : ""} — ${ev.stopCount} stations`,
        kind: "neutral",
      };
    case "schedule_fail":
      return {
        icon: "⚠️",
        text: "Could not load train schedule",
        kind: "warn",
      };
    case "route_ok":
      return {
        icon: "📍",
        text: `Scanning ${ev.stopCount} stops between ${ev.from} and ${ev.to}`,
        kind: "neutral",
      };
    case "route_fail":
      return {
        icon: "⚠️",
        text: `${ev.from} → ${ev.to} not found on this train's route`,
        kind: "warn",
      };
    case "hop_confirmed":
      return {
        icon: "✅",
        text: `Found ${ev.travelClass} ticket${ev.fare != null ? ` (₹${ev.fare})` : ""} — ${ev.from} → ${ev.to}`,
        kind: "success",
      };
    case "hop_unavailable":
      return {
        icon: "🔍",
        text: `Exploring options from ${ev.from} → ${ev.to}…`,
        kind: "neutral",
      };
    case "done":
      if (ev.isComplete) {
        return {
          icon: "🎉",
          text: `Full journey covered in ${ev.legCount} segment${ev.legCount !== 1 ? "s" : ""}${ev.totalFare != null ? ` — ₹${ev.totalFare} total` : ""}`,
          kind: "done",
        };
      }
      return {
        icon: ev.legCount > 0 ? "🔶" : "😔",
        text:
          ev.legCount > 0
            ? `Found ${ev.legCount} confirmed segment${ev.legCount !== 1 ? "s" : ""}. Checking remaining ${journeyFrom} → ${journeyTo} stretch…`
            : `No confirmed tickets found for ${journeyFrom} → ${journeyTo}`,
        kind: ev.legCount > 0 ? "warn" : "warn",
      };
  }
}

function AlternatePathProgressFeed({
  events,
  from,
  to,
}: {
  events: AlternatePathProgressEvent[];
  from: string;
  to: string;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const hasDone = events.some((e) => e.type === "done");
    if (hasDone) {
      setProgress(100);
      return;
    }

    let p = 0;
    for (const ev of events) {
      if (ev.type === "schedule_ok") p += 15;
      else if (ev.type === "route_ok") p += 15;
      else if (ev.type === "hop_unavailable" || ev.type === "hop_confirmed") {
        p += (94 - p) * 0.25;
      }
    }
    // Cap at 99% until done
    setProgress(Math.min(99, Math.floor(p)));
  }, [events]);
  const displayEvents = useMemo(() => {
    // Show only a single, high-level status line while loading. The +/-3-station
    // offset retries re-emit per-hop ("found route") events on every attempt, so
    // accumulating them made the same routes appear many times in the UI. Surface
    // just the latest route-level step here; the final set of tickets is rendered
    // from the result once the search completes.
    const HIDE = new Set([
      "schedule_ok",
      "done",
      "hop_confirmed",
      "hop_unavailable",
    ]);
    const visible = events.filter((ev) => !HIDE.has(ev.type));
    const last = visible[visible.length - 1];
    return last ? [last] : [];
  }, [events]);

  return (
    <div
      className="py-4"
      role="status"
      aria-live="polite"
      aria-label="Search progress"
    >
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 ${progress === 100 ? "border-t-emerald-500 opacity-0 transition-opacity" : ""}`}
              aria-hidden
            />
            <p className="text-sm font-semibold text-gray-700">
              {progress === 100
                ? "Search complete!"
                : "Searching for the best seats…"}
            </p>
          </div>
          <span className="text-xs font-bold text-gray-500 tabular-nums">
            {progress}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${progress === 100 ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      {displayEvents.length > 0 && (
        <ol className="space-y-1.5 pl-1" aria-label="Steps completed">
          {displayEvents.map((ev, i) => {
            const { icon, text, kind } = describeProgressEvent(ev, from, to);
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                  kind === "success" && "bg-emerald-50 text-emerald-900",
                  kind === "warn" && "bg-amber-50 text-amber-900",
                  kind === "done" && "bg-blue-50 text-blue-900 font-semibold",
                  kind === "neutral" && "text-gray-600",
                )}
              >
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-base leading-none"
                >
                  {icon}
                </span>
                <span>{text}</span>
              </li>
            );
          })}
        </ol>
      )}
      {displayEvents.length === 0 && (
        <p className="text-xs text-gray-400">Contacting rail systems…</p>
      )}
      <span className="sr-only">Finding best available seats, please wait</span>
    </div>
  );
}



function CompactLegChartCta({
  trainNumber,
  trainName,
  journeyDate,
  legFrom,
  legTo,
  classCode,
  stationNameMap,
  trainStartDate,
}: {
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  legFrom: string;
  legTo: string;
  classCode: string;
  stationNameMap?: Record<string, string>;
  trainStartDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [alreadySet, setAlreadySet] = useState(false);
  const [chartTimeLabel, setChartTimeLabel] = useState<string | null>(null);
  const [chartTimeLoading, setChartTimeLoading] = useState(false);
  const [chartIsPrepared, setChartIsPrepared] = useState<boolean | null>(null);
  const [activeChartSource, setActiveChartSource] = useState<
    "one" | "two" | null
  >(null);
  const [meta, setMeta] = useState<StationChartMetaItem | null>(null);
  const [showNextReleaseSheet, setShowNextReleaseSheet] = useState(false);

  // Prevents duplicate calls for the same station on remounts or rapid state transitions
  const lastFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLegAlertSet(trainNumber, legFrom, legTo, journeyDate)) {
      setAlreadySet(true);
      setDone(true);
    }
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(MONITOR_CONTACT_STORAGE_KEY)
          : null;
      if (raw) {
        const o = JSON.parse(raw) as { email?: string; mobile?: string };
        if (o.email) setEmail(o.email);
        if (o.mobile) setMobile(o.mobile);
      }
    } catch {
      /* ignore */
    }
  }, [trainNumber, legFrom, legTo, journeyDate]);

  // Fetch chart preparation time
  useEffect(() => {
    let cancel = false;
    setChartTimeLoading(true);

    apiClient
      .post<{ stations: StationChartMetaItem[] }>(
        "/api/train-composition/stations-meta",
        {
          trainNumber: trainNumber.trim(),
          journeyDate: journeyDate.trim(),
          sourceStation: legFrom.trim().toUpperCase(),
          refreshFromIrctc: false,
        },
        { timeout: 120_000 },
      )
      .then((r) => {
        if (cancel) return;
        const mObj = r.data?.stations?.[0];
        setMeta(mObj ?? null);
        const c1Time = mObj?.chartOneTime?.trim();
        const c1Offset = mObj?.chartOneDayOffset ?? 0;
        const c2Time = mObj?.chartTwoTime?.trim();
        const c2Offset =
          mObj?.chartTwoDayOffset !== null &&
          mObj?.chartTwoDayOffset !== undefined
            ? mObj.chartTwoDayOffset
            : mObj?.chartTwoIsNextDay
              ? 1
              : 0;

        if (journeyDate) {
          const ymd = (trainStartDate || journeyDate).trim().slice(0, 10);
          let targetM: moment.Moment | null = null;
          let isPrep = false;

          if (c1Time) {
            const m1 = parseChartDateTimeIst(ymd, c1Time, c1Offset);
            if (m1) {
              const isPrep1 = chartMomentHasPassedIst(m1);
              let m2: moment.Moment | null = null;
              let isPrep2 = false;

              if (c2Time) {
                m2 = parseChartDateTimeIst(ymd, c2Time, c2Offset);
                if (m2) {
                  isPrep2 = chartMomentHasPassedIst(m2);
                }
              }

              if (isPrep1 && m2 && isPrep2) {
                targetM = m2;
                isPrep = true;
                setActiveChartSource("two");
              } else if (isPrep1) {
                targetM = m1;
                isPrep = true;
                setActiveChartSource("one");
              } else {
                targetM = m1;
                isPrep = false;
                setActiveChartSource("one");
              }
            }
          }

          if (targetM) {
            setChartTimeLabel(formatChartMomentIst(targetM));
            setChartIsPrepared(isPrep);
          }
        }
      })
      .catch(() => {
        if (cancel) return;
        trackAnalyticsEvent({
          name: "chart_time_load_failed_booking_popup",
          properties: { trainNumber, legFrom, journeyDate },
        });
      })
      .finally(() => {
        if (!cancel) {
          setChartTimeLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, [trainNumber, journeyDate, legFrom, trainStartDate]);

  const subscribe = useCallback(async () => {
    const em = email.trim() || undefined;
    const mob = mobile.trim() || undefined;
    if (!em && !mob) {
      setError("Enter an email or mobile number.");
      return;
    }
    if (em && !isValidEmail(em)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (mob && !isValidIndianMobile(mob)) {
      setError("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: legFrom.trim().toUpperCase(),
        toStationCode: legTo.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: classCode.trim().toUpperCase(),
        email: em,
        mobile: mob,
        trainStartDate: trainStartDate,
      });
      markLegAlertSet(trainNumber, legFrom, legTo, journeyDate);
      setDone(true);
      setAlreadySet(true);
      trackAlertRequested({
        success: true,
        source: "gap_leg_modal",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: legFrom.trim().toUpperCase(),
        toCode: legTo.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: classCode.trim().toUpperCase(),
        email: em || undefined,
        mobile: mob || undefined,
      });
      try {
        window.localStorage.setItem(
          MONITOR_CONTACT_STORAGE_KEY,
          JSON.stringify({ email: em ?? "", mobile: mob ?? "" }),
        );
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      const msg =
        e?.response?.data?.message || e?.message || "Failed to set alert.";
      setError(msg);
      trackAlertRequested({
        success: false,
        source: "gap_leg_modal",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: legFrom.trim().toUpperCase(),
        toCode: legTo.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: classCode.trim().toUpperCase(),
        email: em || undefined,
        mobile: mob || undefined,
        error: typeof msg === "string" ? msg : JSON.stringify(msg),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    email,
    mobile,
    trainNumber,
    trainName,
    legFrom,
    legTo,
    journeyDate,
    classCode,
    trainStartDate,
  ]);

  if (done || alreadySet) {
    return (
      <div className="flex flex-col items-end gap-1">
        {chartTimeLabel && (
          <p className="text-[14px] font-bold text-emerald-700/90">
            Will notify at {chartTimeLabel}
          </p>
        )}
        <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          ✓ Alert set
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        {chartTimeLoading ? (
          <div className="flex items-center gap-1.5 text-[11px] font-bold italic text-blue-500 animate-pulse">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            Loading chart time...
          </div>
        ) : chartTimeLabel ? (
          <div className="flex flex-col items-end">
            <p
              className={cn(
                "text-[14px] font-bold",
                chartIsPrepared ? "text-red-600" : "text-indigo-600",
              )}
            >
              {chartIsPrepared ? (
                <>Chart for {legFrom} was released at</>
              ) : (
                "New tickets open at"
              )}{" "}
              {chartTimeLabel}
            </p>
            {chartIsPrepared &&
              activeChartSource === "one" &&
              meta?.chartNextRemoteStation && (
                <button
                  type="button"
                  onClick={() => setShowNextReleaseSheet(true)}
                  className="mt-0.5 text-[11px] font-bold text-blue-600 hover:underline"
                >
                  Check next release →
                </button>
              )}
          </div>
        ) : null}
        {showNextReleaseSheet && meta?.chartNextRemoteStation && (
          <NextReleaseBottomSheet
            trainNumber={trainNumber}
            journeyDate={journeyDate}
            stationCode={meta.chartNextRemoteStation}
            onClose={() => setShowNextReleaseSheet(false)}
          />
        )}
        {!chartIsPrepared && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
          >
            Get Ticket Alert
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 w-full rounded-md border border-blue-200 bg-blue-50 p-2.5">
      <p className="mb-1.5 text-xs font-semibold text-blue-900">
        {chartTimeLoading ? (
          <span className="inline-flex items-center gap-1.5 italic text-blue-600/80">
            <span className="h-2 w-2 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Loading chart time...
          </span>
        ) : chartTimeLabel ? (
          `Get notified when new seats open at ${chartTimeLabel} on ${getStationDisplayName(legFrom, stationNameMap)} → ${getStationDisplayName(legTo, stationNameMap)} route`
        ) : (
          `Get notified when new seats open on ${getStationDisplayName(legFrom, stationNameMap)} → ${getStationDisplayName(legTo, stationNameMap)} route`
        )}
      </p>
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <input
          type="email"
          className="w-full rounded border border-blue-200 bg-emerald-50 px-2 py-1 text-xs placeholder:text-gray-400"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="tel"
          className="w-full rounded border border-blue-200 bg-emerald-50 px-2 py-1 text-xs placeholder:text-gray-400"
          placeholder="Mobile (optional)"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void subscribe()}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Setting up…" : "Set alert"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
        {chartTimeLabel && (
          <span className="text-[10px] italic text-blue-700/80">
            Triggers at {chartTimeLabel}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}

export interface AlternatePathContentProps {
  // Alt-path state (from useAlternatePaths)
  altForTrain: string | null;
  altTrainName: string | null;
  altAvlClasses: string[] | undefined;
  altLoading: boolean;
  altResult: AlternatePathsResponse | null;
  altError: string | null;
  altProgress: AlternatePathProgressEvent[];

  // Display inputs
  journeyDate: string | null;
  /** Journey origin code (user's search "from" / PNR boarding station). */
  fromCode?: string;
  /** Journey destination code (user's search "to" / PNR reservation-upto). */
  toCode?: string;

  // EntireJourneyAlertCTA inputs (fallbacks for PNR-derived values)
  ctaTrainNumber?: string;
  ctaTrainName?: string;
  ctaTrainStartDate?: string;
  ctaJourneyDate?: string;
  ctaClassCode?: string;
  originChartTime: string;

  // Admin + share
  isAdminUser: boolean;
  shareBusy?: boolean;
  onShare?: () => void;
  /** Ref attached to the scrollable capture container for screenshot sharing. */
  captureRef?: React.Ref<HTMLDivElement>;

  /** Closes/clears the displayed result. */
  onClose: () => void;
  /** Opens the train-schedule modal highlighting a leg span. */
  onOpenSchedule: (trainNumber: string, from: string, to: string) => void;

  /** Direct waitlist fares to compare against, sorted highest-first. */
  directFares?: { cls: string; fare: number }[];

  /** When true, disables the "There are no full seats available in this journey" banner (e.g. for Train Search V2). */
  hideSearchAllTrainsBanner?: boolean;
}

/**
 * The alternate-paths result body (progress feed, fare summary, alert CTA, and
 * the journey-legs list). Shared by the homepage Route/PNR tabs and the
 * standalone `/pnr-status` page via `SearchPnrPanel`.
 */
export function AlternatePathContent({
  altForTrain,
  altTrainName,
  altAvlClasses,
  altLoading,
  altResult,
  altError,
  altProgress,
  journeyDate,
  fromCode,
  toCode,
  ctaTrainNumber,
  ctaTrainName,
  ctaTrainStartDate,
  ctaJourneyDate,
  ctaClassCode,
  originChartTime,
  isAdminUser,
  shareBusy,
  onShare,
  captureRef,
  onClose,
  onOpenSchedule,
  directFares = [],
  hideSearchAllTrainsBanner = false,
}: AlternatePathContentProps) {
  /** Flat list of display items: each is a single leg card or a collapsed "no tickets" span. */
  const alternatePathDisplayItems = useMemo(
    () =>
      altResult?.legs.length
        ? buildAlternatePathDisplayItems(altResult.legs)
        : [],
    [altResult],
  );

  // One-click "search all other trains" for the same route/date — shown once the
  // search is done and this train can't fully confirm the journey (no complete
  // path, or an error). Navigates to the homepage route search (which auto-runs
  // from the from/to/date query params), so it works from the Route tab, the PNR
  // tab, and the standalone /pnr-status page alike.
  const searchAllTrainsHref =
    fromCode && toCode
      ? `/?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}${
          journeyDate
            ? `&date=${encodeURIComponent(journeyDate.slice(0, 10))}`
            : ""
        }`
      : null;
  const showSearchAllTrains =
    !hideSearchAllTrainsBanner &&
    !altLoading &&
    Boolean(searchAllTrainsHref) &&
    (Boolean(altError) || (Boolean(altResult) && !altResult?.isComplete));

  return (
    <div ref={captureRef} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold leading-snug text-gray-900">
          {altLoading
            ? `Finding best seats on ${altTrainName?.trim() || "Train"} ${altForTrain ? `(${altForTrain})` : ""}${journeyDate ? ` on ${moment(journeyDate, "YYYY-MM-DD").format("D MMM YYYY")}` : ""}`
            : `Best seats on ${altTrainName?.trim() || "Train"} ${altForTrain ? `(${altForTrain})` : ""}${journeyDate ? ` on ${moment(journeyDate, "YYYY-MM-DD").format("D MMM YYYY")}` : ""}`}
        </h3>
        <div
          className="flex shrink-0 items-center gap-1"
          data-screenshot-exclude=""
        >
          {isAdminUser && onShare && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 md:hidden"
              aria-label="Share journey as image (opens share sheet — choose WhatsApp)"
              disabled={shareBusy}
              onClick={() => onShare()}
            >
              {shareBusy ? "Sharing…" : "Share"}
            </button>
          )}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      {showSearchAllTrains && searchAllTrainsHref && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="text-sm font-semibold text-slate-900">
            There are no full seats available in this journey
          </span>
          <a
            href={searchAllTrainsHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            Find in other trains
            <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
      {altLoading && (
        <AlternatePathProgressFeed
          events={altProgress}
          from={fromCode ?? ""}
          to={toCode ?? ""}
        />
      )}
      {altError && <p className="text-sm text-red-700">{altError}</p>}
      {altResult && (
        <div className="space-y-3 text-sm">
          {/* Live Train Banner */}
          {(() => {
            const originTime =
              altResult.trainOriginDepartureTime && journeyDate
                ? moment(
                    `${journeyDate} ${altResult.trainOriginDepartureTime}`,
                    "YYYY-MM-DD HH:mm",
                  )
                : null;
            if (originTime?.isValid() && moment().isAfter(originTime)) {
              return (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Live Train in running status
                  </span>
                  {altResult.trainOriginCode && (
                    <span className="text-[10px] opacity-75">
                      (Started from {altResult.trainOriginCode} at{" "}
                      {altResult.trainOriginDepartureTime} IST)
                    </span>
                  )}
                </div>
              );
            }
            return null;
          })()}

          {/* Fare summary banner */}
          {altResult.isComplete &&
            altResult.totalFare != null &&
            !IS_TICKET_ALERT_ENABLED && (
              <div className="rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/70 border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Total fare
                </p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-3xl">
                    ₹{altResult.totalFare.toFixed(0)}
                  </span>

                  {directFares.length > 0 && (
                    <span className="text-xs text-slate-500 font-medium ml-1">
                      vs direct waitlist:{" "}
                      {directFares.map((df, idx) => (
                        <span key={df.cls}>
                          {df.cls} (₹{df.fare})
                          {idx < directFares.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Full journey covered in {altResult.legCount} confirmed ticket
                  {altResult.legCount === 1 ? "" : "s"}
                </p>
              </div>
            )}

          {!altResult.isComplete &&
            altResult.totalFare != null &&
            IS_TICKET_ALERT_ENABLED &&
            altResult.legs.some((l) => l.segmentKind === "confirmed") && (
              <div className="rounded-xl bg-gradient-to-r from-blue-50 to-blue-100/70 border border-blue-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Confirmed tickets fare
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-blue-950 tabular-nums sm:text-3xl">
                  ₹{altResult.totalFare.toFixed(0)}
                </p>
                <p className="mt-0.5 text-xs text-blue-800">
                  Some legs have no confirmed tickets yet — total may change
                </p>
              </div>
            )}
          {!altResult.isComplete &&
            !altResult.legs.some((l) => l.segmentKind === "check_realtime") && (
              <p className="rounded-md bg-gray-100 px-3 py-2 text-gray-800">
                Could not build a full path to your destination with the current
                search.
              </p>
            )}

          {IS_TICKET_ALERT_ENABLED && (
            <EntireJourneyAlertCTA
              trainNumber={altForTrain || ctaTrainNumber || ""}
              trainName={altTrainName || ctaTrainName || undefined}
              trainStartDate={ctaTrainStartDate || journeyDate || ""}
              journeyDate={journeyDate || ctaJourneyDate || ""}
              classCode={ctaClassCode || "SL"}
              defaultOrigin={fromCode || ""}
              defaultDestination={toCode || ""}
              originChartTime={originChartTime}
            />
          )}

          {/* Admin debug trace */}
          {isAdminUser &&
            altResult.debugLog &&
            altResult.debugLog.length > 0 && (
              <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  Step-by-step debug trace ({altResult.debugLog.length} lines)
                </summary>
                <ol className="mt-2 max-h-64 list-decimal overflow-y-auto pl-5 font-mono text-xs text-gray-700">
                  {altResult.debugLog.map((line, i) => (
                    <li key={i} className="whitespace-pre-wrap py-0.5">
                      {line}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-gray-500">
                  Same lines are logged on the API server as{" "}
                  <code className="rounded bg-gray-200 px-1">
                    [alternate-paths …]
                  </code>
                  .
                </p>
              </details>
            )}

          {/* ── JOURNEY LEGS ── */}
          <ol
            className="relative list-none pl-0"
            role="list"
            aria-label="Journey segments"
          >
            {alternatePathDisplayItems.map((item, i) => {
              const stepTotal = alternatePathDisplayItems.length;
              const stepIndex = i + 1;
              const isLast = i === alternatePathDisplayItems.length - 1;

              /** Count stations between two codes on the route. */
              const countStationsBetween = (
                fromStationCode: string,
                toStationCode: string,
              ): number | null => {
                const route = altResult.stationCodesOnRoute;
                if (!route || route.length === 0) return null;
                const f = fromStationCode.trim().toUpperCase();
                const t = toStationCode.trim().toUpperCase();
                const fi = route.findIndex((c) => c.toUpperCase() === f);
                const ti = route.findIndex((c) => c.toUpperCase() === t);
                if (fi < 0 || ti < 0 || ti <= fi) return null;
                const between = ti - fi - 1;
                return between > 0 ? between : null;
              };

              if (item.kind === "single") {
                const leg = item.leg;
                const isConfirmed = leg.segmentKind === "confirmed";
                const dep = formatTimeAmPm(leg.departureTime);
                const arr = formatTimeAmPm(leg.arrivalTime);
                const stationsBetween = countStationsBetween(leg.from, leg.to);
                const timeLine =
                  dep && arr
                    ? `${dep} → ${arr}`
                    : dep
                      ? `Dep ${dep}`
                      : arr
                        ? `Arr ${arr}`
                        : null;

                // Build class options: use confirmedClassOptions if available, else build from the single leg
                const classOptions: AlternateClassOption[] = isConfirmed
                  ? leg.confirmedClassOptions &&
                    leg.confirmedClassOptions.length > 0
                    ? leg.confirmedClassOptions
                    : [
                        {
                          travelClass: leg.travelClass ?? "SL",
                          railDataStatus: leg.railDataStatus ?? null,
                          availablityStatus: leg.availablityStatus ?? null,
                          predictionPercentage:
                            leg.predictionPercentage ?? null,
                          availabilityDisplayName:
                            leg.availabilityDisplayName ?? null,
                          fare: leg.fare ?? null,
                        },
                      ]
                  : [];

                return (
                  <li key={i} className="relative flex gap-0">
                    {/* Timeline connector */}
                    <div className="flex w-8 shrink-0 flex-col items-center sm:w-10">
                      <span
                        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums sm:h-8 sm:w-8 sm:text-xs ${
                          isConfirmed
                            ? "bg-emerald-600 text-white ring-2 ring-emerald-200"
                            : "bg-slate-500 text-white ring-2 ring-slate-200"
                        }`}
                      >
                        {stepIndex}
                      </span>
                      {!isLast && <div className="w-0.5 flex-1 bg-gray-200" />}
                    </div>
                    {/* Card */}
                    <div
                      className={`mb-3 min-w-0 flex-1 overflow-hidden rounded-lg border ${
                        isConfirmed
                          ? "border-emerald-200 bg-white"
                          : "border-slate-300 bg-slate-50/50 shadow-sm"
                      }`}
                    >
                      {/* Leg header */}
                      <div
                        className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:px-4 ${
                          isConfirmed
                            ? "border-b border-emerald-100 bg-emerald-50/80"
                            : "border-b border-slate-200 bg-slate-100/50"
                        }`}
                      >
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                            isConfirmed
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-500 text-white"
                          }`}
                        >
                          Leg {stepIndex} of {stepTotal}
                        </span>
                        {stationsBetween != null && (
                          <button
                            onClick={() => {
                              onOpenSchedule(
                                altResult.trainNumber,
                                leg.from,
                                leg.to,
                              );
                            }}
                            className="text-[10px] font-bold uppercase tracking-wider text-blue-600/80 hover:text-blue-800 transition-colors"
                          >
                            {stationsBetween}{" "}
                            {stationsBetween === 1 ? "Station" : "Stations"}
                          </button>
                        )}
                        <span className="font-bold text-gray-900 tabular-nums">
                          {getStationDisplayName(
                            leg.from,
                            altResult.stationNameMap,
                          )}{" "}
                          →{" "}
                          {getStationDisplayName(
                            leg.to,
                            altResult.stationNameMap,
                          )}
                        </span>
                        {stepIndex === 1 &&
                          fromCode &&
                          leg.from.toUpperCase() !== fromCode.toUpperCase() && (
                            <span className="shrink-0 rounded-md bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-sm animate-pulse">
                              💡 Book from earlier station: {leg.from}
                            </span>
                          )}
                        {isLast &&
                          toCode &&
                          leg.to.toUpperCase() !== toCode.toUpperCase() && (
                            <span className="shrink-0 rounded-md bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-sm animate-pulse">
                              💡 Book to further station: {leg.to}
                            </span>
                          )}
                        {timeLine && (
                          <span className="text-xs tabular-nums text-gray-500">
                            {timeLine}
                            {leg.durationMinutes != null && (
                              <span className="text-gray-400">
                                {" · "}
                                {formatDurationMinutes(leg.durationMinutes)}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {/* Class rows for confirmed */}
                      {isConfirmed && classOptions.length > 0 && (
                        <div className="divide-y divide-gray-100">
                          {classOptions.map((opt) => {
                            const optHref = irctcBookingRedirect({
                              from: leg.from,
                              to: leg.to,
                              trainNo: altResult.trainNumber,
                              classCode: opt.travelClass,
                            });
                            return (
                              <div
                                key={opt.travelClass}
                                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5 sm:px-4"
                              >
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0">
                                  <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                                    {opt.travelClass}
                                  </span>
                                  <span className="text-sm font-semibold text-emerald-800">
                                    {opt.availabilityDisplayName ??
                                      opt.railDataStatus ??
                                      "Available"}
                                  </span>
                                  {opt.fare != null && (
                                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                                      ₹{opt.fare.toFixed(0)}
                                    </span>
                                  )}
                                </div>
                                <a
                                  href={optHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() =>
                                    trackAnalyticsEvent({
                                      name: "alternate_paths_irctc_clicked",
                                      properties: {
                                        train_number: altResult.trainNumber,
                                        from_code: leg.from,
                                        to_code: leg.to,
                                        class_code: opt.travelClass,
                                      },
                                    })
                                  }
                                  className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
                                >
                                  Book Now
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* No tickets row */}
                      {!isConfirmed && (
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5 sm:px-4">
                          <span className="text-sm font-semibold text-slate-700">
                            Not Available - Buy Ticket from TTE in Train
                          </span>

                          <CompactLegChartCta
                            trainNumber={altResult.trainNumber}
                            trainName={altTrainName}
                            journeyDate={leg.boardingDate || journeyDate || ""}
                            legFrom={leg.from}
                            legTo={leg.to}
                            classCode={
                              leg.travelClass ?? altAvlClasses?.[0] ?? "SL"
                            }
                            stationNameMap={altResult.stationNameMap}
                            trainStartDate={altResult.trainStartDate}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              }

              // Collapsed unavailable span (≥2 chained check_realtime legs)
              const timingSummary = collapsedAlternatePathTimingSummary(
                item.legs,
              );
              const stationsBetween = countStationsBetween(item.from, item.to);
              return (
                <li key={i} className="relative flex gap-0">
                  {/* Timeline connector */}
                  <div className="flex w-8 shrink-0 flex-col items-center sm:w-10">
                    <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-500 text-[11px] font-bold tabular-nums text-white ring-2 ring-slate-200 sm:h-8 sm:w-8 sm:text-xs">
                      {stepIndex}
                    </span>
                    {!isLast && <div className="w-0.5 flex-1 bg-gray-200" />}
                  </div>
                  {/* Card */}
                  <div className="mb-3 min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-slate-50/60 px-3 py-2 sm:px-4">
                      <span className="shrink-0 rounded-full bg-slate-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        Leg {stepIndex} of {stepTotal}
                      </span>
                      {stationsBetween != null && (
                        <button
                          onClick={() => {
                            onOpenSchedule(
                              altResult.trainNumber,
                              item.from,
                              item.to,
                            );
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider text-blue-600/80 hover:text-blue-800 transition-colors"
                        >
                          {stationsBetween}{" "}
                          {stationsBetween === 1 ? "Station" : "Stations"}
                        </button>
                      )}
                      <span className="font-bold text-gray-900 tabular-nums">
                        {getStationDisplayName(
                          item.from,
                          altResult.stationNameMap,
                        )}{" "}
                        →{" "}
                        {getStationDisplayName(
                          item.to,
                          altResult.stationNameMap,
                        )}
                      </span>
                      {timingSummary && (
                        <span className="text-xs tabular-nums text-gray-500">
                          {timingSummary.timePart}
                          {timingSummary.durationLabel && (
                            <span className="text-gray-400">
                              {timingSummary.timePart ? " · " : ""}
                              {timingSummary.durationLabel}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5 sm:px-4">
                      <span className="text-sm font-semibold text-amber-800">
                        Not Available - Buy Ticket from TTE in Train
                      </span>

                      <CompactLegChartCta
                        trainNumber={altResult.trainNumber}
                        trainName={altTrainName}
                        journeyDate={item.legs[0]?.boardingDate || journeyDate || ""}
                        legFrom={item.from}
                        legTo={item.to}
                        classCode={altAvlClasses?.[0] ?? "SL"}
                        stationNameMap={altResult.stationNameMap}
                        trainStartDate={altResult.trainStartDate}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
