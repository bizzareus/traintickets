"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTimeAmPm } from "./alternatePathHelpers";

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

export function TrainScheduleBottomSheet({
  open,
  onClose,
  trainNumber,
  highlightFrom,
  highlightTo,
}: {
  open: boolean;
  onClose: () => void;
  trainNumber: string;
  highlightFrom: string;
  highlightTo: string;
}) {
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const boardingStationRef = useRef<HTMLDivElement>(null);

  const stationList = schedule?.stationList || [];
  const from = highlightFrom.toUpperCase();
  const to = highlightTo.toUpperCase();

  const fromIdx = stationList.findIndex(
    (s: any) => s.stationCode.toUpperCase() === from,
  );
  const toIdx = stationList.findIndex(
    (s: any) => s.stationCode.toUpperCase() === to,
  );

  useEffect(() => {
    if (!open || !trainNumber) return;
    setLoading(true);
    setSchedule(null);
    setError(null);
    apiClient
      .get(`/api/booking-v2/trains/schedule/${trainNumber}`)
      .then((r) => {
        setSchedule(r.data);
      })
      .catch((e) => {
        setError(extractAxiosMessage(e));
      })
      .finally(() => setLoading(false));
  }, [open, trainNumber]);

  // Auto-scroll to boarding station once loaded
  useEffect(() => {
    if (!loading && schedule && fromIdx >= 0 && open) {
      const timer = setTimeout(() => {
        boardingStationRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, schedule, fromIdx, open]);

  if (!open) return null;

  const isInRange = (idx: number) => {
    if (fromIdx < 0 || toIdx < 0) return false;
    return idx >= fromIdx && idx <= toIdx;
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full flex-col bg-white rounded-t-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl sm:shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Train Schedule</h3>
            <p className="text-xs font-semibold text-blue-600">
              Train #{trainNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 scroll-smooth"
        >
          {loading && (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="text-sm font-medium text-gray-500 italic">
                Fetching schedule...
              </p>
            </div>
          )}
          {error && (
            <div className="mx-auto max-w-xs py-12 text-center">
              <p className="mb-2 text-sm font-bold text-red-600">
                Could not load schedule
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">{error}</p>
            </div>
          )}
          {!loading && !error && stationList.length > 0 && (
            <div className="space-y-0.5">
              {stationList.map((s: any, idx: number) => {
                const highlighted = isInRange(idx);
                const isBoarding = idx === fromIdx;
                const isAlighting = idx === toIdx;

                return (
                  <div
                    key={idx}
                    ref={isBoarding ? boardingStationRef : null}
                    className={cn(
                      "group relative flex items-start gap-4 px-3 py-2 rounded-xl transition-all duration-200",
                      highlighted
                        ? "bg-blue-50/60 ring-1 ring-blue-100/50"
                        : "hover:bg-gray-50",
                      (isBoarding || isAlighting) &&
                        "bg-blue-100/40 ring-1 ring-blue-200",
                    )}
                  >
                    {/* Timeline Line/Marker */}
                    <div className="relative flex flex-col items-center w-4 shrink-0 self-stretch">
                      <div
                        className={cn(
                          "mt-1.5 h-3 w-3 rounded-full border-[2.5px] z-10 transition-transform",
                          highlighted
                            ? "bg-blue-600 border-blue-200 scale-110"
                            : "bg-white border-gray-300",
                          (isBoarding || isAlighting) && "scale-125 shadow-sm",
                        )}
                      />
                      {idx < stationList.length - 1 && (
                        <div
                          className={cn(
                            "absolute top-4 bottom-[-10px] w-[1.5px] z-0 transition-colors",
                            highlighted && idx < toIdx
                              ? "bg-blue-400"
                              : "bg-gray-200",
                          )}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm font-bold truncate tracking-tight",
                            highlighted ? "text-blue-950" : "text-gray-700",
                            (isBoarding || isAlighting) && "text-blue-600",
                          )}
                        >
                          {s.stationName}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-bold uppercase tracking-wider tabular-nums",
                            highlighted ? "text-blue-600/80" : "text-gray-400",
                          )}
                        >
                          Day {s.dayCount ?? 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter w-7">
                          Code
                        </span>
                        <span className="text-[11px] font-bold text-gray-600 bg-gray-100 px-1.5 rounded uppercase">
                          {s.stationCode}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-1">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                            Arr
                          </span>
                          <span className="text-xs font-bold text-gray-600 tabular-nums">
                            {formatTimeAmPm(s.arrivalTime) || "--:--"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                            Dep
                          </span>
                          <span className="text-xs font-bold text-gray-600 tabular-nums">
                            {formatTimeAmPm(s.departureTime) || "--:--"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
