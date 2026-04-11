"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import { buildAlternatePathDisplayItems } from "@/lib/bookingV2AlternatePathsDisplay";
import {
  extractJourneyTrainRunDayError,
  extractTrainRunDayFromValidateBody,
  firstJourneyValidationMessage,
} from "@/lib/journeyValidationErrors";
import { isIrctcDirectBookable } from "@/lib/bookingV2Availability";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import {
  buildJourneyChartAlertSchedulePhrase,
  describeChartPreparationForStation,
} from "@/lib/stationChartMetaSummary";
import {
  IstRailMaintenanceBanner,
  IstRailMaintenanceModal,
} from "@/components/IstRailMaintenance";
import { JourneyDatePicker } from "@/components/booking-v2/JourneyDatePicker";
import { useIstRailMaintenance } from "@/hooks/useIstRailMaintenance";
import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";
import { shareDomElementAsPng } from "@/lib/shareDomScreenshot";
import { cn } from "@/lib/utils";
import moment from "moment";

const MONITOR_CONTACT_STORAGE_KEY = "lastBerth_monitor_contact";
const LEG_ALERT_STORAGE_PREFIX = "lastBerth_leg_alert_";

function legAlertKey(
  trainNumber: string,
  from: string,
  to: string,
  date: string,
): string {
  const raw = `${trainNumber.trim()}|${from.trim().toUpperCase()}|${to.trim().toUpperCase()}|${date.trim().slice(0, 10)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `${LEG_ALERT_STORAGE_PREFIX}${Math.abs(hash).toString(36)}`;
}

function isLegAlertSet(
  trainNumber: string,
  from: string,
  to: string,
  date: string,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(legAlertKey(trainNumber, from, to, date)) ===
      "1"
    );
  } catch {
    return false;
  }
}

function markLegAlertSet(
  trainNumber: string,
  from: string,
  to: string,
  date: string,
): void {
  try {
    window.localStorage.setItem(legAlertKey(trainNumber, from, to, date), "1");
  } catch {
    /* ignore */
  }
}

/** Convert 24h "HH:MM" to 12h "h:mm A" using moment. Returns original if parsing fails. */
function formatTimeAmPm(time: string | null | undefined): string | null {
  if (!time?.trim()) return null;
  const m = moment(time.trim(), "HH:mm", true);
  return m.isValid() ? m.format("h:mm A") : time.trim();
}

type StationRow = {
  stationCode: string;
  stationName: string;
  city?: string;
  state?: string;
};

type AvailabilityCacheEntry = {
  travelClass?: string;
  fare?: string;
  availabilityDisplayName?: string;
  railDataStatus?: string;
  /** Upstream `availablityType`: 1 = bookable on IRCTC, 3 = waiting, etc. */
  availablityType?: number | string | null;
  availablityStatus?: string | null;
  vendorPredictionStatus?: string | null;
};

type TrainListItem = {
  trainNumber: string;
  trainName: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: number;
  fromStnCode?: string;
  toStnCode?: string;
  avlClasses?: string[];
  availabilityCache?: Record<string, AvailabilityCacheEntry>;
};

type AlternateClassOption = {
  travelClass: string;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

type AlternateLeg = {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
  travelClass: string | null;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
  /** All confirmed class options for this segment, sorted cheapest-first. */
  confirmedClassOptions?: AlternateClassOption[];
  /** Set from IRCTC schedule when the API includes leg timing (HH:MM). */
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
};

/** Mirror of backend AlternatePathProgressEvent. */
type AlternatePathProgressEvent =
  | { type: "schedule_ok"; trainName: string | null; stopCount: number }
  | { type: "schedule_fail" }
  | { type: "route_ok"; from: string; to: string; stopCount: number }
  | { type: "route_fail"; from: string; to: string }
  | {
      type: "hop_confirmed";
      from: string;
      to: string;
      travelClass: string;
      fare: number | null;
      hopIndex: number;
    }
  | { type: "hop_unavailable"; from: string; to: string; hopIndex: number }
  | {
      type: "done";
      isComplete: boolean;
      legCount: number;
      totalFare: number | null;
    };

type AlternatePathsResponse = {
  trainNumber: string;
  legs: AlternateLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  /** Code → full station name from the IRCTC schedule. */
  stationNameMap?: Record<string, string>;
  remainderMergedSchedule?: {
    from: string;
    to: string;
    departureTime: string | null;
    arrivalTime: string | null;
    durationMinutes: number | null;
  } | null;
  debugLog?: string[];
};

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
    const hasDone = events.some((e) => e.type === "done");
    let lastUnavailIdx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "hop_unavailable") {
        lastUnavailIdx = i;
        break;
      }
    }
    return events.filter((ev, i) => {
      if (ev.type === "schedule_ok") return false;
      if (ev.type === "hop_unavailable") {
        if (hasDone) return false;
        return i === lastUnavailIdx;
      }
      return true;
    });
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
              className={`h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 ${progress === 100 ? 'border-t-emerald-500 opacity-0 transition-opacity' : ''}`}
              aria-hidden
            />
            <p className="text-sm font-semibold text-gray-700">
              {progress === 100 ? "Search complete!" : "Searching for the best seats…"}
            </p>
          </div>
          <span className="text-xs font-bold text-gray-500 tabular-nums">
            {progress}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
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

function ConfirmedClassOptionCard({
  option,
  from,
  to,
  trainNumber,
}: {
  option: AlternateClassOption;
  from: string;
  to: string;
  trainNumber: string;
}) {
  const href = irctcBookingRedirect({
    from,
    to,
    trainNo: trainNumber,
    classCode: option.travelClass,
  });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-lg font-extrabold leading-tight tracking-tight text-emerald-950 tabular-nums">
          {option.availabilityDisplayName ??
            option.railDataStatus ??
            "Available"}
        </p>
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
          Class {option.travelClass}
        </span>
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
          Available
        </span>
      </div>
      {option.fare != null && (
        <p className="text-base font-bold text-gray-900">
          ₹{option.fare.toFixed(0)}
        </p>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          trackAnalyticsEvent({
            name: "alternate_paths_irctc_clicked",
            properties: {
              train_number: trainNumber,
              from_code: from,
              to_code: to,
              class_code: option.travelClass,
            },
          });
        }}
        className="bg-blue-600 hover:bg-blue-700 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        aria-label={`Book ${option.travelClass} class IRCTC ticket from ${from} to ${to}`}
      >
        Book
      </a>
    </div>
  );
}

function StationLabel({ code, name }: { code: string; name?: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-lg font-bold tracking-tight text-gray-900">
        {code}
      </span>
      {name && (
        <span className="text-[11px] font-normal text-gray-500 leading-tight">
          {name}
        </span>
      )}
    </span>
  );
}

function AlternatePathLegListItem({
  leg,
  trainNumber,
  trainName,
  journeyDate,
  stepIndex,
  stepTotal,
  stationNameMap,
}: {
  leg: AlternateLeg;
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  stepIndex: number;
  stepTotal: number;
  stationNameMap?: Record<string, string>;
}) {
  const isConfirmed = leg.segmentKind === "confirmed";
  const multiClass =
    isConfirmed && (leg.confirmedClassOptions?.length ?? 0) > 1;
  const bookHref = irctcBookingRedirect({
    from: leg.from,
    to: leg.to,
    trainNo: trainNumber,
    classCode: leg.travelClass ?? "SL",
  });
  const fromName = stationNameMap?.[leg.from.toUpperCase()];
  const toName = stationNameMap?.[leg.to.toUpperCase()];

  return (
    <li className="list-none">
      <div className="flex gap-3 sm:gap-4">
        <div className="flex shrink-0 flex-col items-center">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold tabular-nums",
              isConfirmed
                ? "bg-emerald-100 text-emerald-900 ring-2 ring-emerald-200"
                : "bg-amber-100 text-amber-950 ring-2 ring-amber-200",
            )}
            aria-hidden
          >
            {stepIndex}
          </span>
        </div>
        <div
          className={cn(
            "min-w-0 flex-1 rounded-xl border p-4 shadow-sm",
            isConfirmed
              ? "border-emerald-200/90 bg-white"
              : "border-amber-200/90 bg-amber-50/40",
          )}
        >
          {isConfirmed ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Leg {stepIndex} of {stepTotal}
              </p>
              {/* Route line — shared across both single and multi-class layouts */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StationLabel code={leg.from} name={fromName} />
                <span
                  className="text-sm font-medium text-gray-400"
                  aria-hidden="true"
                >
                  →
                </span>
                <StationLabel code={leg.to} name={toName} />
              </div>
              <AlternatePathLegScheduleLine leg={leg} />

              {multiClass ? (
                /* Multiple confirmed classes — show one sub-card per class */
                <div
                  className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
                  role="list"
                  aria-label="Available class options"
                >
                  {leg.confirmedClassOptions!.map((opt) => (
                    <div key={opt.travelClass} role="listitem">
                      <ConfirmedClassOptionCard
                        option={opt}
                        from={leg.from}
                        to={leg.to}
                        trainNumber={trainNumber}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                /* Single confirmed class — original single-card layout */
                <>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <p className="text-2xl font-extrabold leading-tight tracking-tight text-emerald-950 tabular-nums">
                      {leg.availabilityDisplayName ??
                        leg.railDataStatus ??
                        "Available"}
                    </p>
                    {leg.travelClass ? (
                      <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        Class {leg.travelClass}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                    Available
                  </span>
                  {leg.fare != null && (
                    <p className="mt-3 text-xl font-bold text-gray-900">
                      ₹{leg.fare.toFixed(0)}
                    </p>
                  )}
                  <a
                    href={bookHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      trackAnalyticsEvent({
                        name: "alternate_paths_irctc_clicked",
                        properties: {
                          train_number: trainNumber,
                          from_code: leg.from,
                          to_code: leg.to,
                          class_code: leg.travelClass ?? "SL",
                        },
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-bold text-white shadow-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:min-w-[220px]"
                    aria-label={`Book IRCTC ticket from ${leg.from} to ${leg.to}`}
                  >
                    Book
                  </a>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Leg {stepIndex} of {stepTotal}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p className="text-2xl font-extrabold leading-tight tracking-tight text-amber-950">
                  No confirmed tickets
                </p>
                {leg.travelClass ? (
                  <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                    Class {leg.travelClass}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StationLabel code={leg.from} name={fromName} />
                <span
                  className="text-sm font-medium text-gray-400"
                  aria-hidden="true"
                >
                  →
                </span>
                <StationLabel code={leg.to} name={toName} />
              </div>
              <AlternatePathLegScheduleLine leg={leg} />
              {(leg.availabilityDisplayName ?? leg.railDataStatus) && (
                <p className="mt-3 text-sm text-gray-700">
                  Last check:{" "}
                  {leg.availabilityDisplayName ?? leg.railDataStatus}
                </p>
              )}
              <LegChartTimeInsight
                trainNumber={trainNumber}
                trainName={trainName}
                journeyDate={journeyDate}
                stationCode={leg.from}
                legFrom={leg.from}
                legTo={leg.to}
                classCode={leg.travelClass ?? "SL"}
              />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Fetches chart time for a station and shows chart-prepared or chart-not-prepared messaging with alert subscription. */
function LegChartTimeInsight({
  trainNumber,
  trainName,
  journeyDate,
  stationCode,
  legFrom,
  legTo,
  classCode,
}: {
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  stationCode: string;
  legFrom: string;
  legTo: string;
  classCode: string;
}) {
  const [meta, setMeta] = useState<StationChartMetaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [alertAlreadySet, setAlertAlreadySet] = useState(false);

  useEffect(() => {
    if (isLegAlertSet(trainNumber, legFrom, legTo, journeyDate)) {
      setAlertAlreadySet(true);
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

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setMeta(null);
    apiClient
      .post<{ stations: StationChartMetaItem[] }>(
        "/api/train-composition/stations-meta",
        {
          trainNumber: trainNumber.trim(),
          journeyDate: journeyDate.trim(),
          sourceStation: stationCode.trim().toUpperCase(),
          refreshFromIrctc: false,
        },
        { timeout: 120_000 },
      )
      .then((r) => {
        if (!cancel) setMeta(r.data?.stations?.[0] ?? null);
      })
      .catch(() => {
        if (!cancel) setMeta(null);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [trainNumber, journeyDate, stationCode]);

  const chartTime = meta?.chartOneTime?.trim() || null;
  const chartPrepared = useMemo(() => {
    if (!chartTime || !journeyDate) return null;
    const ymd = journeyDate.trim().slice(0, 10);
    const chartMoment = moment(`${ymd} ${chartTime}`, "YYYY-MM-DD HH:mm");
    if (!chartMoment.isValid()) return null;
    return moment().isAfter(chartMoment);
  }, [chartTime, journeyDate]);

  const chartDateTimeFormatted = useMemo(() => {
    if (!chartTime || !journeyDate) return null;
    const ymd = journeyDate.trim().slice(0, 10);
    const m = moment(`${ymd} ${chartTime}`, "YYYY-MM-DD HH:mm");
    return m.isValid() ? m.format("ddd, MMM DD [at] h:mm A") : chartTime;
  }, [chartTime, journeyDate]);

  const subscribeAlert = useCallback(async () => {
    const em = email.trim() || undefined;
    const mob = mobile.trim() || undefined;
    if (!em && !mob) {
      setAlertError("Enter an email or mobile number for alerts.");
      return;
    }
    setAlertSubmitting(true);
    setAlertError(null);
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
      });
      markLegAlertSet(trainNumber, legFrom, legTo, journeyDate);
      setAlertAlreadySet(true);
      setAlertSuccess(
        "Alert set up! We'll notify you when a ticket opens on this leg.",
      );
      try {
        window.localStorage.setItem(
          MONITOR_CONTACT_STORAGE_KEY,
          JSON.stringify({ email: em ?? "", mobile: mob ?? "" }),
        );
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to set up alert.";
      setAlertError(msg);
    } finally {
      setAlertSubmitting(false);
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
  ]);

  // --- Alert CTA block — shown in all non-error states ---
  const alertBlock = alertAlreadySet ? (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
      <p className="text-sm font-semibold text-emerald-900">✓ Alert set up</p>
      <p className="mt-0.5 text-sm text-emerald-800">
        {alertSuccess ?? "We'll notify you when a ticket opens on this leg."}
      </p>
    </div>
  ) : (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
      <p className="text-sm font-semibold text-gray-900">
        Get notified when seats open
      </p>
      <p className="mt-0.5 text-xs text-gray-600">
        We&apos;ll watch chart runs for {legFrom} → {legTo} and alert you if
        availability changes.
        {chartDateTimeFormatted
          ? ` Chart time: ${chartDateTimeFormatted}.`
          : ""}
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="tel"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          placeholder="Mobile (optional)"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
        />
      </div>
      <button
        type="button"
        disabled={alertSubmitting}
        onClick={() => void subscribeAlert()}
        className="bg-blue-600 hover:bg-blue-700 mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 sm:w-auto"
      >
        {alertSubmitting ? "Setting up…" : "Set alert for this leg"}
      </button>
      {alertError && <p className="mt-2 text-sm text-red-700">{alertError}</p>}
    </div>
  );

  if (loading) {
    return (
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
        {/* Header row: spinner + context message */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            <svg
              className="h-4 w-4 animate-spin text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Still checking the best options…
            </p>
            <p className="mt-0.5 text-xs text-blue-700">
              We&apos;re looking up chart preparation times for {stationCode}.
              Tickets on this leg ({legFrom} → {legTo}) may open up when the
              chart runs — set an alert below and we&apos;ll notify you the
              moment availability changes.
            </p>
          </div>
        </div>

        {/* Alert form — shown inline so user can act while waiting */}
        <div className="mt-3 border-t border-blue-200/70 pt-3">
          {alertAlreadySet ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-700">
                ✓ Alert set up
              </span>
              <span className="text-xs text-emerald-600">
                {alertSuccess ??
                  "We'll notify you when a ticket opens on this leg."}
              </span>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold text-blue-900">
                Get notified when seats open
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm placeholder:text-gray-400"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <input
                  type="tel"
                  className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm placeholder:text-gray-400"
                  placeholder="Mobile (optional)"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <button
                type="button"
                disabled={alertSubmitting}
                onClick={() => void subscribeAlert()}
                className="bg-blue-600 hover:bg-blue-700 mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 sm:w-auto"
              >
                {alertSubmitting ? "Setting up…" : "Set alert for this leg"}
              </button>
              {alertError && (
                <p className="mt-1.5 text-xs text-red-700">{alertError}</p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (chartPrepared === true) {
    return (
      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-red-900">
            Chart already prepared
          </p>
          <p className="mt-1 text-sm text-red-800">
            Chart was prepared at{" "}
            <span className="font-semibold">{chartDateTimeFormatted}</span> for{" "}
            {stationCode}. Ticket availability is unlikely to change.
          </p>
        </div>
        {alertBlock}
      </div>
    );
  }

  if (chartPrepared === false) {
    return (
      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-amber-900">
            Chart not prepared yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Chart prepares at{" "}
            <span className="font-bold text-amber-950">
              {chartDateTimeFormatted}
            </span>
            . Tickets may open up after that.
          </p>
        </div>
        {alertBlock}
      </div>
    );
  }

  // chartPrepared === null — no chart time available yet
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <p className="text-sm font-medium text-gray-700">
          Chart preparation time for{" "}
          <span className="font-semibold">{stationCode}</span> is not yet
          available.
        </p>
      </div>
      {alertBlock}
    </div>
  );
}

/** IRCTC chart prep + journey monitoring CTA for the collapsed “remainder” leg (e.g. BL → BVI). */
function AlternatePathRemainderInsights({
  trainNumber,
  trainName,
  journeyDate,
  legFrom,
  legTo,
  monitorClassCode,
  journeyDestinationCode,
  isJourneyTail,
}: {
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  legFrom: string;
  legTo: string;
  monitorClassCode: string;
  /** When set and equal to `legTo`, hide IRCTC composition-error lines at destination (not useful for where you alight). */
  journeyDestinationCode?: string | null;
  isJourneyTail?: boolean;
}) {
  const [metaFrom, setMetaFrom] = useState<StationChartMetaItem | null>(null);
  const [metaTo, setMetaTo] = useState<StationChartMetaItem | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [monitorSubmitting, setMonitorSubmitting] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorSuccessCopy, setMonitorSuccessCopy] = useState<string | null>(
    null,
  );

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    let cancel = false;
    setMetaLoading(true);
    setMetaErr(null);
    setMetaFrom(null);
    setMetaTo(null);

    const fromCode = legFrom.trim().toUpperCase();
    const toCode = legTo.trim().toUpperCase();
    const sameStation = fromCode === toCode && fromCode.length > 0;
    const toIsJourneyDest =
      journeyDestinationCode != null &&
      toCode === journeyDestinationCode.trim().toUpperCase();

    const fetchMeta = (sourceStation: string) =>
      apiClient.post<{ stations: StationChartMetaItem[] }>(
        "/api/train-composition/stations-meta",
        {
          trainNumber: trainNumber.trim(),
          journeyDate: journeyDate.trim(),
          sourceStation,
          refreshFromIrctc: false,
        },
        { timeout: 120_000 },
      );

    const run = async () => {
      const parts: string[] = [];
      try {
        if (sameStation || toIsJourneyDest) {
          // Only fetch origin — destination is either same or not meaningful
          const r = await fetchMeta(fromCode);
          if (cancel) return;
          const row = r.data?.stations?.[0] ?? null;
          setMetaFrom(row);
          setMetaTo(row);
        } else {
          const [a, b] = await Promise.allSettled([
            fetchMeta(fromCode),
            fetchMeta(toCode),
          ]);
          if (cancel) return;
          if (a.status === "fulfilled") {
            setMetaFrom(a.value.data?.stations?.[0] ?? null);
          } else {
            setMetaFrom(null);
            parts.push(
              `Origin (${fromCode}): ${extractAxiosMessage(a.reason)}`,
            );
          }
          if (b.status === "fulfilled") {
            setMetaTo(b.value.data?.stations?.[0] ?? null);
          } else {
            setMetaTo(null);
            parts.push(
              `Destination (${toCode}): ${extractAxiosMessage(b.reason)}`,
            );
          }
        }
        if (!cancel && parts.length > 0) setMetaErr(parts.join(" "));
      } catch (e: unknown) {
        if (!cancel) setMetaErr(extractAxiosMessage(e));
      } finally {
        if (!cancel) setMetaLoading(false);
      }
    };

    void run();
    return () => {
      cancel = true;
    };
  }, [trainNumber, journeyDate, legFrom, legTo, journeyDestinationCode]);

  const originChart = useMemo(
    () => describeChartPreparationForStation(metaFrom, legFrom, journeyDate),
    [metaFrom, legFrom, journeyDate],
  );
  const destChart = useMemo(
    () => describeChartPreparationForStation(metaTo, legTo, journeyDate),
    [metaTo, legTo, journeyDate],
  );
  const destChartLinesForUi = useMemo(() => {
    const dest = journeyDestinationCode?.trim().toUpperCase() ?? "";
    const to = legTo.trim().toUpperCase();
    if (!dest || dest !== to) return destChart.lines;
    return destChart.lines.filter((line) => !/^\s*IRCTC\s+status:/i.test(line));
  }, [destChart.lines, journeyDestinationCode, legTo]);
  const sameLegEndpoints =
    legFrom.trim().toUpperCase() === legTo.trim().toUpperCase() &&
    legFrom.trim().length > 0;

  const subscribeAlerts = useCallback(async () => {
    const em = email.trim() || undefined;
    const mob = mobile.trim() || undefined;
    if (!em && !mob) {
      setMonitorError("Enter an email or mobile number for alerts.");
      return;
    }
    setMonitorSubmitting(true);
    setMonitorError(null);
    setMonitorSuccessCopy(null);
    try {
      const { data: validated } = await apiClient.post<{
        valid: boolean;
        errors?: Array<{ code: string; message: string }>;
      }>("/api/availability/journey/validate", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: legFrom.trim().toUpperCase(),
        toStationCode: legTo.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: monitorClassCode.trim().toUpperCase(),
      });
      if (!validated.valid) {
        const runDay = extractTrainRunDayFromValidateBody(validated);
        setMonitorError(
          runDay?.message ??
            firstJourneyValidationMessage(validated) ??
            "Validation failed.",
        );
        return;
      }
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: legFrom.trim().toUpperCase(),
        toStationCode: legTo.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: monitorClassCode.trim().toUpperCase(),
        email: em,
        mobile: mob,
      });
      const schedulePhrase = buildJourneyChartAlertSchedulePhrase({
        journeyDateYmd: journeyDate.trim(),
        metaLoading,
        metaErr,
        metaFrom,
        metaTo,
        legFromCode: legFrom,
        legToCode: legTo,
        sameLegEndpoints,
      });
      setMonitorSuccessCopy(
        `Alert has been set up! We will inform you if there are any tickets available on ${schedulePhrase}. But you need to be quick to book those tickets. If you have already boarded the train, you will still receive notifications as per realtime availability.`,
      );
      try {
        window.localStorage.setItem(
          MONITOR_CONTACT_STORAGE_KEY,
          JSON.stringify({ email: em ?? "", mobile: mob ?? "" }),
        );
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      const runDayPayload = extractJourneyTrainRunDayError(err);
      if (runDayPayload) setMonitorError(runDayPayload.message);
      else setMonitorError(extractAxiosMessage(err));
    } finally {
      setMonitorSubmitting(false);
    }
  }, [
    email,
    mobile,
    trainNumber,
    trainName,
    legFrom,
    legTo,
    journeyDate,
    monitorClassCode,
    metaLoading,
    metaErr,
    metaFrom,
    metaTo,
    sameLegEndpoints,
  ]);

  return (
    <div className="mt-3 space-y-3 border-t border-amber-200/80 pt-3">
      <p className="mt-1 text-sm font-medium text-amber-950">
        {isJourneyTail
          ? "There are no tickets available overall."
          : `No tickets available on this segment right now but since the charting time for ${legFrom.trim().toUpperCase()} station is ${metaFrom?.chartOneTime || (metaLoading ? "..." : "upcoming")}, at that time there will be new tickets which will come up, we can alert you then to book those tickets`}
      </p>
      <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
        {metaLoading && (
          <p className="font-medium text-amber-900">
            Loading IRCTC chart preparation times for{" "}
            {legFrom.trim().toUpperCase()}
            {sameLegEndpoints ||
            legTo.trim().toUpperCase() ===
              (journeyDestinationCode?.trim().toUpperCase() ?? "")
              ? ""
              : ` and ${legTo.trim().toUpperCase()}`}
            …
          </p>
        )}
        {!metaLoading && metaErr && (
          <p className="text-red-800">Could not load chart times: {metaErr}</p>
        )}
        {!metaLoading && !metaErr && (
          <div className="space-y-4">
            <div
              className={cn(
                "space-y-1.5 pb-3",
                !sameLegEndpoints && "border-b border-amber-200/70",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/75">
                {sameLegEndpoints ? "Station" : "Origin"}
              </p>
              <p className="font-semibold leading-snug text-amber-950">
                {originChart.title}
              </p>
              {originChart.lines.map((line, i) => (
                <p key={i} className="leading-snug text-amber-950/95">
                  {line}
                </p>
              ))}
            </div>
            {!sameLegEndpoints &&
              legTo.trim().toUpperCase() !==
                (journeyDestinationCode?.trim().toUpperCase() ?? "") && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/75">
                    Destination
                  </p>
                  <p className="font-semibold leading-snug text-amber-950">
                    {destChart.title}
                  </p>
                  {destChartLinesForUi.map((line, i) => (
                    <p key={i} className="leading-snug text-amber-950/95">
                      {line}
                    </p>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
        <p className="text-sm font-semibold text-gray-900">
          Get availability alerts
        </p>
        <p className="mt-1 text-xs text-gray-600">
          We can watch chart runs and this leg ({legFrom} → {legTo}) and notify
          you if seats open up.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="tel"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Mobile (optional)"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoComplete="tel"
          />
        </div>
        <button
          type="button"
          disabled={monitorSubmitting}
          onClick={() => void subscribeAlerts()}
          className="bg-blue-600 hover:bg-blue-700 mt-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {monitorSubmitting ? "Subscribing…" : "Subscribe to chart prep"}
        </button>
        {monitorError && (
          <p className="mt-2 text-sm text-red-700">{monitorError}</p>
        )}
        {monitorSuccessCopy && (
          <p className="mt-2 text-sm font-medium text-emerald-800">
            {monitorSuccessCopy}
          </p>
        )}
      </div>
    </div>
  );
}

/** Regret / sold-out style: orange → red gradient text. */
function chipGeneralStatusClass(status: string): string | undefined {
  const s = status.trim().toLowerCase();
  if (
    s.includes("regret") ||
    s.includes("not available") ||
    s.includes("no chance") ||
    s.includes("departed")
  ) {
    return "inline-block bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text font-semibold text-transparent";
  }
  if (s.includes("wl") || s.includes("waitlist")) {
    return "font-semibold text-amber-600";
  }
  if (s.includes("avl") || s.includes("available") || s.includes("curr_avl")) {
    return "font-semibold text-emerald-700";
  }
  return undefined;
}

function formatDurationMinutes(mins: number | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function AlternatePathLegScheduleLine({ leg }: { leg: AlternateLeg }) {
  const dep = formatTimeAmPm(leg.departureTime);
  const arr = formatTimeAmPm(leg.arrivalTime);
  const hasDuration =
    leg.durationMinutes != null && !Number.isNaN(leg.durationMinutes);
  const hasClocks = Boolean(dep) || Boolean(arr);
  if (!hasClocks && !hasDuration) return null;

  const timePart =
    dep && arr
      ? `${dep} → ${arr}`
      : dep
        ? `Dep ${dep}`
        : arr
          ? `Arr ${arr}`
          : null;
  const durLabel = formatDurationMinutes(leg.durationMinutes ?? undefined);

  return (
    <p className="mt-1.5 text-sm tabular-nums text-gray-600">
      {timePart}
      {hasDuration && (
        <span className="text-gray-500">
          {timePart ? ` · ${durLabel}` : durLabel}
        </span>
      )}
    </p>
  );
}

function collapsedAlternatePathTimingSummary(legs: AlternateLeg[]): {
  timePart: string | null;
  durationLabel: string | null;
} | null {
  if (legs.length === 0) return null;
  const dep = formatTimeAmPm(legs[0]?.departureTime);
  const arr = formatTimeAmPm(legs[legs.length - 1]?.arrivalTime);
  const allDur = legs.every(
    (l) =>
      l.durationMinutes != null && !Number.isNaN(l.durationMinutes as number),
  );
  const totalMins = allDur
    ? legs.reduce((s, l) => s + (l.durationMinutes as number), 0)
    : null;
  let timePart: string | null = null;
  if (dep && arr) timePart = `${dep} → ${arr}`;
  else if (dep) timePart = `Dep ${dep}`;
  else if (arr) timePart = `Arr ${arr}`;
  const durationLabel =
    totalMins != null ? formatDurationMinutes(totalMins) : null;
  if (!timePart && !durationLabel) return null;
  return { timePart, durationLabel };
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function extractAxiosMessage(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const ax = e as {
      response?: { status?: number; data?: { message?: string | string[] } };
      message?: string;
    };
    const d = ax.response?.data?.message;
    if (Array.isArray(d)) return d.join(", ");
    if (typeof d === "string" && d.trim()) return d;
    if (ax.response?.status === 502 || ax.response?.status === 503) {
      return "Station search service unavailable. Try again.";
    }
    if (ax.response?.status === 400)
      return "Type at least 2 characters to search.";
  }
  if (e instanceof Error && e.message) return e.message;
  return "Could not load stations. Check that the API is running (NEXT_PUBLIC_API_URL).";
}

function StationFieldSimple(props: {
  label: string;
  query: string;
  onUserType: (q: string) => void;
  value: StationRow | null;
  onSelect: (s: StationRow) => void;
  suggestions: StationRow[];
  loading: boolean;
  pendingDebounce: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suggestError: string | null;
}) {
  const {
    label,
    query,
    onUserType,
    value,
    onSelect,
    suggestions,
    loading,
    pendingDebounce,
    open,
    onOpenChange,
    suggestError,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onOpenChange]);

  const showList = open && query.length >= 2;
  const displayText =
    value && !open ? `${value.stationCode} - ${value.stationName}` : query;
  const showLoading = loading || pendingDebounce;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative min-w-0 flex-1 border-b border-gray-200 px-3 py-2.5 sm:border-b-0 sm:border-r sm:py-2",
        showList && "z-[55]",
      )}
    >
      <label
        htmlFor={inputId}
        className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
      >
        <svg
          className="h-3.5 w-3.5 shrink-0 text-blue-600 sm:h-4 sm:w-4"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 3.1V7a4 4 0 0 0 8 0V3.1"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 15-1-1" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 1-1" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8 19-2 3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m16 19 2 3" />
        </svg>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          className="block w-full rounded-md border border-gray-300 bg-gray-50 py-3.5 pl-3 pr-8 text-lg font-medium text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 sm:py-4 sm:pl-4"
          placeholder="Search station name or code…"
          value={displayText}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-controls={showList ? `${inputId}-listbox` : undefined}
          onChange={(e) => {
            onUserType(e.target.value);
            onOpenChange(true);
          }}
          onFocus={() => onOpenChange(true)}
        />
        <span
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-gray-400"
          aria-hidden
        >
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>
      {showList && (
        <ul
          id={`${inputId}-listbox`}
          className="absolute inset-x-0 top-full z-[60] mt-1 max-h-56 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg sm:min-w-[min(100%,18rem)]"
          role="listbox"
        >
          {showLoading && (
            <li className="px-4 py-3 text-sm text-gray-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                Loading stations…
              </span>
            </li>
          )}
          {!showLoading && suggestError && (
            <li className="px-4 py-3 text-sm text-red-700">{suggestError}</li>
          )}
          {!showLoading && !suggestError && suggestions.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">
              No stations match. Try another spelling.
            </li>
          )}
          {suggestions.map((s) => (
            <li key={`${s.stationCode}-${s.stationName}`} role="option">
              <button
                type="button"
                className="block w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s);
                  onOpenChange(false);
                }}
              >
                <span className="font-semibold text-gray-900">
                  {s.stationCode}
                </span>
                <span className="text-gray-600"> — {s.stationName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Compact inline CTA for the simple view — subscribes to chart alerts for legs
 * that have no confirmed tickets. Does NOT show the full alert form; just a
 * single "Subscribe to alerts" button that opens the alert subscription inline.
 */
function CompactLegChartCta({
  trainNumber,
  trainName,
  journeyDate,
  legFrom,
  legTo,
  classCode,
}: {
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  legFrom: string;
  legTo: string;
  classCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [alreadySet, setAlreadySet] = useState(false);
  const [chartTimeLabel, setChartTimeLabel] = useState<string | null>(null);

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
        const chartTime = r.data?.stations?.[0]?.chartOneTime?.trim();
        if (chartTime && journeyDate) {
          const ymd = journeyDate.trim().slice(0, 10);
          const m = moment(`${ymd} ${chartTime}`, "YYYY-MM-DD HH:mm");
          if (m.isValid()) {
            setChartTimeLabel(m.format("ddd, MMM DD [at] h:mm A"));
          }
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancel = true;
    };
  }, [trainNumber, journeyDate, legFrom]);

  const subscribe = useCallback(async () => {
    const em = email.trim() || undefined;
    const mob = mobile.trim() || undefined;
    if (!em && !mob) {
      setError("Enter an email or mobile number.");
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
      });
      markLegAlertSet(trainNumber, legFrom, legTo, journeyDate);
      setDone(true);
      setAlreadySet(true);
      try {
        window.localStorage.setItem(
          MONITOR_CONTACT_STORAGE_KEY,
          JSON.stringify({ email: em ?? "", mobile: mob ?? "" }),
        );
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set alert.");
    } finally {
      setSubmitting(false);
    }
  }, [email, mobile, trainNumber, trainName, legFrom, legTo, journeyDate, classCode]);

  if (done || alreadySet) {
    return (
      <div className="flex flex-col items-end gap-1">
        {chartTimeLabel && (
          <p className="text-[10px] font-medium text-emerald-700/90">
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
        {chartTimeLabel && (
          <p className="text-[10px] font-medium text-amber-700/90">
            New tickets open at {chartTimeLabel}
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
        >
          Subscribe to chart prep
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full rounded-md border border-blue-200 bg-blue-50 p-2.5">
      <p className="mb-1.5 text-xs font-semibold text-blue-900">
        {chartTimeLabel
          ? `Get notified when new seats open at ${chartTimeLabel} on ${legFrom} → ${legTo} route`
          : `Get notified when new seats open on ${legFrom} → ${legTo} route`}
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
      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export default function BookingV2Page() {
  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ] = useState("");
  const fromDeb = useDebounced(fromQ, 300);
  const toDeb = useDebounced(toQ, 300);
  const [fromSt, setFromSt] = useState<StationRow | null>(null);
  const [toSt, setToSt] = useState<StationRow | null>(null);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [fromSuggest, setFromSuggest] = useState<StationRow[]>([]);
  const [toSuggest, setToSuggest] = useState<StationRow[]>([]);
  const [fromSuggestError, setFromSuggestError] = useState<string | null>(null);
  const [toSuggestError, setToSuggestError] = useState<string | null>(null);
  const [fromLoad, setFromLoad] = useState(false);
  const [toLoad, setToLoad] = useState(false);

  const openFrom = useCallback(
    (open: boolean) => {
      setFromOpen(open);
      if (open && fromSt) {
        setFromQ(fromSt.stationName);
      }
    },
    [fromSt],
  );

  const openTo = useCallback(
    (open: boolean) => {
      setToOpen(open);
      if (open && toSt) {
        setToQ(toSt.stationName);
      }
    },
    [toSt],
  );
  const [journeyDate, setJourneyDate] = useState<string | null>(null);
  const [acOnly, setAcOnly] = useState(false);
  useEffect(() => {
    setJourneyDate(todayYmd());
  }, []);
  const [trains, setTrains] = useState<TrainListItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [altForTrain, setAltForTrain] = useState<string | null>(null);
  const [altTrainName, setAltTrainName] = useState<string | null>(null);
  const [altAvlClasses, setAltAvlClasses] = useState<string[] | undefined>();
  const [altLoading, setAltLoading] = useState(false);
  const [altResult, setAltResult] = useState<AlternatePathsResponse | null>(
    null,
  );
  const [altError, setAltError] = useState<string | null>(null);
  const [altProgress, setAltProgress] = useState<AlternatePathProgressEvent[]>(
    [],
  );
  const altAlternatePathCaptureRef = useRef<HTMLDivElement>(null);
  const [altShareBusy, setAltShareBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      setIsAdminUser(window.localStorage.getItem("admin") === "true");
      
      // Auto-render injected data for headless screenshots
      const botRenderStr = window.localStorage.getItem("bot_render_alt");
      if (botRenderStr) {
        const payload = JSON.parse(botRenderStr);
        setAltResult(payload.altResult);
        setAltForTrain(payload.trainNumber);
        setAltTrainName(payload.trainName);
        if (payload.journeyDate) {
          setJourneyDate(payload.journeyDate);
        }
        if (payload.trains) {
          setTrains(payload.trains);
        }
        window.localStorage.removeItem("bot_render_alt");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const {
    showBanner,
    maintenanceModalOpen,
    dismissMaintenanceModal,
    displayMinutes,
    onBlockedSearchAttempt,
  } = useIstRailMaintenance(mounted);

  const altTrainObj = useMemo(() => {
    return trains.find((t) => t.trainNumber === altForTrain);
  }, [trains, altForTrain]);

  const directFares = useMemo(() => {
    let fares: { cls: string; fare: number }[] = [];
    if (altTrainObj?.availabilityCache) {
      Object.entries(altTrainObj.availabilityCache).forEach(([cls, avail]) => {
        if (avail.fare) {
          const f = parseInt(avail.fare, 10);
          if (!isNaN(f)) {
            fares.push({ cls, fare: f });
          }
        }
      });
    }
    fares.sort((a, b) => b.fare - a.fare);
    return fares;
  }, [altTrainObj]);
  const shareAlternatePathScreenshot = useCallback(async () => {
    const el = altAlternatePathCaptureRef.current;
    if (!el) return;
    setAltShareBusy(true);
    try {
      const trainLabel = altTrainName?.trim() || altForTrain || "train";
      const result = await shareDomElementAsPng(el, {
        fileName: "lastberth-journey.png",
        title: `LastBerth — ${trainLabel}`,
        text: `Journey options: ${trainLabel}`,
      });
      if (!result.ok) {
        if (result.code === "share_rejected") return;
        window.alert(
          result.message ??
            "Could not capture or share this screen. Try again or take a manual screenshot.",
        );
        return;
      }
      if (result.via === "download") {
        window.alert(
          "Image saved. Open WhatsApp, pick a chat, and attach this image from your downloads or gallery.",
        );
      }
    } finally {
      setAltShareBusy(false);
    }
  }, [altForTrain, altTrainName]);

  useEffect(() => {
    if (fromDeb.length < 2) {
      setFromSuggest([]);
      setFromSuggestError(null);
      return;
    }
    let c = false;
    setFromLoad(true);
    setFromSuggestError(null);
    apiClient
      .get<{ data?: { stationList?: StationRow[] } }>(
        "/api/booking-v2/stations/suggest",
        {
          params: { q: fromDeb, searchString: fromDeb },
        },
      )
      .then((r) => {
        if (!c) {
          setFromSuggest(r.data?.data?.stationList ?? []);
          setFromSuggestError(null);
        }
      })
      .catch((e) => {
        if (!c) {
          const errMsg = extractAxiosMessage(e);
          setFromSuggest([]);
          setFromSuggestError(errMsg);
          trackAnalyticsEvent({
            name: "station_suggestion_failed",
            properties: { error: errMsg, query: fromDeb, field: "from" },
          });
        }
      })
      .finally(() => {
        if (!c) setFromLoad(false);
      });
    return () => {
      c = true;
    };
  }, [fromDeb]);

  useEffect(() => {
    if (toDeb.length < 2) {
      setToSuggest([]);
      setToSuggestError(null);
      return;
    }
    let c = false;
    setToLoad(true);
    setToSuggestError(null);
    apiClient
      .get<{ data?: { stationList?: StationRow[] } }>(
        "/api/booking-v2/stations/suggest",
        {
          params: { q: toDeb, searchString: toDeb },
        },
      )
      .then((r) => {
        if (!c) {
          setToSuggest(r.data?.data?.stationList ?? []);
          setToSuggestError(null);
        }
      })
      .catch((e) => {
        if (!c) {
          const errMsg = extractAxiosMessage(e);
          setToSuggest([]);
          setToSuggestError(errMsg);
          trackAnalyticsEvent({
            name: "station_suggestion_failed",
            properties: { error: errMsg, query: toDeb, field: "to" },
          });
        }
      })
      .finally(() => {
        if (!c) setToLoad(false);
      });
    return () => {
      c = true;
    };
  }, [toDeb]);

  const swapStations = useCallback(() => {
    const a = fromSt;
    const b = toSt;
    setFromSt(b);
    setToSt(a);
    setFromQ(b ? `${b.stationCode} - ${b.stationName}` : "");
    setToQ(a ? `${a.stationCode} - ${a.stationName}` : "");
  }, [fromSt, toSt]);

  const runSearch = useCallback(async () => {
    if (onBlockedSearchAttempt()) return;
    if (!fromSt || !toSt) {
      setSearchError("Select both stations.");
      return;
    }
    if (!journeyDate) {
      setSearchError("Pick a journey date.");
      return;
    }
    setHasSearched(true);
    setSearchError(null);
    setSearchLoading(true);
    setTrains([]);
    try {
      const r = await apiClient.get<{ data?: { trainList?: TrainListItem[] } }>(
        "/api/booking-v2/trains/search",
        {
          params: {
            from: fromSt.stationCode,
            to: toSt.stationCode,
            date: journeyDate,
          },
        },
      );
      setTrains(r.data?.data?.trainList ?? []);
    } catch (e: unknown) {
      let msg = "Search failed";
      if (e && typeof e === "object" && "response" in e) {
        const ax = e as { response?: { data?: { message?: string } } };
        msg = ax.response?.data?.message ?? msg;
      } else if (e instanceof Error) msg = e.message;
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  }, [fromSt, toSt, journeyDate, onBlockedSearchAttempt, acOnly]);

  const findAlternates = useCallback(
    async (t: TrainListItem, focusTravelClass?: string) => {
      if (onBlockedSearchAttempt()) return;
      if (!journeyDate) return;
      /** Alternate-path probes use this train’s run endpoints (e.g. NDLS → CSMT), not only the user’s search pair. */
      const fromCode = (t.fromStnCode ?? fromSt?.stationCode ?? "")
        .trim()
        .toUpperCase();
      const toCode = (t.toStnCode ?? toSt?.stationCode ?? "")
        .trim()
        .toUpperCase();
      if (!fromCode || !toCode) return;

      const fc = focusTravelClass?.trim().toUpperCase();
      const isAcClass = (c: string) => !["SL", "2S", "GN", "FC"].includes(c.toUpperCase());
      let baseClasses = t.avlClasses && t.avlClasses.length > 0 ? t.avlClasses : undefined;
      if (acOnly && baseClasses) {
        baseClasses = baseClasses.filter(isAcClass);
      }

      const avlClassesForRequest =
        fc && fc.length > 0
          ? [fc]
          : baseClasses;

      setAltForTrain(t.trainNumber);
      setAltTrainName(t.trainName?.trim() ? t.trainName.trim() : null);
      setAltAvlClasses(avlClassesForRequest);
      setAltLoading(true);
      setAltError(null);
      setAltResult(null);
      setAltProgress([]);

      trackAnalyticsEvent({
        name: "alternate_paths_popup_viewed",
        properties: {
          train_number: t.trainNumber,
          from_code: fromCode,
          to_code: toCode,
          journey_date: journeyDate,
        },
      });

      const body = JSON.stringify({
        trainNumber: t.trainNumber,
        from: fromCode,
        to: toCode,
        date: journeyDate,
        quota: "GN",
        ...(avlClassesForRequest && avlClassesForRequest.length > 0
          ? { avlClasses: avlClassesForRequest }
          : {}),
      });

      try {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/booking-v2/alternate-paths/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );

        if (!resp.ok || !resp.body) {
          let msg = `Request failed (${resp.status})`;
          try {
            const j = (await resp.json()) as { message?: string };
            if (j.message) msg = j.message;
          } catch {
            /* ignore */
          }
          setAltError(msg);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as {
                type: string;
                event?: AlternatePathProgressEvent;
                data?: AlternatePathsResponse;
                message?: string;
              };
              if (msg.type === "progress" && msg.event) {
                setAltProgress((prev) => [...prev, msg.event!]);
              } else if (msg.type === "result" && msg.data) {
                setAltResult(msg.data);
                trackAnalyticsEvent({
                  name: "alternate_paths_popup_loaded",
                  properties: {
                    train_number: t.trainNumber,
                    from_code: fromCode,
                    to_code: toCode,
                    journey_date: journeyDate,
                    success: true,
                  },
                });
              } else if (msg.type === "error") {
                setAltError(msg.message ?? "Unknown error");
                trackAnalyticsEvent({
                  name: "alternate_paths_popup_loaded",
                  properties: {
                    train_number: t.trainNumber,
                    from_code: fromCode,
                    to_code: toCode,
                    journey_date: journeyDate,
                    success: false,
                  },
                });
              }
            } catch {
              /* malformed line — skip */
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setAltError(msg);
      } finally {
        setAltLoading(false);
      }
    },
    [fromSt, toSt, journeyDate, onBlockedSearchAttempt],
  );

  /** Flat list of display items: each is a single leg card or a collapsed "no tickets" span. */
  const alternatePathDisplayItems = useMemo(
    () =>
      altResult?.legs.length
        ? buildAlternatePathDisplayItems(altResult.legs)
        : [],
    [altResult],
  );

  const journeyDateInputId = useId();

  useEffect(() => {
    void import("flowbite").then((fb) => {
      if (typeof fb.initFlowbite === "function") fb.initFlowbite();
    });
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <div className="sticky top-0 z-20">
        <header
          className="border-b border-slate-100 bg-white/95 backdrop-blur-sm"
          role="banner"
        >
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-blue-600"
            >
              LastBerth
            </Link>
          </div>
        </header>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:max-w-4xl">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            We find you seats in{" "}
            <span className="text-blue-600">WL/Regret Trains</span>
          </h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            Find the best seat available throughout your journey in the train
            you want to travel
          </p>
        </header>

        <div className="mb-8">
          <h2 className="sr-only">Journey search</h2>
          <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50/80 sm:flex-row sm:items-stretch sm:overflow-visible">
            <StationFieldSimple
              label="From"
              query={fromQ}
              onUserType={(q) => {
                setFromQ(q);
                setFromSt(null);
              }}
              value={fromSt}
              onSelect={(s) => {
                setFromSt(s);
                setFromQ(s.stationName);
                trackAnalyticsEvent({
                  name: "search_from_selected",
                  properties: { from_code: s.stationCode, from_name: s.stationName },
                });
              }}
              suggestions={fromSuggest}
              loading={fromLoad}
              pendingDebounce={fromQ !== fromDeb && fromQ.length >= 2}
              open={fromOpen}
              onOpenChange={openFrom}
              suggestError={fromSuggestError}
            />
            <StationFieldSimple
              label="To"
              query={toQ}
              onUserType={(q) => {
                setToQ(q);
                setToSt(null);
              }}
              value={toSt}
              onSelect={(s) => {
                setToSt(s);
                setToQ(s.stationName);
                trackAnalyticsEvent({
                  name: "search_to_selected",
                  properties: { to_code: s.stationCode, to_name: s.stationName },
                });
              }}
              suggestions={toSuggest}
              loading={toLoad}
              pendingDebounce={toQ !== toDeb && toQ.length >= 2}
              open={toOpen}
              onOpenChange={openTo}
              suggestError={toSuggestError}
            />
            <div className="min-w-0 flex-1 border-t border-gray-200 bg-white px-3 py-2.5 sm:border-t-0 sm:border-r sm:py-2">
              <label
                htmlFor={journeyDateInputId}
                className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-blue-600 sm:h-4 sm:w-4"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
                  />
                </svg>
                Departure date
              </label>
              <JourneyDatePicker
                id={journeyDateInputId}
                value={journeyDate}
                onChange={(ymd) => {
                  setJourneyDate(ymd);
                  trackAnalyticsEvent({
                    name: "search_date_selected",
                    properties: { journey_date: ymd },
                  });
                }}
              />
            </div>
            <div className="flex items-stretch border-t border-gray-200 p-2 sm:border-t-0 sm:p-0">
              <button
                type="button"
                onClick={() => {
                  trackAnalyticsEvent({
                    name: "search_tickets_clicked",
                    properties: {
                      from_code: fromSt?.stationCode,
                      to_code: toSt?.stationCode,
                      journey_date: journeyDate ?? undefined,
                    },
                  });
                  void runSearch();
                }}
                disabled={searchLoading}
                className="inline-flex w-full items-center justify-center rounded-b-xl bg-blue-600 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/35 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-[128px] sm:rounded-b-none sm:rounded-r-xl sm:px-5 sm:py-0 sm:text-base"
              >
                {searchLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Searching
                  </span>
                ) : (
                  "Search trains"
                )}
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 px-1">
            <input
              type="checkbox"
              id="acTicketsOnly"
              checked={acOnly}
              onChange={(e) => setAcOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
            <label htmlFor="acTicketsOnly" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
              AC tickets only
            </label>
          </div>
        </div>

        {searchError && (
          <div
            className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z" />
            </svg>
            <span>{searchError}</span>
          </div>
        )}
        {hasSearched &&
          !searchLoading &&
          !searchError &&
          trains.length === 0 && (
            <div
              className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700"
              role="status"
            >
              No trains found for this route on the selected date.
            </div>
          )}

        <ul className="space-y-5" role="list" aria-label="Train results">
          {trains.map((t) => (
            <li
              key={`${t.trainNumber}-${t.departureTime}`}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-md transition-shadow hover:shadow-lg"
            >
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {t.trainNumber} {t.trainName}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span className="font-semibold">
                    {formatTimeAmPm(t.departureTime) ?? "—"} {t.fromStnCode}
                  </span>
                  <span className="text-gray-400">
                    {formatDurationMinutes(t.duration)}
                  </span>
                  <span className="font-semibold">
                    {formatTimeAmPm(t.arrivalTime) ?? "—"} {t.toStnCode}
                  </span>
                </div>
              </div>

              <div className="mt-3 -mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-min gap-2 px-1">
                  {(t.avlClasses ?? []).filter(c => !acOnly || !["SL", "2S", "GN", "FC"].includes(c.toUpperCase())).map((cls) => {
                    const gn = t.availabilityCache?.[cls];
                    const line =
                      gn?.availabilityDisplayName ?? gn?.railDataStatus ?? "—";
                    const statusCls = gn
                      ? chipGeneralStatusClass(line)
                      : undefined;
                    const bookable = gn ? isIrctcDirectBookable(gn) : false;
                    const irctcHref =
                      fromSt && toSt
                        ? irctcBookingRedirect({
                            from: fromSt.stationCode,
                            to: toSt.stationCode,
                            trainNo: t.trainNumber,
                            classCode: cls,
                          })
                        : "https://www.irctc.co.in/eticketing/login";
                    const chipShell = cn(
                      "min-w-[100px] shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs",
                    );

                    const chipBody = (
                      <>
                        <div className="font-bold text-gray-900">{cls}</div>
                        {gn && (
                          <div className="mt-1 text-gray-700">
                            <div className="text-[10px] uppercase text-gray-500">
                              General
                            </div>
                            <div
                              className={cn(
                                statusCls ?? "font-medium text-gray-900",
                              )}
                            >
                              {line}
                            </div>
                            {gn.fare != null && (
                              <div className="font-semibold text-gray-900">
                                ₹{gn.fare}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );

                    return (
                      <div
                        key={cls}
                        className="flex min-w-[100px] shrink-0 flex-col items-stretch gap-1.5"
                      >
                        {bookable && gn ? (
                          <a
                            href={irctcHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              chipShell,
                              "block text-left text-inherit no-underline hover:bg-gray-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40",
                            )}
                          >
                            {chipBody}
                          </a>
                        ) : (
                          <div className={chipShell}>{chipBody}</div>
                        )}
                        {!bookable && (
                          <button
                            type="button"
                            className="rounded-md bg-blue-600 px-2 py-1.5 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={
                              altLoading && altForTrain === t.trainNumber
                            }
                            onClick={() => void findAlternates(t, cls)}
                          >
                            Find seats
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void findAlternates(t)}
                  disabled={altLoading && altForTrain === t.trainNumber}
                  className={cn(
                    "inline-flex items-center rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white focus:outline-none focus:ring-4 focus:ring-blue-500/25",
                    altLoading &&
                      altForTrain === t.trainNumber &&
                      "cursor-wait opacity-60",
                  )}
                >
                  {altLoading && altForTrain === t.trainNumber
                    ? "Finding…"
                    : "Find best available seats"}
                </button>
              </div>
            </li>
          ))}
        </ul>



        {(altResult || altError || (altLoading && altForTrain)) && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
            role="presentation"
            onClick={() => {
              if (!altLoading) {
                setAltResult(null);
                setAltError(null);
                setAltForTrain(null);
                setAltTrainName(null);
                setAltAvlClasses(undefined);
              }
            }}
          >
            <div
              className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl sm:border sm:border-gray-200 sm:shadow-2xl"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={altAlternatePathCaptureRef}
                className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"
              >
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
                    {isAdminUser && (
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 md:hidden"
                        aria-label="Share journey as image (opens share sheet — choose WhatsApp)"
                        disabled={altShareBusy}
                        onClick={() => void shareAlternatePathScreenshot()}
                      >
                        {altShareBusy ? "Sharing…" : "Share"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      onClick={() => {
                        setAltResult(null);
                        setAltError(null);
                        setAltForTrain(null);
                        setAltTrainName(null);
                        setAltAvlClasses(undefined);
                      }}
                      aria-label="Close"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                </div>
              {altLoading && (
                <AlternatePathProgressFeed
                  events={altProgress}
                  from={fromSt?.stationCode ?? ""}
                  to={toSt?.stationCode ?? ""}
                />
              )}
              {altError && <p className="text-sm text-red-700">{altError}</p>}
              {altResult && (
                <div className="space-y-3 text-sm">
                  {/* Fare summary banner */}
                  {altResult.isComplete && altResult.totalFare != null && (
                    <div className="rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/70 border border-slate-200 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total fare</p>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-3xl">
                          ₹{altResult.totalFare.toFixed(0)}
                        </span>
                        
                        {directFares.length > 0 && (
                          <span className="text-xs text-slate-500 font-medium ml-1">
                            vs direct waitlist:{' '}
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
                        Full journey covered in {altResult.legCount} confirmed ticket{altResult.legCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  )}
                  {!altResult.isComplete &&
                    altResult.totalFare != null &&
                    altResult.legs.some((l) => l.segmentKind === "confirmed") && (
                      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-blue-100/70 border border-blue-200 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Confirmed tickets fare</p>
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
                        Could not build a full path to your destination with the
                        current search.
                      </p>
                    )}

                  {/* Admin debug trace */}
                  {isAdminUser &&
                    altResult.debugLog &&
                    altResult.debugLog.length > 0 && (
                      <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                          Step-by-step debug trace ({altResult.debugLog.length}{" "}
                          lines)
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
                      const countStationsBetween = (fromCode: string, toCode: string): number | null => {
                        const route = altResult.stationCodesOnRoute;
                        if (!route || route.length === 0) return null;
                        const f = fromCode.trim().toUpperCase();
                        const t = toCode.trim().toUpperCase();
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
                          ? (leg.confirmedClassOptions && leg.confirmedClassOptions.length > 0
                              ? leg.confirmedClassOptions
                              : [{
                                  travelClass: leg.travelClass ?? "SL",
                                  railDataStatus: leg.railDataStatus ?? null,
                                  availablityStatus: leg.availablityStatus ?? null,
                                  predictionPercentage: leg.predictionPercentage ?? null,
                                  availabilityDisplayName: leg.availabilityDisplayName ?? null,
                                  fare: leg.fare ?? null,
                                }])
                          : [];

                        return (
                          <li key={i} className="relative flex gap-0">
                            {/* Timeline connector */}
                            <div className="flex w-8 shrink-0 flex-col items-center sm:w-10">
                              <span
                                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums sm:h-8 sm:w-8 sm:text-xs ${
                                  isConfirmed
                                    ? "bg-emerald-600 text-white ring-2 ring-emerald-200"
                                    : "bg-amber-500 text-white ring-2 ring-amber-200"
                                }`}
                              >
                                {stepIndex}
                              </span>
                              {!isLast && (
                                <div className="w-0.5 flex-1 bg-gray-200" />
                              )}
                            </div>
                            {/* Card */}
                            <div className={`mb-3 min-w-0 flex-1 overflow-hidden rounded-lg border ${
                              isConfirmed
                                ? "border-emerald-200 bg-white"
                                : "border-amber-200/80 bg-amber-50/40"
                            }`}>
                              {/* Leg header */}
                              <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:px-4 ${
                                isConfirmed
                                  ? "border-b border-emerald-100 bg-emerald-50/80"
                                  : "border-b border-amber-200/60 bg-amber-100/40"
                              }`}>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                  isConfirmed
                                    ? "bg-emerald-600 text-white"
                                    : "bg-amber-500 text-white"
                                }`}>
                                  Leg {stepIndex} of {stepTotal}
                                </span>
                                <span className="font-bold text-gray-900 tabular-nums">
                                  {leg.from} → {leg.to}
                                </span>
                                {timeLine && (
                                  <span className="text-xs tabular-nums text-gray-500">
                                    {timeLine}
                                    {leg.durationMinutes != null && (
                                      <span className="text-gray-400">
                                        {" · "}{formatDurationMinutes(leg.durationMinutes)}
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
                                            {opt.availabilityDisplayName ?? opt.railDataStatus ?? "Available"}
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
                                  <span className="text-sm font-semibold text-amber-800">
                                    {leg.availabilityDisplayName ? `Waitlisted (${leg.availabilityDisplayName})` : "No tickets available"}
                                  </span>
                                  <CompactLegChartCta
                                    trainNumber={altResult.trainNumber}
                                    trainName={altTrainName}
                                    journeyDate={journeyDate ?? ""}
                                    legFrom={leg.from}
                                    legTo={leg.to}
                                    classCode={leg.travelClass ?? altAvlClasses?.[0] ?? "SL"}
                                  />
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      }

                      // Collapsed unavailable span (≥2 chained check_realtime legs)
                      const timingSummary = collapsedAlternatePathTimingSummary(item.legs);
                      const stationsBetween = countStationsBetween(item.from, item.to);
                      return (
                        <li key={i} className="relative flex gap-0">
                          {/* Timeline connector */}
                          <div className="flex w-8 shrink-0 flex-col items-center sm:w-10">
                            <span
                              className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold tabular-nums text-white ring-2 ring-amber-200 sm:h-8 sm:w-8 sm:text-xs"
                            >
                              {stepIndex}
                            </span>
                            {!isLast && (
                              <div className="w-0.5 flex-1 bg-gray-200" />
                            )}
                          </div>
                          {/* Card */}
                          <div className="mb-3 min-w-0 flex-1 overflow-hidden rounded-lg border border-amber-200/80 bg-white">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-200/60 bg-amber-50/60 px-3 py-2 sm:px-4">
                              <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                                Leg {stepIndex} of {stepTotal}
                              </span>
                              <span className="font-bold text-gray-900 tabular-nums">
                                {item.from} → {item.to}
                              </span>
                              {stationsBetween != null && (
                                <span className="text-xs text-gray-500">
                                  ({stationsBetween} station{stationsBetween !== 1 ? "s" : ""} between)
                                </span>
                              )}
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
                                {item.legs[0]?.availabilityDisplayName ? `Waitlisted (${item.legs[0].availabilityDisplayName})` : "No tickets available"}
                              </span>
                              <CompactLegChartCta
                                trainNumber={altResult.trainNumber}
                                trainName={altTrainName}
                                journeyDate={journeyDate ?? ""}
                                legFrom={item.from}
                                legTo={item.to}
                                classCode={altAvlClasses?.[0] ?? "SL"}
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
            </div>
          </div>
        )}
      </div>
      <IstRailMaintenanceModal
        open={maintenanceModalOpen}
        onClose={dismissMaintenanceModal}
        minutesDisplay={displayMinutes}
      />
    </div>
  );
}
