"use client";

import { useEffect, useState, useRef } from "react";
import { formatDurationMinutes, formatTimeAmPm } from "@/components/booking-v2/alternatePathHelpers";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import { isBrowserOnLocalhost } from "@/lib/observability";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import type {
  AlternatePathProgressEvent,
  AlternatePathsResponse,
  TrainListItem,
} from "@/components/booking-v2/alternatePathsTypes";
import { TrainChartAlertSection } from "@/components/home/TrainChartAlertSection";



interface AutoSearchTrainCardProps {
  train: TrainListItem;
  journeyDate?: string | null;
  fromCode?: string;
  toCode?: string;
  acOnly?: boolean;

  onOpenSchedule?: (trainNumber: string, from?: string, to?: string) => void;
  onOpenFullResultModal?: (args: {
    trainNumber: string;
    trainName?: string | null;
    avlClasses?: string[];
    result: AlternatePathsResponse;
  }) => void;
  onFallbackToControl?: () => void;
}


interface FoundSeatNotice {
  id: string;
  from: string;
  to: string;
  travelClass: string;
  fare: number | null;
  text: string;
}

export function AutoSearchTrainCard({
  train,
  journeyDate,
  fromCode: searchFrom,
  toCode: searchTo,
  acOnly = false,
  onOpenSchedule,
  onOpenFullResultModal,
  onFallbackToControl,
}: AutoSearchTrainCardProps) {
  const [loading, setLoading] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AlternatePathProgressEvent[]>([]);
  const [foundSeats, setFoundSeats] = useState<FoundSeatNotice[]>([]);
  const [result, setResult] = useState<AlternatePathsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSearchRoute, setCurrentSearchRoute] = useState<string>("");
  const [statusMessage] = useState<string>(
    "Finding you the best seats available in the train..this may take sometime since we are scanning across multiple routes, seats and coaches",
  );


  const hasInitiatedRef = useRef(false);
  const hasTrackedLoadedRef = useRef(false);

  const fromCode = (train.fromStnCode ?? searchFrom ?? "").trim().toUpperCase();
  const toCode = (train.toStnCode ?? searchTo ?? "").trim().toUpperCase();

  // Track when confirmed tickets result is loaded and displayed
  useEffect(() => {
    if (
      !loading &&
      !error &&
      result &&
      result.legs &&
      result.legs.length > 0 &&
      !hasTrackedLoadedRef.current
    ) {
      hasTrackedLoadedRef.current = true;
      trackAnalyticsEvent({
        name: "experiment_a_tickets_loaded",
        properties: {
          train_number: train.trainNumber,
          train_name: train.trainName,
          from_code: fromCode,
          to_code: toCode,
          journey_date: journeyDate || "",
          ticket_count: result.legCount,
          is_complete: result.isComplete,
        },
      });
    }
  }, [loading, error, result, train.trainNumber, train.trainName, fromCode, toCode, journeyDate]);

  // Auto-run search on mount for unavailable trains
  useEffect(() => {
    if (hasInitiatedRef.current || !journeyDate || !fromCode || !toCode) return;
    hasInitiatedRef.current = true;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setProgressEvents([]);
    setFoundSeats([]);
    setCurrentSearchRoute("");


    const controller = new AbortController();

    const runStream = async () => {
      try {
        const isAcClass = (c: string) =>
          !["SL", "2S", "GN", "FC"].includes(c.toUpperCase());
        let baseClasses =
          train.avlClasses && train.avlClasses.length > 0
            ? train.avlClasses
            : undefined;
        if (acOnly && baseClasses) {
          baseClasses = baseClasses.filter(isAcClass);
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
          if (isMounted) {
            setError(msg);
            onFallbackToControl?.();
          }
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

              if (msg.type === "progress" && msg.event && isMounted) {
                const ev = msg.event;
                setProgressEvents((prev) => [...prev, ev]);

                if (ev.type === "route_ok") {
                  setCurrentSearchRoute(`Searching stops between ${ev.from} → ${ev.to}...`);
                } else if (ev.type === "hop_confirmed") {
                  const noticeText = `${ev.from} → ${ev.to} seat found (${ev.travelClass}${ev.fare ? ` · ₹${ev.fare}` : ""})`;
                  const newNotice: FoundSeatNotice = {
                    id: `${ev.from}-${ev.to}-${ev.travelClass}-${ev.hopIndex}`,
                    from: ev.from,
                    to: ev.to,
                    travelClass: ev.travelClass,
                    fare: ev.fare,
                    text: noticeText,
                  };
                  setFoundSeats((prev) => {
                    if (prev.some((p) => p.id === newNotice.id)) return prev;
                    return [...prev, newNotice];
                  });
                  setCurrentSearchRoute(`✓ Found seat: ${ev.from} → ${ev.to} (${ev.travelClass})`);
                } else if (ev.type === "hop_unavailable") {
                  setCurrentSearchRoute(`Checking combinations around ${ev.from} → ${ev.to}...`);
                }
              }
 else if (msg.type === "result" && msg.data && isMounted) {
                setResult(msg.data);
              } else if (msg.type === "error" && isMounted) {
                setError(msg.message ?? "Failed to find available seats");
                onFallbackToControl?.();
              }
            } catch {
              /* ignore malformed lines */
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Search failed");
          onFallbackToControl?.();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    runStream();

    return () => {
      isMounted = false;
      controller.abort();
    };

  }, [journeyDate, fromCode, toCode, train.trainNumber, train.avlClasses, acOnly]);

  // Direct IRCTC redirect link for intermediate legs
  const getBookingUrl = (fromSt: string, toSt: string, cls?: string | null) => {
    return irctcBookingRedirect({
      from: fromSt,
      to: toSt,
      trainNo: train.trainNumber,
      classCode: cls ?? "3A",
    });
  };

  return (
    <li className="rounded-xl border border-blue-200 bg-white p-5 shadow-md transition-shadow hover:shadow-lg flex flex-col md:flex-row md:items-stretch justify-between gap-5">
      {/* Left Column: Header Info + Live Stream / Completed Results */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {train.trainNumber} {train.trainName}
                </h2>
                {isBrowserOnLocalhost() && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                    Variant A Auto-Scan
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">
                  {formatTimeAmPm(train.departureTime) ?? "—"} {train.fromStnCode}
                </span>
                <span className="text-slate-400">
                  {formatDurationMinutes(train.duration)}
                </span>
                <span className="font-semibold text-slate-900">
                  {formatTimeAmPm(train.arrivalTime) ?? "—"} {train.toStnCode}
                </span>
              </div>
            </div>

            {onOpenSchedule && (
              <button
                type="button"
                onClick={() => onOpenSchedule(train.trainNumber, train.fromStnCode, train.toStnCode)}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                View Train Schedule
              </button>
            )}
          </div>

          {/* Loading state with real-time stream status & seat notifications */}
          {loading && (
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <div>
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">
                    {statusMessage}
                  </p>
                  {currentSearchRoute && (
                    <p className="mt-1 text-xs font-semibold text-blue-600 animate-pulse">
                      🔍 {currentSearchRoute}
                    </p>
                  )}
                </div>
              </div>

              {/* Animated progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full animate-pulse rounded-full bg-blue-600 transition-all duration-300 w-3/4" />
              </div>

              {/* Real-time found seats feed */}
              {foundSeats.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-xs font-bold text-emerald-800">
                    Seats discovered so far ({foundSeats.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {foundSeats.map((seat) => (
                      <span
                        key={seat.id}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200"
                      >
                        <span className="font-bold">✓ {seat.from} → {seat.to}</span> ({seat.travelClass}{seat.fare ? ` · ₹${seat.fare}` : ""})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-center justify-between">
                <p className="font-medium">⚠️ {error}</p>
                <button
                  type="button"
                  onClick={() => {
                    hasInitiatedRef.current = false;
                    hasTrackedLoadedRef.current = false;
                    setLoading(true);
                    setError(null);
                  }}
                  className="text-xs font-bold text-amber-900 underline hover:text-amber-950"
                >
                  Retry Auto-Search
                </button>
              </div>
            </div>
          )}

          {/* Completed Results Display */}
          {!loading && !error && result && (
            <div className="mt-4">
              {result.legs && result.legs.length > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-900">
                    🎉 Found {result.legCount} confirmed ticket{result.legCount > 1 ? "s" : ""}!
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      trackAnalyticsEvent({
                        name: "ticket_details_cta_clicked",
                        properties: {
                          train_number: train.trainNumber,
                          train_name: train.trainName,
                          from_code: fromCode,
                          to_code: toCode,
                          journey_date: journeyDate || "",
                          ticket_count: result.legCount,
                          is_complete: result.isComplete,
                        },
                      });
                      onOpenFullResultModal?.({
                        trainNumber: train.trainNumber,
                        trainName: train.trainName,
                        avlClasses: train.avlClasses,
                        result,
                      });
                    }}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25"
                  >
                    Ticket Details
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    No split seat options available for this train.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    All classes and station combinations are currently fully booked or waitlisted.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Vertical Subscribe to Chart Alert CTA */}
      <div className="w-full md:w-64 lg:w-72 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-5 flex flex-col justify-center">
        <TrainChartAlertSection
          trainNumber={train.trainNumber}
          trainName={train.trainName}
          fromCode={fromCode}
          toCode={toCode}
          journeyDate={journeyDate}
          avlClasses={train.avlClasses}
        />
      </div>
    </li>
  );
}

