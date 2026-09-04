"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import {
  isIrctcDirectBookable,
  hasAnyAvailableSeat,
  formatAvailabilityStatus,
} from "@/lib/bookingV2Availability";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import { JourneyDatePicker } from "@/components/booking-v2/JourneyDatePicker";
import dynamic from "next/dynamic";
import { shareDomElementAsPng } from "@/lib/shareDomScreenshot";
import { cn } from "@/lib/utils";
import { useAlternatePaths } from "@/components/booking-v2/useAlternatePaths";
import { useAutoSearchExperiment } from "@/lib/hooks/useAutoSearchExperiment";
import { useTrainSearchV2Experiment } from "@/lib/hooks/useTrainSearchV2Experiment";
import { AutoSearchTrainCard } from "@/components/home/AutoSearchTrainCard";
import { TrainSearchV2ProgressBar } from "@/components/home/TrainSearchV2ProgressBar";
import { TrainSearchV2Card } from "@/components/home/TrainSearchV2Card";
import {
  sortTrainSearchV2,
  type TrainScanMeta,
} from "@/lib/trainSearchV2Sort";
import { TrainChartAlertSection } from "@/components/home/TrainChartAlertSection";
import { HomeBannerAd, HomeSideAd } from "@/components/home/HomeSideAd";
import { useAutoAnimate } from "@formkit/auto-animate/react";

const SearchPnrPanel = dynamic(
  () =>
    import("@/components/booking-v2/SearchPnrPanel").then(
      (m) => m.SearchPnrPanel,
    ),
  {
    loading: () => (
      <div className="flex h-36 items-center justify-center rounded-xl bg-white p-6 shadow-xs border border-gray-200">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    ),
  },
);

const AlternatePathContent = dynamic(() =>
  import("@/components/booking-v2/AlternatePathContent").then(
    (m) => m.AlternatePathContent,
  ),
);

const TrainScheduleBottomSheet = dynamic(() =>
  import("@/components/booking-v2/TrainScheduleBottomSheet").then(
    (m) => m.TrainScheduleBottomSheet,
  ),
);
import type {
  AlternatePathsResponse,
  TrainListItem,
} from "@/components/booking-v2/alternatePathsTypes";
import {
  formatDurationMinutes,
  formatTimeAmPm,
} from "@/components/booking-v2/alternatePathHelpers";

import { Header } from "@/components/Header";
import { HomeSeoContent } from "@/components/HomeSeoContent";
import ChartTimesFinder from "@/app/chart-times/ChartTimesFinder";
import type { HomeStrings } from "@/lib/home/home-langs";

type StationRow = {
  stationCode: string;
  stationName: string;
  city?: string;
  state?: string;
};

type BestTrainScore = {
  originConfirmed: boolean;
  confirmedContiguousStationsFromOrigin: number;
  confirmedContiguousMinutesFromOrigin: number;
  totalConfirmedStations: number;
  totalConfirmedMinutes: number;
  longestConfirmedLegStations: number;
  longestConfirmedLegMinutes: number;
  isComplete: boolean;
  totalFare: number | null;
};

type BestTrainCandidateResult = {
  train: TrainListItem;
  alternatePath: AlternatePathsResponse;
  score: BestTrainScore;
  rankReason: string;
};

type BestTrainSearchResult = {
  from: string;
  to: string;
  date: string;
  acOnly: boolean;
  totalTrainsFound: number;
  candidatesEvaluated: number;
  candidatesSkipped: number;
  results: BestTrainCandidateResult[];
};

type BestTrainProgressEvent =
  | { type: "search_start"; from: string; to: string; date: string }
  | {
      type: "candidates_ready";
      totalTrainsFound: number;
      candidateCount: number;
    }
  | {
      type: "train_started";
      trainNumber: string;
      trainName: string | null;
      index: number;
      total: number;
    }
  | {
      type: "train_done";
      trainNumber: string;
      trainName: string | null;
      index: number;
      total: number;
      result: BestTrainCandidateResult | null;
      skippedReason?: string;
    }
  | { type: "done"; resultCount: number; evaluatedCount: number };

/** One confirmed/realtime leg of a cached best-train path (trimmed subset). */
type CachedBestTrainLeg = {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
  travelClass: string | null;
  fare: number | null;
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes?: number | null;
};

/** Trimmed best-train payload served by GET /best-trains/cached. */
type CachedBestTrain = {
  train: {
    trainNumber: string;
    trainName: string | null;
    departureTime: string | null;
    arrivalTime: string | null;
  };
  legs: CachedBestTrainLeg[];
  /** Station code -> display name for the codes used in `legs` (may be absent on older cache rows). */
  stationNames?: Record<string, string>;
  totalFare: number | null;
  isComplete: boolean;
  rankReason: string;
};

type CachedBestTrainResponse =
  | { cached: true; cachedAt: string; best: CachedBestTrain }
  | { cached: false };

/**
 * Cap the best-train scan at the first N listed trains. Each candidate fans out
 * an expensive per-segment availability scan, so we only send the top few to the
 * backend rather than the entire (often 30–60 train) search result.
 */
const BEST_TRAIN_SCAN_LIMIT = 10;

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

function todayYmd(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
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
  if (e && typeof e === "object") {
    const ax = e as {
      isAxiosError?: boolean;
      response?: { status?: number; data?: { message?: string | string[] } };
      code?: string;
      message?: string;
    };
    // Connection-level failure: no HTTP response ever arrived (axios doesn't
    // even set `response` then), and lib/api.ts already retried. That's the
    // device failing to reach the server — almost always the user's own
    // connection — so say that instead of axios's alarming bare "Network Error".
    if (ax.isAxiosError && !ax.response) {
      if (ax.code === "ECONNABORTED" || ax.code === "ETIMEDOUT") {
        return "The connection timed out. Check your internet and try again.";
      }
      return "You appear to be offline. Check your internet connection and try again.";
    }
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
  placeholder: string;
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
  className?: string;
  compact?: boolean;
}) {
  const {
    label,
    placeholder,
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
    className,
    compact = false,
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
        compact
          ? "relative flex h-full min-w-0 flex-1 flex-col justify-center px-1 py-0"
          : "relative min-w-0 flex-1 border-b border-gray-200 px-3 py-2.5 sm:border-b-0 sm:border-r sm:py-2",
        showList && "z-[55]",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className={cn(
          "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500",
            compact && "mb-0 text-[9px] leading-3",
        )}
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
          name={
            label.toLowerCase().includes("from") ? "fromStation" : "toStation"
          }
          aria-label={label}
          type="text"
          className={cn(
            "block w-full rounded-md border border-gray-300 bg-gray-50 py-3.5 pl-3 pr-8 text-lg font-medium text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 sm:py-4 sm:pl-4 touch-manipulation",
            compact && "h-6 border-0 bg-transparent py-0 pl-0 pr-4 text-sm focus:border-0 focus:ring-0 sm:py-0 sm:pl-0",
          )}
          placeholder={placeholder}
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
                className="block w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none touch-manipulation"
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

function UrlSearchParamsSync({
  onParams,
}: {
  onParams: (
    fromCode: string | null,
    toCode: string | null,
    fromName: string | null,
    toName: string | null,
    dateParam: string | null,
  ) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParams(
      searchParams.get("from"),
      searchParams.get("to"),
      searchParams.get("fromName"),
      searchParams.get("toName"),
      searchParams.get("date"),
    );
  }, [searchParams, onParams]);
  return null;
}

function BookingV2PageContent({ lang, t }: { lang: string; t: HomeStrings }) {
  const autoSearchTriggered = useRef(false);
  const [hasUrlParams, setHasUrlParams] = useState(false);
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

  const openFrom = useCallback((open: boolean) => {
    setFromOpen(open);
  }, []);

  const openTo = useCallback((open: boolean) => {
    setToOpen(open);
  }, []);
  const [journeyDate, setJourneyDate] = useState<string | null>(null);

  const handleUrlParams = useCallback(
    (
      fromCode: string | null,
      toCode: string | null,
      fromName: string | null,
      toName: string | null,
      dateParam: string | null,
    ) => {
      if (fromCode && toCode) {
        const fSt = {
          stationCode: fromCode.toUpperCase(),
          stationName: fromName || fromCode.toUpperCase(),
        };
        const tSt = {
          stationCode: toCode.toUpperCase(),
          stationName: toName || toCode.toUpperCase(),
        };
        setFromSt(fSt);
        setFromQ(
          fromName
            ? `${fromCode.toUpperCase()} - ${fromName}`
            : fromCode.toUpperCase(),
        );
        setToSt(tSt);
        setToQ(
          toName ? `${toCode.toUpperCase()} - ${toName}` : toCode.toUpperCase(),
        );
        setHasUrlParams(true);
      }
      if (dateParam) {
        setJourneyDate(dateParam);
      }
    },
    [],
  );
  const [acOnly, setAcOnly] = useState(false);
  useEffect(() => {
    setJourneyDate(todayYmd());
  }, []);
  const [trains, setTrains] = useState<TrainListItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandSearch, setExpandSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [bestTrainLoading, setBestTrainLoading] = useState(false);
  const [bestTrainError, setBestTrainError] = useState<string | null>(null);
  const [bestTrainResult, setBestTrainResult] =
    useState<BestTrainSearchResult | null>(null);
  const [bestTrainProgress, setBestTrainProgress] = useState<
    BestTrainProgressEvent[]
  >([]);
  // Precomputed best seat served instantly from the route cache (popular routes).
  const [cachedBest, setCachedBest] = useState<{
    best: CachedBestTrain;
    cachedAt: string;
  } | null>(null);
  const [searchType, setSearchType] = useState<"route" | "pnr" | "seat">(
    "route",
  );
  const altAlternatePathCaptureRef = useRef<HTMLDivElement>(null);
  const [altShareBusy, setAltShareBusy] = useState(false);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleTrainNumber, setScheduleTrainNumber] = useState("");
  const [scheduleHighlightFrom, setScheduleHighlightFrom] = useState("");
  const [scheduleHighlightTo, setScheduleHighlightTo] = useState("");

  // Shared alternate-paths engine for the Route tab. The IRCTC nightly
  // maintenance gate is intentionally NOT applied here: route search and
  // alternate paths run on ConfirmTkt + RapidAPI, which stay up during the
  // IRCTC online-charts maintenance window. The gate lives in SeatStatus
  // (Chart Vacancy + Live Seat Tracker), which do hit the online-charts API.
  const alt = useAlternatePaths({ acOnly });
  const {
    altForTrain,
    altTrainName,
    altAvlClasses,
    altLoading,
    altResult,
    altError,
    altProgress,
    setAltResult,
    setAltForTrain,
    setAltTrainName,
  } = alt;

  const { isVariantA } = useAutoSearchExperiment();
  const { isTrainSearchV2 } = useTrainSearchV2Experiment();
  const [failedAutoSearchTrains, setFailedAutoSearchTrains] = useState<
    Set<string>
  >(new Set());
  const [v2DiscoveredEndToEndTrains, setV2DiscoveredEndToEndTrains] = useState<
    Set<string>
  >(new Set());
  const [v2DiscoveredPartialTrains, setV2DiscoveredPartialTrains] = useState<
    Set<string>
  >(new Set());
  const [v2CompletedScans, setV2CompletedScans] = useState<Set<string>>(
    new Set(),
  );
  const [v2ScanMetaMap, setV2ScanMetaMap] = useState<
    Map<string, TrainScanMeta>
  >(new Map());
  const v2TrackedViewKeyRef = useRef<string>("");

  // Smooth layout FLIP animation for train search cards when dynamically re-sorted
  const [v2TrainListAnimateRef] = useAutoAnimate<HTMLUListElement>({
    duration: 400,
    easing: "cubic-bezier(0.25, 1, 0.5, 1)",
  });

  // Reset V2 scan state when search parameters change
  useEffect(() => {
    setV2DiscoveredEndToEndTrains(new Set());
    setV2DiscoveredPartialTrains(new Set());
    setV2CompletedScans(new Set());
    setV2ScanMetaMap(new Map());
  }, [fromSt?.stationCode, toSt?.stationCode, journeyDate, acOnly]);

  // For Train Search V2 experiment:
  // Prioritized multi-tier sorting:
  // 1. Direct IRCTC availability (chronological)
  // 2. End-to-end full split journeys (chronological)
  // 3. Partial split journeys (longest confirmed duration/hours first, then chronological)
  // 4. Waitlisted only / in-flight scan (chronological)
  const displayTrains = useMemo(() => {
    if (!isTrainSearchV2) return trains;
    return sortTrainSearchV2(trains, {
      acOnly,
      scanMetaMap: v2ScanMetaMap,
      endToEndTrains: v2DiscoveredEndToEndTrains,
      partialTrains: v2DiscoveredPartialTrains,
    });
  }, [
    trains,
    isTrainSearchV2,
    acOnly,
    v2ScanMetaMap,
    v2DiscoveredEndToEndTrains,
    v2DiscoveredPartialTrains,
  ]);

  const v2AutoScanTrainNumbers = useMemo(() => {
    if (!isTrainSearchV2) return new Set<string>();
    const set = new Set<string>();
    for (const t of trains) {
      if (!hasAnyAvailableSeat(t, acOnly)) {
        set.add(t.trainNumber);
      }
    }
    return set;
  }, [trains, isTrainSearchV2, acOnly]);

  const v2Stats = useMemo(() => {
    let directAvailableCount = 0;
    let waitlistedCount = 0;
    for (const t of trains) {
      if (hasAnyAvailableSeat(t, acOnly)) {
        directAvailableCount++;
      } else {
        waitlistedCount++;
      }
    }
    return {
      directAvailableCount,
      waitlistedCount,
      totalToScan: waitlistedCount,
    };
  }, [trains, acOnly]);

  const v2TotalDiscoveredCount = useMemo(() => {
    return new Set([
      ...v2DiscoveredEndToEndTrains,
      ...v2DiscoveredPartialTrains,
    ]).size;
  }, [v2DiscoveredEndToEndTrains, v2DiscoveredPartialTrains]);

  const handleV2SeatsDiscovered = useCallback(
    (
      trainNumber: string,
      isComplete?: boolean,
      confirmedDurationMinutes?: number,
    ) => {
      setV2ScanMetaMap((prev) => {
        const next = new Map(prev);
        const prevMeta = next.get(trainNumber);
        next.set(trainNumber, {
          isComplete: Boolean(isComplete || prevMeta?.isComplete),
          confirmedDurationMinutes: Math.max(
            prevMeta?.confirmedDurationMinutes ?? 0,
            confirmedDurationMinutes ?? 0,
          ),
        });
        return next;
      });

      if (isComplete) {
        setV2DiscoveredEndToEndTrains((prev) =>
          prev.has(trainNumber) ? prev : new Set(prev).add(trainNumber),
        );
        setV2DiscoveredPartialTrains((prev) => {
          if (!prev.has(trainNumber)) return prev;
          const next = new Set(prev);
          next.delete(trainNumber);
          return next;
        });
      } else {
        setV2DiscoveredPartialTrains((prev) =>
          prev.has(trainNumber) ? prev : new Set(prev).add(trainNumber),
        );
      }
    },
    [],
  );

  const handleV2ScanComplete = useCallback(
    (
      trainNumber: string,
      hasTickets: boolean,
      isComplete?: boolean,
      confirmedDurationMinutes?: number,
    ) => {
      setV2CompletedScans((prev) => new Set(prev).add(trainNumber));
      if (hasTickets) {
        setV2ScanMetaMap((prev) => {
          const next = new Map(prev);
          const prevMeta = next.get(trainNumber);
          next.set(trainNumber, {
            isComplete: Boolean(isComplete || prevMeta?.isComplete),
            confirmedDurationMinutes: Math.max(
              prevMeta?.confirmedDurationMinutes ?? 0,
              confirmedDurationMinutes ?? 0,
            ),
          });
          return next;
        });

        if (isComplete) {
          setV2DiscoveredEndToEndTrains((prev) => new Set(prev).add(trainNumber));
          setV2DiscoveredPartialTrains((prev) => {
            if (!prev.has(trainNumber)) return prev;
            const next = new Set(prev);
            next.delete(trainNumber);
            return next;
          });
        } else {
          setV2DiscoveredPartialTrains((prev) => new Set(prev).add(trainNumber));
        }
      }
    },
    [],
  );

  const v2IsLoading = useMemo(() => {
    if (!isTrainSearchV2 || v2Stats.totalToScan === 0) return false;
    return v2CompletedScans.size < v2Stats.totalToScan;
  }, [isTrainSearchV2, v2CompletedScans.size, v2Stats.totalToScan]);

  useEffect(() => {
    if (
      isTrainSearchV2 &&
      trains.length > 0 &&
      fromSt?.stationCode &&
      toSt?.stationCode &&
      journeyDate
    ) {
      const searchKey = `${fromSt.stationCode}-${toSt.stationCode}-${journeyDate}-${acOnly}`;
      if (v2TrackedViewKeyRef.current === searchKey) return;
      v2TrackedViewKeyRef.current = searchKey;

      trackAnalyticsEvent({
        name: "train_search_v2_viewed",
        properties: {
          from_code: fromSt.stationCode,
          to_code: toSt.stationCode,
          journey_date: journeyDate,
          total_trains: trains.length,
          direct_available_count: v2Stats.directAvailableCount,
          waitlisted_count: v2Stats.waitlistedCount,
        },
      });
    }
  }, [isTrainSearchV2, trains.length, fromSt?.stationCode, toSt?.stationCode, journeyDate, acOnly, v2Stats]);

  const autoSearchEligibleTrainNumbers = useMemo(() => {
    const set = new Set<string>();
    let count = 0;
    for (const t of trains) {
      if (!hasAnyAvailableSeat(t, acOnly)) {
        count++;
        if (count <= 3) {
          set.add(t.trainNumber);
        }
      }
    }
    return set;
  }, [trains, acOnly]);

  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
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

  const altTrainObj = useMemo(() => {
    return trains.find((t) => t.trainNumber === altForTrain);
  }, [trains, altForTrain]);

  const directFares = useMemo(() => {
    const fares: { cls: string; fare: number }[] = [];
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

  const runSearch = useCallback(async () => {
    if (!fromSt || !toSt) {
      setSearchError("Select both stations.");
      return;
    }
    if (!journeyDate) {
      setSearchError("Pick a journey date.");
      return;
    }
    setExpandSearch(false);
    setHasSearched(true);
    setSearchError(null);
    setSearchLoading(true);
    if (!hasSearched) setTrains([]);
    setBestTrainResult(null);
    setBestTrainError(null);
    setBestTrainProgress([]);
    setCachedBest(null);
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

      // Best-effort: if this popular route+date is precomputed, show the best
      // seat instantly. The AC-only cache isn't precomputed (phase 1), so skip.
      if (!acOnly) {
        try {
          const cr = await apiClient.get<CachedBestTrainResponse>(
            "/api/booking-v2/best-trains/cached",
            {
              params: {
                from: fromSt.stationCode,
                to: toSt.stationCode,
                date: journeyDate,
              },
            },
          );
          if (cr.data.cached) {
            console.info(
              `[best-seat] cache HIT ${fromSt.stationCode}→${toSt.stationCode} ${journeyDate} · train ${cr.data.best.train.trainNumber} · cachedAt ${cr.data.cachedAt}`,
            );
            setCachedBest({ best: cr.data.best, cachedAt: cr.data.cachedAt });
            trackAnalyticsEvent({
              name: "best_available_tickets_route_cache_viewed",
              properties: {
                from_code: fromSt.stationCode,
                to_code: toSt.stationCode,
                journey_date: journeyDate,
                train_number: cr.data.best.train.trainNumber,
                train_name: cr.data.best.train.trainName,
                is_complete: cr.data.best.isComplete,
                total_fare: cr.data.best.totalFare,
              },
            });
          } else {
            console.info(
              `[best-seat] cache MISS ${fromSt.stationCode}→${toSt.stationCode} ${journeyDate} — showing live-scan CTA`,
            );
          }
        } catch {
          /* cache is best-effort; a miss/error just falls back to the CTA */
        }
      }
    } catch (e: unknown) {
      let msg = "Search failed";
      if (e && typeof e === "object" && "response" in e) {
        const ax = e as { response?: { data?: { message?: string } } };
        msg = ax.response?.data?.message ?? msg;
      } else if (e instanceof Error) msg = e.message;
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
      setExpandSearch(false);
    }
  }, [fromSt, toSt, journeyDate, acOnly, hasSearched]);

  useEffect(() => {
    if (
      fromSt &&
      toSt &&
      journeyDate &&
      hasUrlParams &&
      !autoSearchTriggered.current
    ) {
      autoSearchTriggered.current = true;
      void runSearch();
    }
  }, [fromSt, toSt, journeyDate, hasUrlParams, runSearch]);

  const runBestTrainSearch = useCallback(async () => {
    if (!fromSt || !toSt) {
      setBestTrainError("Select both stations.");
      return;
    }
    if (!journeyDate) {
      setBestTrainError("Pick a journey date.");
      return;
    }
    if (trains.length === 0) {
      setBestTrainError("Search trains first, then scan the listed trains.");
      return;
    }

    setHasSearched(true);
    setBestTrainLoading(true);
    setBestTrainError(null);
    setBestTrainResult(null);
    setBestTrainProgress([]);

    // Only scan the top few listed trains — sending all 30–60 makes the backend
    // fan out an availability probe per train and blows up the scan time/cost.
    const scanTrains = trains.slice(0, BEST_TRAIN_SCAN_LIMIT);

    trackAnalyticsEvent({
      name: "best_train_search_clicked",
      properties: {
        from_code: fromSt.stationCode,
        to_code: toSt.stationCode,
        journey_date: journeyDate,
        ac_only: acOnly,
        train_count: trains.length,
        scanned_count: scanTrains.length,
      },
    });

    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/booking-v2/best-trains/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromSt.stationCode,
            to: toSt.stationCode,
            date: journeyDate,
            quota: "GN",
            acOnly,
            maxTrains: scanTrains.length,
            trains: scanTrains,
          }),
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
        setBestTrainError(msg);
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
              event?: BestTrainProgressEvent;
              data?: BestTrainSearchResult;
              message?: string;
            };
            if (msg.type === "progress" && msg.event) {
              setBestTrainProgress((prev) => [...prev, msg.event!]);
            } else if (msg.type === "result" && msg.data) {
              setBestTrainResult(msg.data);
              if (msg.data.results.length > 0) {
                setTrains((prev) => {
                  if (prev.length > 0) return prev;
                  return msg.data!.results.map((r) => r.train);
                });
              }
            } else if (msg.type === "error") {
              setBestTrainError(msg.message ?? "Unknown error");
            }
          } catch {
            /* malformed stream line */
          }
        }
      }
    } catch (e: unknown) {
      setBestTrainError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBestTrainLoading(false);
    }
  }, [fromSt, toSt, journeyDate, trains, acOnly]);

  const bestTrainProgressSummary = useMemo(() => {
    const ready = [...bestTrainProgress]
      .reverse()
      .find((ev) => ev.type === "candidates_ready");
    const doneCount = bestTrainProgress.filter(
      (ev) => ev.type === "train_done",
    ).length;
    const total = ready?.type === "candidates_ready" ? ready.candidateCount : 0;
    const latestStarted = [...bestTrainProgress]
      .reverse()
      .find((ev) => ev.type === "train_started");
    return {
      doneCount,
      total,
      latest:
        latestStarted?.type === "train_started"
          ? `${latestStarted.trainNumber}${latestStarted.trainName ? ` ${latestStarted.trainName}` : ""}`
          : null,
    };
  }, [bestTrainProgress]);

  const journeyDateInputId = useId();

  const handleTabSwitch = (type: "route" | "pnr" | "seat") => {
    setSearchType(type);
    setExpandSearch(false);
    alt.reset();
    if (type === "pnr") {
      trackAnalyticsEvent({
        name: "search_pnr_feature_clicked",
        properties: {},
      });
    } else if (type === "seat") {
      trackAnalyticsEvent({
        name: "seat_status_feature_clicked",
        properties: {},
      });
    }
  };

  /**
   * Route-tab alternate-paths trigger. Preserves the original behaviour of
   * falling back to the user's selected stations when a listed train omits its
   * run endpoints, and passes the page's journey date to the shared hook.
   */
  const findAlternatesForRoute = useCallback(
    (t: TrainListItem, focusTravelClass?: string) =>
      void alt.findAlternates(
        {
          ...t,
          fromStnCode: t.fromStnCode ?? fromSt?.stationCode,
          toStnCode: t.toStnCode ?? toSt?.stationCode,
        },
        focusTravelClass,
        journeyDate ?? undefined,
      ),
    [alt, fromSt, toSt, journeyDate],
  );

  const tabLabel =
    searchType === "route"
      ? t.tabs.route
      : searchType === "pnr"
        ? t.tabs.pnr
        : t.tabs.seat;

  /** Compact mode: collapse hero + form into a sticky summary bar after search */
  const isCompact =
    hasSearched &&
    searchType === "route" &&
    !expandSearch;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    console.info("[compact-search]", {
      hasSearched,
      searchLoading,
      expandSearch,
      isCompact,
      searchType,
      from: fromSt
        ? `${fromSt.stationCode} - ${fromSt.stationName}`
        : null,
      to: toSt ? `${toSt.stationCode} - ${toSt.stationName}` : null,
      fromQ,
      toQ,
      journeyDate,
      trainCount: trains.length,
    });
  }, [
    hasSearched,
    searchLoading,
    expandSearch,
    isCompact,
    searchType,
    fromSt,
    toSt,
    fromQ,
    toQ,
    journeyDate,
    trains.length,
  ]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <Suspense fallback={null}>
        <UrlSearchParamsSync onParams={handleUrlParams} />
      </Suspense>
      <Header lang={lang} nav={t.nav} showLanguage />

      {/* ── Compact search bar (shown after search) ── */}
      {isCompact && (
        <div className="sticky top-[49px] z-[19] border-b border-gray-200 bg-white/95 backdrop-blur-sm transition-all">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:max-w-4xl">
            <div className="flex h-14 min-w-0 flex-1 items-stretch rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-3">
              <StationFieldSimple
                compact
                label="From"
                placeholder={t.form.stationPlaceholder}
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
                className="border-0"
              />
              <svg className="h-3.5 w-3.5 shrink-0 self-center text-gray-400" aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              <StationFieldSimple
                compact
                label="To"
                placeholder={t.form.stationPlaceholder}
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
                className="border-0"
              />
            </div>
            <div className="flex h-14 min-w-0 shrink-0 flex-col justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-3">
              <label htmlFor={`compact-${journeyDateInputId}`} className="block text-[9px] font-bold uppercase tracking-wide text-gray-500">Date</label>
              <JourneyDatePicker
                id={`compact-${journeyDateInputId}`}
                value={journeyDate}
                onChange={(ymd) => {
                  setJourneyDate(ymd);
                  trackAnalyticsEvent({
                    name: "search_date_selected",
                    properties: { journey_date: ymd },
                  });
                }}
                inputClassName="h-6 w-[92px] cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-slate-700 focus:ring-0 sm:w-[120px] sm:text-sm"
              />
            </div>
            <label className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-600" title={t.form.acOnly}>
              <input
                type="checkbox"
                checked={acOnly}
                onChange={(event) => setAcOnly(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 touch-manipulation"
                aria-label={t.form.acOnly}
              />
              <span className="hidden sm:inline">AC only</span>
            </label>
            <button
              type="button"
              onClick={() => {
                if (!searchLoading) void runSearch();
              }}
              disabled={searchLoading}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/35 disabled:opacity-60 touch-manipulation sm:px-5 sm:text-sm"
            >
              {searchLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                t.form.search
              )}
            </button>
          </div>
        </div>
      )}

      <div className={cn(
        "mx-auto max-w-3xl px-4 sm:px-6 lg:max-w-4xl",
        isCompact ? "py-4" : "py-8",
      )}>
        {/* ── Hero headline (hidden in compact mode) ── */}
        {!isCompact && (
          <header className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl text-balance">
              {t.hero.titleLead}
              <span className="text-blue-600">{t.hero.titleHighlight}</span>
              {t.hero.titleTail}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-slate-600">
              {t.hero.subtitle}
            </p>
          </header>
        )}

        <div className={cn("mb-8", !isCompact && "min-h-[148px]")}>
          {/* Tab Switcher (hidden in compact mode) */}
          {!isCompact && (
          <div className="mb-4 flex p-1 bg-slate-200/50 rounded-xl max-w-[360px] sm:max-w-[440px] backdrop-blur-md border border-white/40 shadow-xs">
            <button
              type="button"
              id="tabSearchRoute"
              onClick={() => handleTabSwitch("route")}
              className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 touch-manipulation ${
                searchType === "route"
                  ? "bg-white text-blue-600 shadow-xs scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.tabs.route}
            </button>
            <button
              type="button"
              id="tabSearchPnr"
              onClick={() => handleTabSwitch("pnr")}
              className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 touch-manipulation ${
                searchType === "pnr"
                  ? "bg-white text-blue-600 shadow-xs scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.tabs.pnr}
            </button>
            <button
              type="button"
              id="tabSeatStatus"
              onClick={() => handleTabSwitch("seat")}
              className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 touch-manipulation ${
                searchType === "seat"
                  ? "bg-white text-blue-600 shadow-xs scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.tabs.seat}
            </button>
          </div>
          )}

          <h2 className="sr-only">{tabLabel}</h2>
          {searchType === "seat" ? (
            <ChartTimesFinder />
          ) : searchType === "route" ? (
            !isCompact && <form
              {...({
                toolname: "search_train_tickets",
                tooldescription:
                  "Search confirmed train tickets, alternate segment routes, and seat availability across Indian Railways.",
              } as Record<string, unknown>)}
              onSubmit={(e) => {
                e.preventDefault();
                if (!searchLoading) void runSearch();
              }}
              className="flex flex-col overflow-visible rounded-xl border border-gray-200 bg-gray-50/80 sm:flex-row sm:items-stretch"
            >
              <StationFieldSimple
                className="rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none"
                label={t.form.from}
                placeholder={t.form.stationPlaceholder}
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
                    properties: {
                      from_code: s.stationCode,
                      from_name: s.stationName,
                    },
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
                label={t.form.to}
                placeholder={t.form.stationPlaceholder}
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
                    properties: {
                      to_code: s.stationCode,
                      to_name: s.stationName,
                    },
                  });
                }}
                suggestions={toSuggest}
                loading={toLoad}
                pendingDebounce={toQ !== toDeb && toQ.length >= 2}
                open={toOpen}
                onOpenChange={openTo}
                suggestError={toSuggestError}
              />
              <div className="z-10 min-w-0 flex-1 border-t border-gray-200 bg-white px-3 py-2.5 overflow-visible sm:border-t-0 sm:border-r sm:py-2">
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
                  {t.form.date}
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
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="acTicketsOnly"
                    checked={acOnly}
                    onChange={(e) => setAcOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 touch-manipulation"
                  />
                  <label
                    htmlFor="acTicketsOnly"
                    className="cursor-pointer select-none text-xs font-medium text-gray-600"
                  >
                    {t.form.acOnly}
                  </label>
                </div>
              </div>
              <div className="flex items-stretch border-t border-gray-200 p-2 sm:border-t-0 sm:p-0">
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="inline-flex w-full items-center justify-center rounded-b-xl bg-blue-600 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/35 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-[128px] sm:rounded-b-none sm:rounded-r-xl sm:px-5 sm:py-0 sm:text-base touch-manipulation"
                >
                  {searchLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {t.form.searching}
                    </span>
                  ) : (
                    t.form.search
                  )}
                </button>
              </div>
            </form>
          ) : (
            <SearchPnrPanel />
          )}
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

        {hasSearched &&
          !searchLoading &&
          !searchError &&
          trains.length > 0 &&
          !isTrainSearchV2 && (
            <section
              className="mb-5 rounded-xl border border-blue-100 bg-white p-4 shadow-sm"
              aria-labelledby="best-train-finder-heading"
            >
            {cachedBest &&
            !bestTrainResult &&
            !bestTrainLoading &&
            !bestTrainError ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2
                      id="best-train-finder-heading"
                      className="text-base font-bold text-slate-950"
                    >
                      Found the best seats available for you to reach{" "}
                      {toSt?.stationName ||
                        toSt?.stationCode ||
                        "your destination"}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {cachedBest.best.train.trainNumber}{" "}
                      {cachedBest.best.train.trainName}
                      <span className="ml-2 font-normal text-slate-500">
                        {formatTimeAmPm(cachedBest.best.train.departureTime) ??
                          "—"}{" "}
                        →{" "}
                        {formatTimeAmPm(cachedBest.best.train.arrivalTime) ??
                          "—"}
                      </span>
                    </p>
                    {(() => {
                      // With city-hub caching a hit may be for a sibling station
                      // (e.g. searched DEE, best train departs NDLS). Surface the
                      // real boarding point so it isn't misleading.
                      const boarding = cachedBest.best.legs.find(
                        (l) => l.segmentKind === "confirmed",
                      )?.from;
                      return boarding &&
                        fromSt &&
                        boarding !== fromSt.stationCode ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Departs from {boarding} (near {fromSt.stationCode})
                        </p>
                      ) : null;
                    })()}
                  </div>
                  {cachedBest.best.totalFare != null && (
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Total
                      </div>
                      <div className="text-lg font-black text-slate-950">
                        ₹{cachedBest.best.totalFare}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {(() => {
                    // Walk legs in journey order; confirmed hops render with a
                    // Book Now, unconfirmed (check_realtime) hops render as an
                    // amber "book at chart prep / via TTE" row. Merge consecutive
                    // unconfirmed hops into one span so a long check-live tail
                    // doesn't spam many rows.
                    type Row = {
                      from: string;
                      to: string;
                      confirmed: boolean;
                      travelClass: string | null;
                      fare: number | null;
                      durationMinutes: number;
                    };
                    const rows: Row[] = [];
                    for (const l of cachedBest.best.legs) {
                      const mins = l.durationMinutes ?? 0;
                      if (l.segmentKind === "confirmed") {
                        rows.push({
                          from: l.from,
                          to: l.to,
                          confirmed: true,
                          travelClass: l.travelClass,
                          fare: l.fare,
                          durationMinutes: mins,
                        });
                      } else {
                        const prev = rows[rows.length - 1];
                        if (prev && !prev.confirmed) {
                          prev.to = l.to; // extend the unconfirmed span
                          prev.durationMinutes += mins; // ...and its duration
                        } else {
                          rows.push({
                            from: l.from,
                            to: l.to,
                            confirmed: false,
                            travelClass: null,
                            fare: null,
                            durationMinutes: mins,
                          });
                        }
                      }
                    }
                    // "Full Station Name (CODE)" using the names cached with the
                    // result; falls back to the bare code on older cache rows.
                    const nameOf = (code: string) => {
                      const n =
                        cachedBest.best.stationNames?.[
                          code.trim().toUpperCase()
                        ];
                      return n && n.trim() ? `${n} (${code})` : code;
                    };
                    return rows.map((r, i) =>
                      r.confirmed ? (
                        <div
                          key={`c-${r.from}-${r.to}-${i}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <span className="min-w-0 text-sm font-semibold text-slate-800">
                            {nameOf(r.from)} → {nameOf(r.to)}
                            {r.travelClass ? ` · ${r.travelClass}` : ""}
                            {r.fare != null ? ` · ₹${r.fare}` : ""}
                          </span>
                          <a
                            href={irctcBookingRedirect({
                              from: r.from,
                              to: r.to,
                              trainNo: cachedBest.best.train.trainNumber,
                              classCode: r.travelClass,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white no-underline hover:bg-emerald-700"
                          >
                            Book Now →
                          </a>
                        </div>
                      ) : (
                        <div
                          key={`u-${r.from}-${r.to}-${i}`}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                        >
                          <span className="text-sm font-semibold text-slate-800">
                            {nameOf(r.from)} → {nameOf(r.to)}
                            {r.durationMinutes > 0
                              ? ` · ${formatDurationMinutes(r.durationMinutes)}`
                              : ""}
                          </span>
                          <p className="mt-0.5 text-xs font-medium text-amber-700">
                            Not confirmed yet — no confirmed seat for
                            {r.durationMinutes > 0
                              ? ` this ${formatDurationMinutes(r.durationMinutes)} stretch`
                              : " this stretch"}
                            . Book once the chart is prepared, or board and pay
                            the TTE.
                          </p>
                        </div>
                      ),
                    );
                  })()}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    Updated{" "}
                    {new Date(cachedBest.cachedAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => void runBestTrainSearch()}
                    disabled={bestTrainLoading}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    More options
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="best-train-finder-heading"
                    className="text-base font-bold text-slate-950"
                  >
                    Want us to scan every train below?
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    We&apos;ll check all {trains.length} listed train
                    {trains.length === 1 ? "" : "s"} and rank the best confirmed
                    ticket combinations from {fromSt?.stationCode ?? "origin"}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runBestTrainSearch()}
                  disabled={bestTrainLoading}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bestTrainLoading
                    ? "Checking trains…"
                    : "Check Confirmed Tickets"}
                </button>
              </div>
            )}

            {bestTrainLoading && (
              <p className="mt-2 text-xs text-slate-500">
                This can take 2–3 minutes — we&apos;re scanning multiple trains,
                routes and station combinations to find confirmed tickets. You
                can keep this open while it runs.
              </p>
            )}

            {(bestTrainLoading ||
              bestTrainError ||
              bestTrainResult ||
              bestTrainProgress.length > 0) && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {bestTrainLoading && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                      <p className="min-w-0 text-sm font-semibold text-slate-700">
                        {bestTrainProgressSummary.total > 0
                          ? `Checked ${bestTrainProgressSummary.doneCount} of ${bestTrainProgressSummary.total} trains`
                          : "Preparing listed trains"}
                        {bestTrainProgressSummary.latest
                          ? ` · ${bestTrainProgressSummary.latest}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500">
                      Live
                    </span>
                  </div>
                )}
                {bestTrainError && (
                  <p className="text-sm font-semibold text-red-700">
                    {bestTrainError}
                  </p>
                )}
                {bestTrainResult && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Ranked {bestTrainResult.results.length} train
                        {bestTrainResult.results.length === 1 ? "" : "s"} after
                        checking {bestTrainResult.candidatesEvaluated} listed
                        train
                        {bestTrainResult.candidatesEvaluated === 1 ? "" : "s"}.
                      </p>
                      <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500">
                        {bestTrainResult.candidatesSkipped} skipped
                      </span>
                    </div>
                    {bestTrainResult.results.length === 0 ? (
                      <p className="rounded-lg bg-white p-3 text-sm text-slate-600">
                        None of the listed trains had a confirmed ticket
                        starting from {fromSt?.stationCode ?? "origin"}.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {bestTrainResult.results
                          .slice(0, 5)
                          .map((item, idx) => (
                            <li
                              key={`${item.train.trainNumber}-${idx}`}
                              className="rounded-lg border border-slate-200 bg-white p-3"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-black text-white">
                                      {idx + 1}
                                    </span>
                                    <h3 className="font-bold text-slate-950">
                                      {item.train.trainNumber}{" "}
                                      {item.train.trainName}
                                    </h3>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {formatTimeAmPm(item.train.departureTime) ??
                                      "—"}{" "}
                                    {item.train.fromStnCode} →{" "}
                                    {formatTimeAmPm(item.train.arrivalTime) ??
                                      "—"}{" "}
                                    {item.train.toStnCode} ·{" "}
                                    {formatDurationMinutes(item.train.duration)}
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-emerald-800">
                                    {item.rankReason}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    alt.showResult({
                                      trainNumber: item.train.trainNumber,
                                      trainName: item.train.trainName,
                                      avlClasses: item.train.avlClasses,
                                      result: item.alternatePath,
                                    });
                                  }}
                                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-600 px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-600 hover:text-white"
                                >
                                  See Available Tickets
                                </button>
                              </div>
                            </li>
                          ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Train Search V2 (Skyscanner Experience) Top Progress Bar */}
        {isTrainSearchV2 &&
          hasSearched &&
          !searchLoading &&
          !searchError &&
          displayTrains.length > 0 && (
            <TrainSearchV2ProgressBar
              totalTrains={displayTrains.length}
              scannedCount={v2CompletedScans.size}
              totalToScan={v2Stats.totalToScan}
              directAvailableCount={v2Stats.directAvailableCount}
              splitSeatsFoundCount={v2TotalDiscoveredCount}
              isLoading={v2IsLoading}
            />
          )}

        <ul
          ref={isTrainSearchV2 ? v2TrainListAnimateRef : undefined}
          className="space-y-5"
          role="list"
          aria-label="Train results"
        >
          {isTrainSearchV2
            ? displayTrains.map((t, idx) => (
                <TrainSearchV2Card
                  key={`v2-${t.trainNumber}`}
                  train={t}
                  journeyDate={journeyDate}
                  fromCode={fromSt?.stationCode}
                  fromName={fromSt?.stationName}
                  toCode={toSt?.stationCode}
                  toName={toSt?.stationName}
                  acOnly={acOnly}
                  autoScanEnabled={v2AutoScanTrainNumbers.has(t.trainNumber)}
                  scanIndex={idx}
                  onOpenSchedule={(trainNumber, from, to) => {
                    setScheduleTrainNumber(trainNumber);
                    setScheduleHighlightFrom(from ?? "");
                    setScheduleHighlightTo(to ?? "");
                    setScheduleModalOpen(true);
                  }}
                  onOpenFullResultModal={({
                    trainNumber,
                    trainName,
                    avlClasses,
                    result,
                  }) => {
                    alt.showResult({
                      trainNumber,
                      trainName,
                      avlClasses,
                      result,
                    });
                  }}
                  onSeatsDiscovered={handleV2SeatsDiscovered}
                  onScanComplete={handleV2ScanComplete}
                />
              ))
            : trains.map((t) => {
                const isEligibleForAutoSearch =
                  autoSearchEligibleTrainNumbers.has(t.trainNumber);
                const autoSearchFailed = failedAutoSearchTrains.has(
                  t.trainNumber,
                );

                // Variant A experiment: Auto-run search ONLY for the FIRST 3 unavailable trains
                if (isVariantA && isEligibleForAutoSearch && !autoSearchFailed) {
                  return (
                    <AutoSearchTrainCard
                      key={`variant-a-${t.trainNumber}-${t.departureTime}`}
                      train={t}
                      journeyDate={journeyDate}
                      fromCode={fromSt?.stationCode}
                      toCode={toSt?.stationCode}
                      acOnly={acOnly}
                      onFallbackToControl={() => {
                        setFailedAutoSearchTrains((prev) =>
                          new Set(prev).add(t.trainNumber),
                        );
                      }}
                      onOpenSchedule={(trainNumber, from, to) => {
                        setScheduleTrainNumber(trainNumber);
                        setScheduleHighlightFrom(from ?? "");
                        setScheduleHighlightTo(to ?? "");
                        setScheduleModalOpen(true);
                      }}
                      onOpenFullResultModal={({
                        trainNumber,
                        trainName,
                        avlClasses,
                        result,
                      }) => {
                        alt.showResult({
                          trainNumber,
                          trainName,
                          avlClasses,
                          result,
                        });
                      }}
                    />
                  );
                }

                // Control UI (or trains with available seats):
                // Classes shown for this train (respecting the AC-only filter).
                const displayedClasses = (t.avlClasses ?? []).filter(
                  (c) =>
                    !acOnly ||
                    !["SL", "2S", "GN", "FC"].includes(c.toUpperCase()),
                );
                // When every shown class is directly bookable on IRCTC there's no
                // reason to offer the "Search all classes" fallback scan.
                const allBookable =
                  displayedClasses.length > 0 &&
                  displayedClasses.every((cls) => {
                    const gn = t.availabilityCache?.[cls];
                    return gn ? isIrctcDirectBookable(gn) : false;
                  });
                return (
                  <li
                    key={`${t.trainNumber}-${t.departureTime}`}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-md transition-shadow hover:shadow-lg flex flex-col md:flex-row md:items-stretch justify-between gap-5"
                  >
                    {/* Left Column: Train Info + Classes + Search All Action */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">
                          {t.trainNumber} {t.trainName}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                          <span className="font-semibold">
                            {formatTimeAmPm(t.departureTime) ?? "—"}{" "}
                            {t.fromStnCode}
                          </span>
                          <span className="text-gray-400">
                            {formatDurationMinutes(t.duration)}
                          </span>
                          <span className="font-semibold">
                            {formatTimeAmPm(t.arrivalTime) ?? "—"} {t.toStnCode}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {displayedClasses.map((cls) => {
                            const gn = t.availabilityCache?.[cls];
                            const rawLine =
                              gn?.availabilityDisplayName ??
                              gn?.railDataStatus ??
                              gn?.availablityStatus;
                            const line = formatAvailabilityStatus(rawLine);
                            const confirmed = isIrctcDirectBookable(gn);
                            const bookUrl = irctcBookingRedirect({
                              from: t.fromStnCode || fromSt?.stationCode || "",
                              to: t.toStnCode || toSt?.stationCode || "",
                              trainNo: t.trainNumber,
                              classCode: cls,
                            });
                            return (
                              <div
                                key={cls}
                                className="flex flex-col rounded-lg border border-gray-200 bg-gray-50/80 p-2 text-xs min-w-[80px]"
                              >
                                <span className="font-bold text-gray-800">
                                  {cls}
                                </span>
                                <span
                                  className={cn(
                                    "font-semibold",
                                    confirmed
                                      ? "text-green-700"
                                      : "text-amber-800",
                                  )}
                                >
                                  {line}
                                </span>
                                {gn?.fare && (
                                  <span className="text-gray-500">
                                    ₹{gn.fare}
                                  </span>
                                )}
                                {confirmed ? (
                                  <a
                                    href={bookUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 font-bold text-green-800 underline hover:text-green-950"
                                  >
                                    Book
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    className="mt-1 font-semibold text-blue-600 underline hover:text-blue-800 text-left"
                                    onClick={() => {
                                      trackAnalyticsEvent({
                                        name: "find_ticket_cta_clicked",
                                        properties: {
                                          train_number: t.trainNumber,
                                          train_name: t.trainName,
                                          class: cls,
                                          class_code: cls,
                                          date: journeyDate ?? undefined,
                                          journey_date: journeyDate ?? undefined,
                                          from_code:
                                            t.fromStnCode ||
                                            fromSt?.stationCode,
                                          to_code:
                                            t.toStnCode || toSt?.stationCode,
                                        },
                                      });
                                      findAlternatesForRoute(t, cls);
                                    }}
                                  >
                                    Find Tickets
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {!allBookable && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => findAlternatesForRoute(t)}
                            disabled={
                              altLoading && altForTrain === t.trainNumber
                            }
                            className={cn(
                              "inline-flex items-center rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white focus:outline-none focus:ring-4 focus:ring-blue-500/25 touch-manipulation",
                              altLoading &&
                                altForTrain === t.trainNumber &&
                                "cursor-wait opacity-60",
                            )}
                          >
                            {altLoading && altForTrain === t.trainNumber
                              ? "Searching…"
                              : "Search all classes"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Vertical Subscribe to Chart Alert CTA */}
                    <div className="w-full md:w-52 lg:w-56 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4 flex flex-col justify-center">
                      <TrainChartAlertSection
                        trainNumber={t.trainNumber}
                        trainName={t.trainName}
                        fromCode={t.fromStnCode || fromSt?.stationCode || ""}
                        toCode={t.toStnCode || toSt?.stationCode || ""}
                        journeyDate={journeyDate}
                        avlClasses={t.avlClasses}
                      />
                    </div>
                  </li>
                );
              })}
        </ul>

        {searchType === "route" &&
          (altResult || altError || (altLoading && altForTrain)) && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
              role="presentation"
              onClick={() => {
                if (!altLoading) {
                  alt.reset();
                }
              }}
            >
              <div
                className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl sm:border sm:border-gray-200 sm:shadow-2xl"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <AlternatePathContent
                  altForTrain={altForTrain}
                  altTrainName={altTrainName}
                  altAvlClasses={altAvlClasses}
                  altLoading={altLoading}
                  altResult={altResult}
                  altError={altError}
                  altProgress={altProgress}
                  journeyDate={journeyDate}
                  fromCode={fromSt?.stationCode}
                  toCode={toSt?.stationCode}
                  originChartTime="4 hours before departure"
                  isAdminUser={isAdminUser}
                  shareBusy={altShareBusy}
                  onShare={() => void shareAlternatePathScreenshot()}
                  captureRef={altAlternatePathCaptureRef}
                  directFares={directFares}
                  hideSearchAllTrainsBanner={isTrainSearchV2}
                  source={
                    isTrainSearchV2 ? "skyscanner_search_experiment" : undefined
                  }
                  onClose={alt.reset}
                  onOpenSchedule={(trainNumber, from, to) => {
                    setScheduleTrainNumber(trainNumber);
                    setScheduleHighlightFrom(from);
                    setScheduleHighlightTo(to);
                    setScheduleModalOpen(true);
                  }}
                />
              </div>
            </div>
          )}
      </div>
      <HomeSideAd />
      <HomeSeoContent t={t.seo} />
      <div className="mx-auto my-8 flex min-h-[250px] max-w-3xl items-center justify-center px-4 sm:px-6 lg:max-w-4xl">
        <HomeBannerAd zoneId="12090034" />
      </div>
      <TrainScheduleBottomSheet
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        trainNumber={scheduleTrainNumber}
        highlightFrom={scheduleHighlightFrom}
        highlightTo={scheduleHighlightTo}
      />
    </div>
  );
}

export function HomeClient({ lang, t }: { lang: string; t: HomeStrings }) {
  return <BookingV2PageContent lang={lang} t={t} />;
}
