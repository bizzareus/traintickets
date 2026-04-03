"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { partitionAlternatePathLegsForModal } from "@/lib/bookingV2AlternatePathsDisplay";
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
import { JourneyDatePicker } from "@/components/booking-v2/JourneyDatePicker";
import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";
import { cn } from "@/lib/utils";

const MONITOR_CONTACT_STORAGE_KEY = "lastBerth_monitor_contact";

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
  /** Set from IRCTC schedule when the API includes leg timing (HH:MM). */
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
};

type AlternatePathsResponse = {
  trainNumber: string;
  legs: AlternateLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  remainderMergedSchedule?: {
    from: string;
    to: string;
    departureTime: string | null;
    arrivalTime: string | null;
    durationMinutes: number | null;
  } | null;
  debugLog?: string[];
};

function AlternatePathLegListItem({
  leg,
  trainNumber,
  stepIndex,
  stepTotal,
}: {
  leg: AlternateLeg;
  trainNumber: string;
  /** 1-based position in the journey breakdown (e.g. 1 of 3). */
  stepIndex: number;
  stepTotal: number;
}) {
  const isConfirmed = leg.segmentKind === "confirmed";
  const bookHref = irctcBookingRedirect({
    from: leg.from,
    to: leg.to,
    trainNo: trainNumber,
    classCode: leg.travelClass ?? "SL",
  });
  const checkHref = irctcBookingRedirect({
    from: leg.from,
    to: leg.to,
    trainNo: trainNumber,
    classCode: "SL",
  });

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
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p className="text-2xl font-extrabold leading-tight tracking-tight text-emerald-950 tabular-nums">
                  {leg.availabilityDisplayName ?? leg.railDataStatus ?? "Available"}
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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-lg font-bold tracking-tight text-gray-900">{leg.from}</span>
                <span className="text-sm font-medium text-gray-400" aria-hidden="true">
                  →
                </span>
                <span className="text-lg font-bold tracking-tight text-gray-900">{leg.to}</span>
              </div>
              <AlternatePathLegScheduleLine leg={leg} />
              {leg.fare != null && (
                <p className="mt-3 text-xl font-bold text-gray-900">₹{leg.fare.toFixed(0)}</p>
              )}
              <a
                href={bookHref}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-bold text-white shadow-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:min-w-[220px]"
                aria-label={`Book IRCTC ticket from ${leg.from} to ${leg.to}`}
              >
                Book
              </a>
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
                <span className="text-lg font-bold tracking-tight text-gray-900">{leg.from}</span>
                <span className="text-sm font-medium text-gray-400" aria-hidden="true">
                  →
                </span>
                <span className="text-lg font-bold tracking-tight text-gray-900">{leg.to}</span>
              </div>
              <AlternatePathLegScheduleLine leg={leg} />
              {(leg.availabilityDisplayName ?? leg.railDataStatus) && (
                <p className="mt-3 text-sm text-gray-700">
                  Last check: {leg.availabilityDisplayName ?? leg.railDataStatus}
                </p>
              )}
              <a
                href={checkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="border-blue-600 text-blue-600 hover:bg-blue-50 mt-4 inline-flex w-full items-center justify-center rounded-lg border-2 bg-white px-4 py-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:min-w-[200px]"
                aria-label={`Open IRCTC for ${leg.from} to ${leg.to}`}
              >
                Check live on IRCTC
              </a>
            </>
          )}
        </div>
      </div>
    </li>
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
}: {
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  legFrom: string;
  legTo: string;
  monitorClassCode: string;
  /** When set and equal to `legTo`, hide IRCTC composition-error lines at destination (not useful for where you alight). */
  journeyDestinationCode?: string | null;
}) {
  const [metaFrom, setMetaFrom] = useState<StationChartMetaItem | null>(null);
  const [metaTo, setMetaTo] = useState<StationChartMetaItem | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [monitorSubmitting, setMonitorSubmitting] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorSuccessCopy, setMonitorSuccessCopy] = useState<string | null>(null);

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

    const fetchMeta = (sourceStation: string) =>
      apiClient.post<{ stations: StationChartMetaItem[] }>(
        "/api/train-composition/stations-meta",
        {
          trainNumber: trainNumber.trim(),
          journeyDate: journeyDate.trim(),
          sourceStation,
          refreshFromIrctc: true,
        },
        { timeout: 120_000 },
      );

    const run = async () => {
      const parts: string[] = [];
      try {
        if (sameStation) {
          const r = await fetchMeta(fromCode);
          if (cancel) return;
          const row = r.data?.stations?.[0] ?? null;
          setMetaFrom(row);
          setMetaTo(row);
        } else {
          const [a, b] = await Promise.allSettled([fetchMeta(fromCode), fetchMeta(toCode)]);
          if (cancel) return;
          if (a.status === "fulfilled") {
            setMetaFrom(a.value.data?.stations?.[0] ?? null);
          } else {
            setMetaFrom(null);
            parts.push(`Origin (${fromCode}): ${extractAxiosMessage(a.reason)}`);
          }
          if (b.status === "fulfilled") {
            setMetaTo(b.value.data?.stations?.[0] ?? null);
          } else {
            setMetaTo(null);
            parts.push(`Destination (${toCode}): ${extractAxiosMessage(b.reason)}`);
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
  }, [trainNumber, journeyDate, legFrom, legTo]);

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
    return destChart.lines.filter(
      (line) => !/^\s*IRCTC\s+status:/i.test(line),
    );
  }, [destChart.lines, journeyDestinationCode, legTo]);
  const sameLegEndpoints =
    legFrom.trim().toUpperCase() === legTo.trim().toUpperCase() && legFrom.trim().length > 0;

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
      <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
        {metaLoading && (
          <p className="font-medium text-amber-900">
            Loading IRCTC chart preparation times for {legFrom.trim().toUpperCase()}
            {sameLegEndpoints ? "" : ` and ${legTo.trim().toUpperCase()}`}…
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
              <p className="font-semibold leading-snug text-amber-950">{originChart.title}</p>
              {originChart.lines.map((line, i) => (
                <p key={i} className="leading-snug text-amber-950/95">
                  {line}
                </p>
              ))}
            </div>
            {!sameLegEndpoints && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/75">Destination</p>
                <p className="font-semibold leading-snug text-amber-950">{destChart.title}</p>
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
        <p className="text-sm font-semibold text-gray-900">Get availability alerts</p>
        <p className="mt-1 text-xs text-gray-600">
          We can watch chart runs and this leg ({legFrom} → {legTo}) and notify you if seats open up. Uses the same
          monitoring pipeline as the main booking page.
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
          {monitorSubmitting ? "Subscribing…" : "Subscribe to alerts"}
        </button>
        {monitorError && <p className="mt-2 text-sm text-red-700">{monitorError}</p>}
        {monitorSuccessCopy && (
          <p className="mt-2 text-sm font-medium text-emerald-800">{monitorSuccessCopy}</p>
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
  const dep = leg.departureTime?.trim() || null;
  const arr = leg.arrivalTime?.trim() || null;
  const hasDuration =
    leg.durationMinutes != null && !Number.isNaN(leg.durationMinutes);
  const hasClocks = Boolean(dep) || Boolean(arr);
  if (!hasClocks && !hasDuration) return null;

  const timePart =
    dep && arr ? `${dep} → ${arr}` : dep ? `Dep ${dep}` : arr ? `Arr ${arr}` : null;
  const durLabel = formatDurationMinutes(leg.durationMinutes ?? undefined);

  return (
    <p className="mt-1.5 text-sm tabular-nums text-gray-600">
      {timePart}
      {hasDuration && (
        <span className="text-gray-500">{timePart ? ` · ${durLabel}` : durLabel}</span>
      )}
    </p>
  );
}

function collapsedAlternatePathTimingSummary(legs: AlternateLeg[]): {
  timePart: string | null;
  durationLabel: string | null;
} | null {
  if (legs.length === 0) return null;
  const dep = legs[0]?.departureTime?.trim() || null;
  const arr = legs[legs.length - 1]?.arrivalTime?.trim() || null;
  const allDur = legs.every(
    (l) => l.durationMinutes != null && !Number.isNaN(l.durationMinutes as number),
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

/** Prefer API schedule for merged realtime OD; else aggregate per-leg times from collapsed legs. */
function collapsedRemainderTimingDisplay(
  alt: AlternatePathsResponse,
  collapsedLegs: AlternateLeg[],
): { timePart: string | null; durationLabel: string | null } | null {
  const m = alt.remainderMergedSchedule;
  if (m) {
    const dep = m.departureTime?.trim() || null;
    const arr = m.arrivalTime?.trim() || null;
    const hasDur = m.durationMinutes != null && !Number.isNaN(m.durationMinutes);
    let timePart: string | null = null;
    if (dep && arr) timePart = `${dep} → ${arr}`;
    else if (dep) timePart = `Dep ${dep}`;
    else if (arr) timePart = `Arr ${arr}`;
    const durationLabel = hasDur ? formatDurationMinutes(m.durationMinutes ?? undefined) : null;
    if (timePart || durationLabel) return { timePart, durationLabel };
  }
  return collapsedAlternatePathTimingSummary(collapsedLegs);
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Deterministic label (UTC date parts) to avoid SSR/client hydration mismatch. */
function formatDateLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, mo, d] = ymd.split("-").map(Number);
  const w = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${w[dt.getUTCDay()]}, ${months[mo - 1]} ${String(d).padStart(2, "0")}`;
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
    if (ax.response?.status === 400) return "Type at least 2 characters to search.";
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
  const displayText = value && !open ? `${value.stationCode} - ${value.stationName}` : query;
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
            d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.25 2.25 0 00-1.227-1.294l-.5-.166a.75.75 0 01-.564-.708v-.158a.75.75 0 01.474-.696l.88-.292a2.25 2.25 0 011.692 0l11.26 3.758a2.25 2.25 0 011.692 0l.88.292a.75.75 0 01.474.696v.158a.75.75 0 01-.564.708l-.5.166a2.25 2.25 0 00-1.227 1.294 17.902 17.902 0 00-3.213 9.193c.04.62-.469 1.124-1.09 1.124H18.75"
          />
        </svg>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          className="block min-h-11 w-full rounded-md border border-gray-300 bg-gray-50 py-2.5 pl-2 pr-8 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 sm:min-h-12 sm:py-3"
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
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
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
            <li className="px-4 py-3 text-sm text-gray-500">No stations match. Try another spelling.</li>
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
                <span className="font-semibold text-gray-900">{s.stationCode}</span>
                <span className="text-gray-600"> — {s.stationName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
  useEffect(() => {
    setJourneyDate(todayYmd());
  }, []);
  const [trains, setTrains] = useState<TrainListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [altForTrain, setAltForTrain] = useState<string | null>(null);
  const [altTrainName, setAltTrainName] = useState<string | null>(null);
  const [altAvlClasses, setAltAvlClasses] = useState<string[] | undefined>();
  const [altLoading, setAltLoading] = useState(false);
  const [altResult, setAltResult] = useState<AlternatePathsResponse | null>(null);
  const [altError, setAltError] = useState<string | null>(null);

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
      .get<{ data?: { stationList?: StationRow[] } }>("/api/booking-v2/stations/suggest", {
        params: { q: fromDeb, searchString: fromDeb },
      })
      .then((r) => {
        if (!c) {
          setFromSuggest(r.data?.data?.stationList ?? []);
          setFromSuggestError(null);
        }
      })
      .catch((e) => {
        if (!c) {
          setFromSuggest([]);
          setFromSuggestError(extractAxiosMessage(e));
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
      .get<{ data?: { stationList?: StationRow[] } }>("/api/booking-v2/stations/suggest", {
        params: { q: toDeb, searchString: toDeb },
      })
      .then((r) => {
        if (!c) {
          setToSuggest(r.data?.data?.stationList ?? []);
          setToSuggestError(null);
        }
      })
      .catch((e) => {
        if (!c) {
          setToSuggest([]);
          setToSuggestError(extractAxiosMessage(e));
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
    if (!fromSt || !toSt) {
      setSearchError("Select both stations.");
      return;
    }
    if (!journeyDate) {
      setSearchError("Pick a journey date.");
      return;
    }
    setSearchError(null);
    setHasSearched(true);
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
  }, [fromSt, toSt, journeyDate]);

  const findAlternates = useCallback(
    async (t: TrainListItem, focusTravelClass?: string) => {
      if (!journeyDate) return;
      /** Alternate-path probes use this train’s run endpoints (e.g. NDLS → CSMT), not only the user’s search pair. */
      const fromCode = (t.fromStnCode ?? fromSt?.stationCode ?? "").trim().toUpperCase();
      const toCode = (t.toStnCode ?? toSt?.stationCode ?? "").trim().toUpperCase();
      if (!fromCode || !toCode) return;

      const fc = focusTravelClass?.trim().toUpperCase();
      const avlClassesForRequest =
        fc && fc.length > 0
          ? [fc]
          : t.avlClasses && t.avlClasses.length > 0
            ? t.avlClasses
            : undefined;

      setAltForTrain(t.trainNumber);
      setAltTrainName(t.trainName?.trim() ? t.trainName.trim() : null);
      setAltAvlClasses(avlClassesForRequest);
      setAltLoading(true);
      setAltError(null);
      setAltResult(null);
      try {
        const r = await apiClient.post<AlternatePathsResponse>("/api/booking-v2/alternate-paths", {
          trainNumber: t.trainNumber,
          from: fromCode,
          to: toCode,
          date: journeyDate,
          quota: "GN",
          ...(avlClassesForRequest && avlClassesForRequest.length > 0
            ? { avlClasses: avlClassesForRequest }
            : {}),
        });
        setAltResult(r.data);
      } catch (e: unknown) {
        let msg = "Request failed";
        if (e && typeof e === "object" && "response" in e) {
          const ax = e as { response?: { data?: { message?: string } } };
          msg = ax.response?.data?.message ?? msg;
        } else if (e instanceof Error) msg = e.message;
        setAltError(msg);
      } finally {
        setAltLoading(false);
      }
    },
    [fromSt, toSt, journeyDate],
  );

  const dateLabel = useMemo(
    () => (journeyDate != null ? formatDateLabel(journeyDate) : "—"),
    [journeyDate],
  );

  const alternatePathLegsPartition = useMemo(() => {
    if (!altResult?.legs.length) return null;
    if (!toSt?.stationCode) {
      return { mode: "flat" as const, legs: altResult.legs };
    }
    return partitionAlternatePathLegsForModal(altResult.legs, toSt.stationCode);
  }, [altResult, toSt]);

  const collapsedRemainderLegs = useMemo(() => {
    if (!altResult || alternatePathLegsPartition?.mode !== "collapsed") return [];
    return altResult.legs.slice(alternatePathLegsPartition.confirmedPrefix.length);
  }, [altResult, alternatePathLegsPartition]);

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
            Find the best seat available throughout your journey in the train you want to travel
          </p>
        </header>

        <div className="mb-8">
          <h2 className="sr-only">Journey search</h2>
          <p className="mb-2 text-sm font-medium text-gray-700 sm:mb-3">
            Where are you travelling?
          </p>
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
              }}
              suggestions={fromSuggest}
              loading={fromLoad}
              pendingDebounce={fromQ !== fromDeb && fromQ.length >= 2}
              open={fromOpen}
              onOpenChange={openFrom}
              suggestError={fromSuggestError}
            />
            <div className="flex shrink-0 items-center justify-center border-gray-200 bg-white px-2 py-2 sm:w-11 sm:flex-col sm:border-x sm:py-0">
              <button
                type="button"
                onClick={swapStations}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-100 sm:h-8 sm:w-8"
                aria-label="Swap from and to stations"
              >
                <svg
                  className="h-5 w-5"
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
                    d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                  />
                </svg>
              </button>
            </div>
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
                onChange={setJourneyDate}
                dateLabel={dateLabel}
              />
            </div>
            <div className="flex items-stretch border-t border-gray-200 p-2 sm:border-t-0 sm:p-0">
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searchLoading}
                className="inline-flex w-full items-center justify-center rounded-b-xl bg-blue-600 px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/35 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-[128px] sm:rounded-b-none sm:rounded-r-xl sm:px-5 sm:py-0 sm:text-sm"
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
                    {t.departureTime ?? "—"} {t.fromStnCode}
                  </span>
                  <span className="text-gray-400">{formatDurationMinutes(t.duration)}</span>
                  <span className="font-semibold">
                    {t.arrivalTime ?? "—"} {t.toStnCode}
                  </span>
                </div>
              </div>

              <div className="mt-3 -mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-min gap-2 px-1">
                  {(t.avlClasses ?? []).map((cls) => {
                    const gn = t.availabilityCache?.[cls];
                    const line =
                      gn?.availabilityDisplayName ??
                      gn?.railDataStatus ??
                      "—";
                    const statusCls = gn ? chipGeneralStatusClass(line) : undefined;
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
                            <div className="text-[10px] uppercase text-gray-500">General</div>
                            <div
                              className={cn(
                                statusCls ?? "font-medium text-gray-900",
                              )}
                            >
                              {line}
                            </div>
                            {gn.fare != null && (
                              <div className="font-semibold text-gray-900">₹{gn.fare}</div>
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
                          <div className={chipShell}>
                            {chipBody}
                          </div>
                        )}
                        {!bookable && (
                          <button
                            type="button"
                            className="rounded-md bg-blue-600 px-2 py-1.5 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={altLoading && altForTrain === t.trainNumber}
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
                    altLoading && altForTrain === t.trainNumber && "cursor-wait opacity-60",
                  )}
                >
                  {altLoading && altForTrain === t.trainNumber ? "Finding…" : "Find best available seats"}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {hasSearched && !searchLoading && !searchError && trains.length === 0 && (
          <div
            className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
            role="status"
            aria-live="polite"
          >
            No trains loaded for this route and date. Try changing stations or the departure date.
          </div>
        )}

        {(altResult || altError || (altLoading && altForTrain)) && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
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
              className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {altLoading
                    ? `Finding best available seats on ${
                        altTrainName?.trim() || altForTrain || "this train"
                      }`
                    : `Best available on ${altTrainName?.trim() || altForTrain || "train"}`}
                </h3>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                  onClick={() => {
                    setAltResult(null);
                    setAltError(null);
                    setAltForTrain(null);
                    setAltTrainName(null);
                    setAltAvlClasses(undefined);
                  }}
                >
                  Close
                </button>
              </div>
              {altLoading && (
                <div
                  className="flex flex-col items-center justify-center gap-4 py-10"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
                    aria-hidden
                  />
                  <span className="sr-only">Finding best available seats, please wait</span>
                </div>
              )}
              {altError && <p className="text-sm text-red-700">{altError}</p>}
              {altResult && (
                <div className="space-y-3 text-sm">
                  {!altResult.isComplete && !altResult.legs.some((l) => l.segmentKind === "check_realtime") && (
                    <p className="rounded-md bg-gray-100 px-3 py-2 text-gray-800">
                      Could not build a full path to your destination with the current search.
                    </p>
                  )}
                  {altResult.isComplete && (
                    <p className="text-gray-900">
                      Full journey covered in {altResult.legCount} confirmed segment
                      {altResult.legCount === 1 ? "" : "s"}.
                      {altResult.totalFare != null && (
                        <>
                          {" "}
                          <span className="font-bold text-gray-950">
                            Total fare (confirmed segments): ₹{altResult.totalFare.toFixed(0)}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  {!altResult.isComplete &&
                    altResult.totalFare != null &&
                    altResult.legs.some((l) => l.segmentKind === "confirmed") && (
                      <p className="text-gray-700">
                        Partial total (confirmed segments only): ₹{altResult.totalFare.toFixed(0)}
                      </p>
                    )}
                  {process.env.NODE_ENV === "development" &&
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
                        <code className="rounded bg-gray-200 px-1">[alternate-paths …]</code>.
                      </p>
                    </details>
                    )}
                  <ol className="list-none space-y-5 pl-0" role="list" aria-label="Journey segments">
                    {alternatePathLegsPartition?.mode === "collapsed" ? (
                      <>
                        {alternatePathLegsPartition.confirmedPrefix.map((leg, i) => {
                          const total =
                            alternatePathLegsPartition.confirmedPrefix.length + 1;
                          return (
                            <AlternatePathLegListItem
                              key={`conf-${i}`}
                              leg={leg}
                              trainNumber={altResult.trainNumber}
                              stepIndex={i + 1}
                              stepTotal={total}
                            />
                          );
                        })}
                        <li className="list-none">
                          <div className="flex gap-3 sm:gap-4">
                            <div className="flex shrink-0 flex-col items-center">
                              <span
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-bold tabular-nums text-amber-950 ring-2 ring-amber-200"
                                aria-hidden
                              >
                                {alternatePathLegsPartition.confirmedPrefix.length + 1}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 rounded-xl border border-amber-200/90 bg-amber-50/40 p-4 shadow-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                                Leg {alternatePathLegsPartition.confirmedPrefix.length + 1} of{" "}
                                {alternatePathLegsPartition.confirmedPrefix.length + 1}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-lg font-bold tracking-tight text-gray-900">
                                  {alternatePathLegsPartition.fromLastConfirmedStopToDestination.from}
                                </span>
                                <span className="text-sm font-medium text-gray-400" aria-hidden="true">
                                  →
                                </span>
                                <span className="text-lg font-bold tracking-tight text-gray-900">
                                  {alternatePathLegsPartition.fromLastConfirmedStopToDestination.to}
                                </span>
                                <span className="inline-flex items-center rounded-full bg-amber-200/80 px-2.5 py-0.5 text-xs font-semibold text-amber-950">
                                  To final destination
                                </span>
                              </div>
                              {(() => {
                                const s = collapsedRemainderTimingDisplay(altResult, collapsedRemainderLegs);
                                if (!s) return null;
                                return (
                                  <p className="mt-1.5 text-sm tabular-nums text-gray-600">
                                    {s.timePart}
                                    {s.durationLabel && (
                                      <span className="text-gray-500">
                                        {s.timePart ? ` · ${s.durationLabel}` : s.durationLabel}
                                      </span>
                                    )}
                                  </p>
                                );
                              })()}
                              <p className="mt-3 text-sm font-medium text-amber-950">
                                There are no tickets available overall.
                              </p>
                              {journeyDate && (
                                <AlternatePathRemainderInsights
                                  trainNumber={altResult.trainNumber}
                                  trainName={altTrainName}
                                  journeyDate={journeyDate}
                                  legFrom={
                                    alternatePathLegsPartition.fromLastConfirmedStopToDestination.from
                                  }
                                  legTo={alternatePathLegsPartition.fromLastConfirmedStopToDestination.to}
                                  monitorClassCode={altAvlClasses?.[0] ?? "SL"}
                                  journeyDestinationCode={toSt?.stationCode}
                                />
                              )}
                            </div>
                          </div>
                        </li>
                      </>
                    ) : (
                      (alternatePathLegsPartition?.legs ?? altResult.legs).map((leg, i, arr) => (
                        <AlternatePathLegListItem
                          key={i}
                          leg={leg}
                          trainNumber={altResult.trainNumber}
                          stepIndex={i + 1}
                          stepTotal={arr.length}
                        />
                      ))
                    )}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
