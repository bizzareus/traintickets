"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import {
  formatDurationMinutes,
  formatTimeAmPm,
} from "@/components/booking-v2/alternatePathHelpers";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import {
  isLegConfirmed,
  formatAvailabilityStatus,
} from "@/lib/bookingV2Availability";
import {
  calculateConfirmedDurationMinutes,
  countConfirmedAlternateLegs,
} from "@/lib/trainSearchV2Sort";
import { useSplitBookingFeatureFlag } from "@/lib/hooks/useSplitBookingFeatureFlag";
import { buildDirectBookingLegs } from "@/lib/splitBookingSelection";
import {
  SplitTicketBookingFlow,
  type SplitTicketBookingFlowProps,
} from "@/components/booking-v2/SplitTicketBookingFlow";
import type {
  AlternateLeg,
  AlternatePathProgressEvent,
  AlternatePathsResponse,
  TrainListItem,
} from "@/components/booking-v2/alternatePathsTypes";

interface TrainSearchV2CardProps {
  train: TrainListItem;
  journeyDate?: string | null;
  fromCode?: string;
  fromName?: string;
  toCode?: string;
  toName?: string;
  acOnly?: boolean;
  selectedClasses?: string[];
  autoScanEnabled?: boolean;
  onOpenSchedule?: (trainNumber: string, from?: string, to?: string) => void;
  onOpenFullResultModal?: (args: {
    trainNumber: string;
    trainName?: string | null;
    avlClasses?: string[];
    result: AlternatePathsResponse;
  }) => void;
  onSeatsDiscovered?: (
    trainNumber: string,
    isComplete?: boolean,
    confirmedDurationMinutes?: number,
  ) => void;
  onScanStart?: (trainNumber: string) => void;
  onScanComplete?: (
    trainNumber: string,
    hasTickets: boolean,
    isComplete?: boolean,
    confirmedDurationMinutes?: number,
  ) => void;
}

interface FoundSeatNotice {
  id: string;
  from: string;
  to: string;
  travelClass: string;
  fare: number | null;
}

// Static module-level set to avoid recreating array / set on every check
const NON_AC_CLASSES = new Set(["SL", "2S", "GN", "FC"]);

export const TrainSearchV2Card = memo(function TrainSearchV2Card({
  train,
  journeyDate,
  fromCode: searchFrom,
  fromName,
  toCode: searchTo,
  toName,
  acOnly = false,
  selectedClasses,
  autoScanEnabled = false,
  onOpenSchedule,
  onOpenFullResultModal,
  onSeatsDiscovered,
  onScanStart,
  onScanComplete,
}: TrainSearchV2CardProps) {
  const cardRef = useRef<HTMLLIElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [foundSeats, setFoundSeats] = useState<FoundSeatNotice[]>([]);
  const [result, setResult] = useState<AlternatePathsResponse | null>(() => {
    if (
      train.cachedAlternatePath &&
      train.cachedAlternatePath.legs &&
      train.cachedAlternatePath.legs.length > 0
    ) {
      return train.cachedAlternatePath;
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [currentProgressText, setCurrentProgressText] = useState<string>("");
  const [directBookingRequest, setDirectBookingRequest] = useState<Omit<
    SplitTicketBookingFlowProps,
    "onClose"
  > | null>(null);
  const isSplitBookingEnabled = useSplitBookingFeatureFlag();

  const hasInitiatedRef = useRef(false);
  const hasTrackedLoadedRef = useRef(false);

  const fromCode = (train.fromStnCode ?? searchFrom ?? "").trim().toUpperCase();
  const toCode = (train.toStnCode ?? searchTo ?? "").trim().toUpperCase();

  // Abort in-flight scan on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const selectedClassesSet = useMemo(() => {
    if (!selectedClasses || selectedClasses.length === 0) return null;
    return new Set(selectedClasses.map((c) => c.toUpperCase()));
  }, [selectedClasses]);

  // Performance Optimization: Single-pass loop and static O(1) Set lookup eliminates intermediate array allocations
  const directAvailableClasses = useMemo(() => {
    const list: { cls: string; status: string; fare: number | null }[] = [];
    const avl = train.avlClasses;
    if (!avl || avl.length === 0) return list;

    for (let i = 0; i < avl.length; i++) {
      const cls = avl[i];
      if (selectedClassesSet && !selectedClassesSet.has(cls.toUpperCase()))
        continue;
      if (acOnly && NON_AC_CLASSES.has(cls.toUpperCase())) continue;

      const cacheRow = train.availabilityCache?.[cls];
      if (cacheRow && isLegConfirmed(cacheRow)) {
        let fareNum: number | null = null;
        if (cacheRow.fare) {
          const parsed = parseInt(String(cacheRow.fare), 10);
          if (!Number.isNaN(parsed)) fareNum = parsed;
        }
        const rawStatus =
          cacheRow.availabilityDisplayName ??
          cacheRow.railDataStatus ??
          cacheRow.availablityStatus ??
          "AVL";
        list.push({
          cls,
          status: formatAvailabilityStatus(rawStatus),
          fare: fareNum,
        });
      }
    }
    return list;
  }, [train.avlClasses, train.availabilityCache, acOnly, selectedClassesSet]);

  const isDirectAvailable = directAvailableClasses.length > 0;

  // Performance Optimization: Single-pass loop avoids array allocations (.map / .filter / Math.min)
  const lowestAvailableDirectFare = useMemo(() => {
    let minFare = Number.POSITIVE_INFINITY;
    for (let i = 0; i < directAvailableClasses.length; i++) {
      const f = directAvailableClasses[i].fare;
      if (f != null && f > 0 && f < minFare) {
        minFare = f;
      }
    }
    return minFare !== Number.POSITIVE_INFINITY ? minFare : null;
  }, [directAvailableClasses]);

  // Performance Optimization: Direct object iteration without Object.entries() / array allocations
  const lowestStartingFare = useMemo(() => {
    const cache = train.availabilityCache;
    if (!cache) return null;

    let minFare = Number.POSITIVE_INFINITY;
    for (const cls in cache) {
      if (selectedClassesSet && !selectedClassesSet.has(cls.toUpperCase()))
        continue;
      if (acOnly && NON_AC_CLASSES.has(cls.toUpperCase())) continue;
      const avail = cache[cls];
      if (avail?.fare) {
        const f = parseInt(String(avail.fare), 10);
        if (!Number.isNaN(f) && f > 0 && f < minFare) {
          minFare = f;
        }
      }
    }
    return minFare !== Number.POSITIVE_INFINITY ? minFare : null;
  }, [train.availabilityCache, acOnly, selectedClassesSet]);

  // Performance Optimization: Single-pass loop avoids array allocations (.map / .filter / Math.min)
  const lowestDiscoveredFare = useMemo(() => {
    if (result?.totalFare && result.totalFare > 0) return result.totalFare;
    if (foundSeats.length > 0) {
      let minFare = Number.POSITIVE_INFINITY;
      for (let i = 0; i < foundSeats.length; i++) {
        const f = foundSeats[i].fare;
        if (f != null && f > 0 && f < minFare) {
          minFare = f;
        }
      }
      if (minFare !== Number.POSITIVE_INFINITY) return minFare;
    }
    return null;
  }, [foundSeats, result]);

  // Reset scan state on search param changes and sync cachedAlternatePath
  useEffect(() => {
    hasInitiatedRef.current = false;
    setLoading(false);
    setFoundSeats([]);
    if (
      train.cachedAlternatePath &&
      train.cachedAlternatePath.legs &&
      train.cachedAlternatePath.legs.length > 0
    ) {
      setResult(train.cachedAlternatePath);
      const isComplete = Boolean(train.cachedAlternatePath.isComplete);
      const confirmedDurationMinutes = calculateConfirmedDurationMinutes(
        train.cachedAlternatePath.legs || [],
      );
      onSeatsDiscovered?.(
        train.trainNumber,
        isComplete,
        confirmedDurationMinutes,
      );
      onScanComplete?.(
        train.trainNumber,
        true,
        isComplete,
        confirmedDurationMinutes,
      );
    } else {
      setResult(null);
    }
    setError(null);
    setCurrentProgressText("");
  }, [
    journeyDate,
    fromCode,
    toCode,
    acOnly,
    selectedClasses,
    train.cachedAlternatePath,
    train.trainNumber,
    onSeatsDiscovered,
    onScanComplete,
  ]);

  // Run alternate paths search stream for waitlisted trains
  const executeScan = useCallback(async () => {
    if (
      hasInitiatedRef.current ||
      !journeyDate ||
      !fromCode ||
      !toCode ||
      isDirectAvailable
    ) {
      return;
    }
    hasInitiatedRef.current = true;
    onScanStart?.(train.trainNumber);

    setLoading(true);
    setError(null);
    setFoundSeats([]);
    setCurrentProgressText("Scanning routes and classes...");

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let baseClasses =
        train.avlClasses && train.avlClasses.length > 0
          ? train.avlClasses
          : undefined;
      if (selectedClasses && selectedClasses.length > 0) {
        const selSet = new Set(selectedClasses.map((c) => c.toUpperCase()));
        baseClasses = baseClasses
          ? baseClasses.filter((c) => selSet.has(c.toUpperCase()))
          : selectedClasses;
      } else if (acOnly && baseClasses) {
        baseClasses = baseClasses.filter(
          (c) => !NON_AC_CLASSES.has(c.toUpperCase()),
        );
      }

      if (
        selectedClasses &&
        selectedClasses.length > 0 &&
        (!baseClasses || baseClasses.length === 0)
      ) {
        setLoading(false);
        onScanComplete?.(train.trainNumber, false);
        return;
      }

      const body = JSON.stringify({
        trainNumber: train.trainNumber,
        from: fromCode,
        to: toCode,
        date: journeyDate,
        quota: "GN",
        ...(baseClasses && baseClasses.length > 0
          ? { avlClasses: baseClasses }
          : {}),
      });

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/booking-v2/alternate-paths/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        },
      );

      if (!resp.ok || !resp.body) {
        let msg = `Search failed (${resp.status})`;
        try {
          const j = (await resp.json()) as { message?: string };
          if (j.message) msg = j.message;
        } catch {
          /* ignore */
        }
        setError(msg);
        onScanComplete?.(train.trainNumber, false);
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
              const ev = msg.event;
              if (ev.type === "route_ok") {
                setCurrentProgressText(`Scanning ${ev.from} → ${ev.to}...`);
              } else if (ev.type === "train_departed") {
                setCurrentProgressText(
                  `Train already departed from ${ev.from}`,
                );
              } else if (ev.type === "probing_hop") {
                setCurrentProgressText(`Checking ${ev.from} → ${ev.to}...`);
              } else if (ev.type === "hop_confirmed") {
                const newNotice: FoundSeatNotice = {
                  id: `${ev.from}-${ev.to}-${ev.travelClass}-${ev.hopIndex}`,
                  from: ev.from,
                  to: ev.to,
                  travelClass: ev.travelClass,
                  fare: ev.fare,
                };
                setFoundSeats((prev) => {
                  if (prev.some((p) => p.id === newNotice.id)) return prev;
                  return [...prev, newNotice];
                });
                setCurrentProgressText(
                  `Found ${ev.travelClass} seat: ${ev.from} → ${ev.to}`,
                );
                onSeatsDiscovered?.(train.trainNumber);
              }
            } else if (msg.type === "result" && msg.data) {
              setResult(msg.data);
              const hasSeats = Boolean(
                msg.data.legs && msg.data.legs.length > 0,
              );
              const isComplete = Boolean(msg.data.isComplete);
              const confirmedDurationMinutes =
                calculateConfirmedDurationMinutes(msg.data.legs || []);
              if (hasSeats) {
                onSeatsDiscovered?.(
                  train.trainNumber,
                  isComplete,
                  confirmedDurationMinutes,
                );
              }
              onScanComplete?.(
                train.trainNumber,
                hasSeats,
                isComplete,
                confirmedDurationMinutes,
              );
            } else if (msg.type === "error") {
              setError(msg.message ?? "Scan failed");
              onScanComplete?.(train.trainNumber, false, false, 0);
            }
          } catch {
            /* ignore JSON parse errors */
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Search failed");
        onScanComplete?.(train.trainNumber, false);
      }
    } finally {
      setLoading(false);
    }
  }, [
    hasInitiatedRef,
    journeyDate,
    fromCode,
    toCode,
    isDirectAvailable,
    train.trainNumber,
    train.avlClasses,
    acOnly,
    selectedClasses,
    onSeatsDiscovered,
    onScanStart,
    onScanComplete,
  ]);

  // Auto-run scan for waitlisted train only when autoScanEnabled is true and result not already loaded
  useEffect(() => {
    if (
      !isDirectAvailable &&
      journeyDate &&
      fromCode &&
      toCode &&
      !hasInitiatedRef.current &&
      autoScanEnabled &&
      !result
    ) {
      void executeScan();
    }
  }, [
    isDirectAvailable,
    journeyDate,
    fromCode,
    toCode,
    autoScanEnabled,
    executeScan,
    result,
  ]);

  // Track when confirmed split tickets are loaded
  useEffect(() => {
    if (
      !loading &&
      !error &&
      result?.legs &&
      result.legs.length > 0 &&
      !hasTrackedLoadedRef.current
    ) {
      hasTrackedLoadedRef.current = true;
      trackAnalyticsEvent({
        name: "train_search_v2_tickets_found",
        properties: {
          train_number: train.trainNumber,
          train_name: train.trainName,
          from_code: fromCode,
          to_code: toCode,
          journey_date: journeyDate || "",
          ticket_count: countConfirmedAlternateLegs(
            result.legs,
            result.legCount,
          ),
          is_complete: result.isComplete,
          lowest_fare: lowestDiscoveredFare,
        },
      });
    }
  }, [
    loading,
    error,
    result,
    train.trainNumber,
    train.trainName,
    fromCode,
    toCode,
    journeyDate,
    lowestDiscoveredFare,
  ]);

  // Direct IRCTC redirect link for available class (fallback when the
  // booking engine flag is off or the journey date/fare is missing)
  const directBookingClass = directAvailableClasses[0]?.cls ?? "3A";
  const directBookingUrl = irctcBookingRedirect({
    from: fromCode,
    to: toCode,
    trainNo: train.trainNumber,
    classCode: directBookingClass,
  });

  /** Single confirmed leg built from direct availability for our booking engine. */
  const directBookingLegs = useMemo<AlternateLeg[] | null>(() => {
    if (!isDirectAvailable || !journeyDate) return null;
    return buildDirectBookingLegs({
      from: fromCode,
      to: toCode,
      boardingDate: journeyDate.slice(0, 10),
      classes: directAvailableClasses,
      cache: train.availabilityCache,
      departureTime: train.departureTime ?? null,
      arrivalTime: train.arrivalTime ?? null,
      durationMinutes: train.duration ?? null,
    });
  }, [
    isDirectAvailable,
    journeyDate,
    directAvailableClasses,
    train.availabilityCache,
    train.departureTime,
    train.arrivalTime,
    train.duration,
    fromCode,
    toCode,
  ]);

  const canBookDirect =
    isSplitBookingEnabled &&
    directBookingLegs !== null &&
    lowestAvailableDirectFare != null;

  const openDirectBooking = () => {
    if (!directBookingLegs || !journeyDate) return;
    trackAnalyticsEvent({
      name: "split_booking_book_now_clicked",
      properties: {
        train_number: train.trainNumber,
        train_name: train.trainName,
        journey_date: journeyDate,
        total_fare: lowestAvailableDirectFare ?? 0,
        leg_count: 1,
      },
    });
    const stationNameMap: Record<string, string> = {};
    if (fromName) stationNameMap[fromCode] = fromName;
    if (toName) stationNameMap[toCode] = toName;
    setDirectBookingRequest({
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      journeyDate: journeyDate.slice(0, 10),
      legs: directBookingLegs,
      stationNameMap:
        Object.keys(stationNameMap).length > 0 ? stationNameMap : undefined,
    });
  };

  // Handle card / CTA click to open all-classes modal
  const handleCardClick = () => {
    trackAnalyticsEvent({
      name: "train_search_v2_card_clicked",
      properties: {
        train_number: train.trainNumber,
        train_name: train.trainName,
        from_code: fromCode,
        to_code: toCode,
        journey_date: journeyDate || "",
        is_direct_available: isDirectAvailable,
        ticket_count: result
          ? countConfirmedAlternateLegs(result.legs, result.legCount)
          : foundSeats.length,
        has_alternate_result: Boolean(result),
      },
    });

    if (result) {
      trackAnalyticsEvent({
        name: "alternate_paths_popup_viewed",
        properties: {
          train_number: train.trainNumber,
          from_code: fromCode,
          to_code: toCode,
          journey_date: journeyDate || "",
          trainStartDate: result.trainStartDate ?? undefined,
          source: "skyscanner_search_experiment",
        },
      });

      onOpenFullResultModal?.({
        trainNumber: train.trainNumber,
        trainName: train.trainName,
        avlClasses: train.avlClasses,
        result,
      });
    } else if (isDirectAvailable) {
      if (canBookDirect) {
        openDirectBooking();
      } else {
        trackAnalyticsEvent({
          name: "alternate_paths_irctc_clicked",
          properties: {
            train_number: train.trainNumber,
            from_code: fromCode,
            to_code: toCode,
            class_code: directBookingClass,
            source: "skyscanner_card_direct_click",
          },
        });
        window.open(directBookingUrl, "_blank", "noopener,noreferrer");
      }
    } else if (!loading && !hasInitiatedRef.current) {
      // Start scan on click if not yet initiated
      void executeScan();
    }
  };

  const discoveredCount = result
    ? countConfirmedAlternateLegs(result.legs, result.legCount)
    : foundSeats.length;

  return (
    <>
      <li
        ref={cardRef}
        onClick={handleCardClick}
        className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/20 hover:border-slate-300 sm:p-5"
      >
        <div className="flex flex-col justify-between gap-4 sm:gap-5 md:flex-row md:items-center">
          {/* Left Section: Train Info, Train Schedule CTA, Timing, Route Stations */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 pb-2">
              <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 transition-colors group-hover:text-blue-600 sm:text-lg">
                {train.trainNumber} {train.trainName}
              </h2>

              <div className="flex shrink-0 items-center gap-1.5">
                {onOpenSchedule && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSchedule(
                        train.trainNumber,
                        train.fromStnCode,
                        train.toStnCode,
                      );
                    }}
                    className="inline-flex shrink-0 items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  >
                    <span className="hidden sm:inline">Train </span>Schedule
                  </button>
                )}

                {isDirectAvailable && (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    Direct Available
                  </span>
                )}
              </div>
            </div>

            {/* Timing & Route Row (Skyscanner Style: Departure -> Duration -> Arrival) */}
            <div className="mt-2 flex items-center justify-between gap-2 text-slate-700 sm:gap-6">
              {/* Departure */}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-bold leading-tight text-slate-900 sm:text-xl">
                  {formatTimeAmPm(train.departureTime) ?? "—"}
                </span>
                <span
                  className="mt-0.5 truncate text-xs font-semibold text-slate-600"
                  title={`${fromCode}${fromName ? ` - ${fromName}` : ""}`}
                >
                  <span className="font-bold text-slate-800">{fromCode}</span>
                  {fromName && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      - {fromName}
                    </span>
                  )}
                </span>
              </div>

              {/* Duration Visual Divider */}
              <div className="flex shrink-0 flex-col items-center px-1">
                <span className="text-[11px] font-medium text-slate-400 sm:text-xs">
                  {formatDurationMinutes(train.duration)}
                </span>
                <div className="relative my-1 flex w-16 items-center justify-center sm:w-28">
                  <div className="h-0.5 w-full bg-slate-200" />
                  <span className="absolute bg-white px-1 text-[10px] text-slate-400">
                    Direct
                  </span>
                </div>
              </div>

              {/* Arrival */}
              <div className="flex min-w-0 flex-1 flex-col items-end text-right">
                <span className="text-base font-bold leading-tight text-slate-900 sm:text-xl">
                  {formatTimeAmPm(train.arrivalTime) ?? "—"}
                </span>
                <span
                  className="mt-0.5 max-w-full truncate text-xs font-semibold text-slate-600"
                  title={`${toCode}${toName ? ` - ${toName}` : ""}`}
                >
                  <span className="font-bold text-slate-800">{toCode}</span>
                  {toName && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      - {toName}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Live scanning progress or discovered summary banner */}
            {loading && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 sm:px-3">
                  <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span className="max-w-[200px] truncate sm:max-w-none">
                    {discoveredCount > 0
                      ? `Found ${discoveredCount} confirmed ticket${discoveredCount > 1 ? "s" : ""} across intermediate stations`
                      : currentProgressText ||
                        "Finding available seats across all classes & quotas..."}
                  </span>
                </span>
                {foundSeats.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {foundSeats.slice(-3).map((seat) => (
                      <span
                        key={seat.id}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                      >
                        <span>
                          ✓ {seat.from} → {seat.to}
                        </span>
                        <span className="font-semibold text-emerald-800">
                          ({seat.travelClass}
                          {seat.fare ? ` · ₹${seat.fare}` : ""})
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Section: Price, Live Scanner / Found Count, CTA Action (Skyscanner Style) */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
            {/* Direct Confirmed State */}
            {isDirectAvailable && (
              <>
                <div className="min-w-0 text-left md:text-right">
                  {lowestAvailableDirectFare != null && (
                    <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                      ₹{lowestAvailableDirectFare}
                    </p>
                  )}
                  <p className="max-w-[160px] truncate text-xs font-semibold text-emerald-600 sm:max-w-none">
                    {directAvailableClasses.map((c) => c.cls).join(", ")}{" "}
                    Available
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canBookDirect ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDirectBooking();
                      }}
                      className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
                    >
                      Book Now
                    </button>
                  ) : (
                    <a
                      href={directBookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        trackAnalyticsEvent({
                          name: "alternate_paths_irctc_clicked",
                          properties: {
                            train_number: train.trainNumber,
                            from_code: fromCode,
                            to_code: toCode,
                            class_code: directBookingClass,
                            source: "skyscanner_search_experiment",
                          },
                        });
                      }}
                      className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:px-4 sm:text-sm"
                    >
                      Book IRCTC ↗
                    </a>
                  )}
                </div>
              </>
            )}

            {/* Waitlisted State: Active Live Scanning */}
            {!isDirectAvailable && loading && (
              <>
                <div className="min-w-0 text-left md:text-right">
                  {lowestDiscoveredFare != null ? (
                    <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                      From ₹{lowestDiscoveredFare}
                    </p>
                  ) : lowestStartingFare != null ? (
                    <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                      From ₹{lowestStartingFare}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-slate-400">
                      Checking fares...
                    </p>
                  )}
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span className="max-w-[140px] truncate text-xs font-bold text-blue-600 sm:max-w-none">
                      {discoveredCount > 0
                        ? `Found ${discoveredCount} confirmed ticket${discoveredCount > 1 ? "s" : ""}`
                        : "Finding seats..."}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-600 sm:px-4 sm:text-sm"
                >
                  <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span>Finding seats...</span>
                </button>
              </>
            )}

            {/* Waitlisted State: Scan Finished with Discovered Seats */}
            {!isDirectAvailable && !loading && result && (
              <>
                {discoveredCount > 0 ? (
                  <>
                    <div className="min-w-0 text-left md:text-right">
                      {lowestDiscoveredFare != null && (
                        <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                          From ₹{lowestDiscoveredFare}
                        </p>
                      )}
                      <p className="max-w-[160px] truncate text-xs font-bold text-emerald-600 sm:max-w-none">
                        🎉 Found {discoveredCount} confirmed ticket
                        {discoveredCount > 1 ? "s" : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardClick();
                      }}
                      className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
                    >
                      Select →
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 text-left md:text-right">
                      <p className="text-xs font-medium text-slate-500">
                        All classes waitlisted
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        hasInitiatedRef.current = false;
                        void executeScan();
                      }}
                      className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Re-scan
                    </button>
                  </>
                )}
              </>
            )}

            {/* Waitlisted State: Idle / Pending (Before scroll or scan) */}
            {!isDirectAvailable && !loading && !result && !error && (
              <>
                {lowestStartingFare != null && (
                  <div className="min-w-0 text-left md:text-right">
                    <p className="text-base font-extrabold text-slate-900 sm:text-lg">
                      From ₹{lowestStartingFare}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void executeScan();
                  }}
                  className="inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
                >
                  Find Tickets
                </button>
              </>
            )}

            {/* Error State */}
            {!isDirectAvailable && !loading && error && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-700">Scan failed</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hasInitiatedRef.current = false;
                    void executeScan();
                  }}
                  className="flex min-h-[38px] items-center text-xs font-bold text-blue-600 underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </li>
      {isSplitBookingEnabled && directBookingRequest && (
        <SplitTicketBookingFlow
          {...directBookingRequest}
          onClose={() => setDirectBookingRequest(null)}
        />
      )}
    </>
  );
});
