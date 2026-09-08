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
  hasAnyAvailableSeat,
} from "@/lib/bookingV2Availability";
import { JourneyDatePicker } from "@/components/booking-v2/JourneyDatePicker";
import dynamic from "next/dynamic";
import { shareDomElementAsPng } from "@/lib/shareDomScreenshot";
import { cn } from "@/lib/utils";
import { useAlternatePaths } from "@/components/booking-v2/useAlternatePaths";
import { TrainSearchV2ProgressBar } from "@/components/home/TrainSearchV2ProgressBar";
import { TrainSearchV2Card } from "@/components/home/TrainSearchV2Card";
import { TrainSearchSkeleton } from "@/components/home/TrainSearchSkeleton";
import {
  sortTrainSearchV2,
  type TrainScanMeta,
} from "@/lib/trainSearchV2Sort";
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

import { Header } from "@/components/Header";
import { HomeSeoContent } from "@/components/HomeSeoContent";
import {
  StationFieldSimple,
  todayYmd,
} from "@/components/home/StationFieldSimple";
import {
  MobileModifySearchSheet,
  formatShortDate,
} from "@/components/home/MobileModifySearchSheet";
import ChartTimesFinder from "@/app/chart-times/ChartTimesFinder";
import type { HomeStrings } from "@/lib/home/home-langs";

import {
  type StationRow,
  fetchStationSuggestions,
  getCachedStationSuggestions,
} from "@/lib/stationCacheClient";

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
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const handleJourneyDateChange = useCallback((ymd: string) => {
    setJourneyDate(ymd);
    trackAnalyticsEvent({
      name: "search_date_selected",
      properties: { journey_date: ymd },
    });
  }, []);

  const swapStations = useCallback(() => {
    setFromSt(toSt);
    setToSt(fromSt);
    setFromQ(toQ);
    setToQ(fromQ);
  }, [fromSt, toSt, fromQ, toQ]);

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

  // Prioritized multi-tier sorting:
  // 1. Direct IRCTC availability (chronological)
  // 2. End-to-end full split journeys (chronological)
  // 3. Partial split journeys (longest confirmed duration/hours first, then chronological)
  // 4. Waitlisted only / in-flight scan (chronological)
  const displayTrains = useMemo(() => {
    return sortTrainSearchV2(trains, {
      acOnly,
      scanMetaMap: v2ScanMetaMap,
      endToEndTrains: v2DiscoveredEndToEndTrains,
      partialTrains: v2DiscoveredPartialTrains,
    });
  }, [
    trains,
    acOnly,
    v2ScanMetaMap,
    v2DiscoveredEndToEndTrains,
    v2DiscoveredPartialTrains,
  ]);

  const v2AutoScanTrainNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const t of trains) {
      if (!hasAnyAvailableSeat(t, acOnly)) {
        set.add(t.trainNumber);
      }
    }
    return set;
  }, [trains, acOnly]);

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
    if (v2Stats.totalToScan === 0) return false;
    return v2CompletedScans.size < v2Stats.totalToScan;
  }, [v2CompletedScans.size, v2Stats.totalToScan]);

  useEffect(() => {
    if (
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
  }, [trains.length, fromSt?.stationCode, toSt?.stationCode, journeyDate, acOnly, v2Stats]);

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
    const cached = getCachedStationSuggestions(fromDeb);
    if (cached) {
      setFromSuggest(cached);
      setFromSuggestError(null);
      setFromLoad(false);
      return;
    }
    let c = false;
    setFromLoad(true);
    setFromSuggestError(null);
    fetchStationSuggestions(fromDeb)
      .then((list) => {
        if (!c) {
          setFromSuggest(list);
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
    const cached = getCachedStationSuggestions(toDeb);
    if (cached) {
      setToSuggest(cached);
      setToSuggestError(null);
      setToLoad(false);
      return;
    }
    let c = false;
    setToLoad(true);
    setToSuggestError(null);
    fetchStationSuggestions(toDeb)
      .then((list) => {
        if (!c) {
          setToSuggest(list);
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
    trackAnalyticsEvent({
      name: "search_tickets_clicked",
      properties: {
        from_code: fromSt.stationCode,
        to_code: toSt.stationCode,
        journey_date: journeyDate,
      },
    });
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

      {/* ── Compact search bar (desktop only after search; mobile uses the summary pill + sheet) ── */}
      {isCompact && (
        <div className="hidden sm:block sticky top-[49px] z-[19] border-b border-gray-200 bg-white/95 backdrop-blur-sm transition-all">
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
                onChange={handleJourneyDateChange}
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

      {/* ── Mobile summary pill (opens the modify-search sheet) ── */}
      {isCompact && (
        <div className="sticky top-[49px] z-[19] border-b border-gray-200 bg-white/95 backdrop-blur-sm sm:hidden">
          <div className="mx-auto max-w-3xl px-4 py-2">
            <button
              type="button"
              onClick={() => setMobileSheetOpen(true)}
              aria-label="Modify your search"
              className="w-full rounded-full bg-slate-100 px-4 py-2 text-center transition hover:bg-slate-200 touch-manipulation"
            >
              <span className="block truncate text-sm font-bold text-slate-900">
                {fromSt?.stationCode ?? "—"} - {fromSt?.stationName ?? "—"}
                {" → "}
                {toSt?.stationCode ?? "—"} - {toSt?.stationName ?? "—"}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                {formatShortDate(journeyDate)}
              </span>
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
                  onChange={handleJourneyDateChange}
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
        {searchLoading && (
          <TrainSearchSkeleton
            fromCode={fromSt?.stationCode}
            fromName={fromSt?.stationName}
            toCode={toSt?.stationCode}
            toName={toSt?.stationName}
          />
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

        {/* Train Search V2 (Skyscanner Experience) Top Progress Bar */}
        {hasSearched &&
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

        {!searchLoading && displayTrains.length > 0 && (
          <ul
            ref={v2TrainListAnimateRef}
            className="space-y-5"
            role="list"
            aria-label="Train results"
          >
            {displayTrains.map((t, idx) => (
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
            ))}
          </ul>
        )}

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
                  hideSearchAllTrainsBanner={true}
                  source="skyscanner_search_experiment"
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
      {mobileSheetOpen && (
        <MobileModifySearchSheet
          onClose={() => setMobileSheetOpen(false)}
          from={{
            query: fromQ,
            onUserType: (q) => {
              setFromQ(q);
              setFromSt(null);
            },
            value: fromSt,
            onSelect: (s) => {
              setFromSt(s);
              setFromQ(s.stationName);
            },
            suggestions: fromSuggest,
            loading: fromLoad,
            pending: fromQ !== fromDeb && fromQ.length >= 2,
            open: fromOpen,
            onOpenChange: openFrom,
            suggestError: fromSuggestError,
          }}
          to={{
            query: toQ,
            onUserType: (q) => {
              setToQ(q);
              setToSt(null);
            },
            value: toSt,
            onSelect: (s) => {
              setToSt(s);
              setToQ(s.stationName);
            },
            suggestions: toSuggest,
            loading: toLoad,
            pending: toQ !== toDeb && toQ.length >= 2,
            open: toOpen,
            onOpenChange: openTo,
            suggestError: toSuggestError,
          }}
          onSwap={swapStations}
          journeyDate={journeyDate}
          onDateChange={handleJourneyDateChange}
          acOnly={acOnly}
          onAcOnlyChange={setAcOnly}
          searchLoading={searchLoading}
          onSearch={() => {
            setMobileSheetOpen(false);
            if (!searchLoading) void runSearch();
          }}
          form={t.form}
        />
      )}
    </div>
  );
}

export function HomeClient({ lang, t }: { lang: string; t: HomeStrings }) {
  return <BookingV2PageContent lang={lang} t={t} />;
}
