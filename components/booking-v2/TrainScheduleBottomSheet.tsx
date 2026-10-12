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
        className="animate-in slide-in-from-bottom sm:zoom-in-95 flex h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white duration-300 sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl sm:shadow-2xl"
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
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
          className="flex-1 overflow-y-auto scroll-smooth p-4"
        >
          {loading && (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="text-sm font-medium italic text-gray-500">
                Fetching schedule...
              </p>
            </div>
          )}
          {error && (
            <div className="mx-auto max-w-xs py-12 text-center">
              <p className="mb-2 text-sm font-bold text-red-600">
                Could not load schedule
              </p>
              <p className="text-xs leading-relaxed text-gray-500">{error}</p>
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
                      "group relative flex items-start gap-4 rounded-xl px-3 py-2 transition-all duration-200",
                      highlighted
                        ? "bg-blue-50/60 ring-1 ring-blue-100/50"
                        : "hover:bg-gray-50",
                      (isBoarding || isAlighting) &&
                        "bg-blue-100/40 ring-1 ring-blue-200",
                    )}
                  >
                    {/* Timeline Line/Marker */}
                    <div className="relative flex w-4 shrink-0 flex-col items-center self-stretch">
                      <div
                        className={cn(
                          "z-10 mt-1.5 h-3 w-3 rounded-full border-[2.5px] transition-transform",
                          highlighted
                            ? "scale-110 border-blue-200 bg-blue-600"
                            : "border-gray-300 bg-white",
                          (isBoarding || isAlighting) && "scale-125 shadow-sm",
                        )}
                      />
                      {idx < stationList.length - 1 && (
                        <div
                          className={cn(
                            "absolute bottom-[-10px] top-4 z-0 w-[1.5px] transition-colors",
                            highlighted && idx < toIdx
                              ? "bg-blue-400"
                              : "bg-gray-200",
                          )}
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-sm font-bold tracking-tight",
                            highlighted ? "text-blue-950" : "text-gray-700",
                            (isBoarding || isAlighting) && "text-blue-600",
                          )}
                        >
                          {s.stationName}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-bold uppercase tabular-nums tracking-wider",
                            highlighted ? "text-blue-600/80" : "text-gray-400",
                          )}
                        >
                          Day {s.dayCount ?? 1}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3">
                        <span className="w-7 text-[10px] font-bold uppercase tracking-tighter text-gray-400">
                          Code
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 text-[11px] font-bold uppercase text-gray-600">
                          {s.stationCode}
                        </span>
                      </div>
                      <div className="mt-1 flex gap-4">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-tighter text-gray-400">
                            Arr
                          </span>
                          <span className="text-xs font-bold tabular-nums text-gray-600">
                            {formatTimeAmPm(s.arrivalTime) || "--:--"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-tighter text-gray-400">
                            Dep
                          </span>
                          <span className="text-xs font-bold tabular-nums text-gray-600">
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
