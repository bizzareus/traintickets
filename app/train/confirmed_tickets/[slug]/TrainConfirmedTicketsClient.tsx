"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Search,
  Train,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  ChevronRight,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import type { AlternatePathsResponse } from "@/components/booking-v2/alternatePathsTypes";

const AlternatePathContent = dynamic(
  () =>
    import("@/components/booking-v2/AlternatePathContent").then(
      (m) => m.AlternatePathContent,
    ),
  {
    loading: () => (
      <div className="flex h-64 items-center justify-center p-6">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    ),
  },
);

const TrainScheduleBottomSheet = dynamic(
  () =>
    import("@/components/booking-v2/TrainScheduleBottomSheet").then(
      (m) => m.TrainScheduleBottomSheet,
    ),
);

export type CachedSeat = {
  date: string;
  travelClass: string;
  status: string; // e.g., "AVAILABLE-0042", "WL 12", "REGRET"
  fare?: number | null;
  updatedAt?: string;
};

export type TrainInfo = {
  trainNumber: string;
  trainName: string;
  originStation?: string;
  destinationStation?: string;
  availableClasses?: string[];
  departureTime?: string;
  arrivalTime?: string;
  schedule?: {
    stationList?: Array<{
      stationCode: string;
      stationName: string;
      arrivalTime: string;
      departureTime: string;
      haltTimeMinutes?: number;
      distanceKm?: number;
    }>;
  };
};

type Props = {
  trainInfo: TrainInfo;
  slug: string;
  cachedSeats: CachedSeat[];
  chartTimesSlug?: string | null;
  faqEntries?: Array<{ q: string; a: string }>;
};

function formatSeatDateLabel(rawDate: string): string {
  if (!rawDate) return "";
  const parts = rawDate.split("-").map(Number);
  if (parts.length !== 3) return rawDate;
  const [y, m, d] = parts;
  const target = new Date(y, m - 1, d, 12);

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const todayStr = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;

  const tomorrow = new Date(istNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;

  const dateFmt = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(target);

  if (rawDate === todayStr) return `Today • ${dateFmt}`;
  if (rawDate === tomorrowStr) return `Tomorrow • ${dateFmt}`;
  return dateFmt;
}

function getUpcomingDates(count = 7): string[] {
  const dates: string[] = [];
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);

  for (let i = 0; i < count; i++) {
    const d = new Date(istNow.getTime() + i * 24 * 60 * 60 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

function getStatusDetails(status: string) {
  const upper = (status || "").toUpperCase();
  if (
    upper.includes("CHECK_AVAILABLE") ||
    upper.includes("CHECK_AVBL") ||
    upper.includes("CHECK AVAILABLE") ||
    upper.includes("CHECK LIVE") ||
    upper.includes("NOT_CHECKED")
  ) {
    return {
      type: "check_available" as const,
      label: "Check Availability",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
      cardBorder: "border-slate-200 hover:border-blue-300 bg-white",
      statusColor: "text-blue-700",
      isConfirmed: false,
    };
  }
  if (
    upper.includes("AVAILABLE") ||
    upper.includes("CURR_AVBL") ||
    upper.includes("AVL")
  ) {
    return {
      type: "available" as const,
      label: "Available",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      cardBorder: "border-emerald-200 hover:border-emerald-300 bg-white",
      statusColor: "text-emerald-700",
      isConfirmed: true,
    };
  }
  if (
    upper.includes("WL") ||
    upper.includes("RAC") ||
    upper.includes("WAITING")
  ) {
    return {
      type: "waitlist" as const,
      label: upper.includes("RAC") ? "RAC" : "Waitlist",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      cardBorder: "border-amber-200 hover:border-amber-300 bg-white",
      statusColor: "text-amber-700",
      isConfirmed: false,
    };
  }
  if (
    upper.includes("REGRET") ||
    upper.includes("NOT AVAILABLE") ||
    upper.includes("TRAIN CANCELLED")
  ) {
    return {
      type: "regret" as const,
      label: "Regret / Sold Out",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      cardBorder: "border-slate-200 hover:border-slate-300 bg-white",
      statusColor: "text-rose-700",
      isConfirmed: false,
    };
  }
  return {
    type: "neutral" as const,
    label: "Check Availability",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    cardBorder: "border-slate-200 hover:border-blue-300 bg-white",
    statusColor: "text-blue-700",
    isConfirmed: false,
  };
}

export default function TrainConfirmedTicketsClient({
  trainInfo,
  cachedSeats,
  chartTimesSlug,
  faqEntries = [],
}: Props) {
  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [localSeatsMap, setLocalSeatsMap] = useState<Map<string, CachedSeat>>(
    new Map(),
  );
  const [checkingCardKey, setCheckingCardKey] = useState<string | null>(null);
  const [checkingProgressText, setCheckingProgressText] = useState<string>("");
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [activeModalData, setActiveModalData] = useState<{
    result: AlternatePathsResponse;
    date: string;
    travelClass: string;
  } | null>(null);
  const [scheduleTrainNumber, setScheduleTrainNumber] = useState<string | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const trainNumber = trainInfo.trainNumber;
  const trainName = trainInfo.trainName || `Train ${trainNumber}`;
  const origin = trainInfo.originStation || "Origin";
  const dest = trainInfo.destinationStation || "Destination";

  const stations = useMemo(
    () => trainInfo.schedule?.stationList || [],
    [trainInfo.schedule?.stationList],
  );

  const [fromStation, setFromStation] = useState<string>(origin);
  const [toStation, setToStation] = useState<string>(dest);

  const handleFromChange = (code: string) => {
    setFromStation(code);
    setLocalSeatsMap(new Map());
    setCardErrors({});
    const fromIdx = stations.findIndex((s) => s.stationCode === code);
    const toIdx = stations.findIndex((s) => s.stationCode === toStation);
    if (fromIdx >= 0 && toIdx <= fromIdx && fromIdx < stations.length - 1) {
      setToStation(dest !== code ? dest : stations[fromIdx + 1].stationCode);
    }
  };

  const handleToChange = (code: string) => {
    setToStation(code);
    setLocalSeatsMap(new Map());
    setCardErrors({});
  };

  const classesAvailable = useMemo(() => {
    const fromSeats = cachedSeats.map((s) => s.travelClass);
    const fromLocal = Array.from(localSeatsMap.values()).map(
      (s) => s.travelClass,
    );
    const fromTrain = trainInfo.availableClasses || [];
    const merged = Array.from(
      new Set([...fromSeats, ...fromLocal, ...fromTrain]),
    ).filter(Boolean);
    return merged.length > 0 ? merged.sort() : ["3A", "2A", "1A"];
  }, [cachedSeats, localSeatsMap, trainInfo.availableClasses]);

  const upcomingDates = useMemo(() => {
    const defaultDates = getUpcomingDates(7);
    const seatDates = cachedSeats.map((s) => s.date).filter(Boolean);
    const localDates = Array.from(localSeatsMap.values())
      .map((s) => s.date)
      .filter(Boolean);
    return Array.from(
      new Set([...defaultDates, ...seatDates, ...localDates]),
    ).sort();
  }, [cachedSeats, localSeatsMap]);

  const seatItems = useMemo(() => {
    const cachedMap = new Map<string, CachedSeat>();
    for (const s of cachedSeats) {
      cachedMap.set(`${s.date}#${s.travelClass}`, s);
    }
    for (const [k, v] of localSeatsMap.entries()) {
      cachedMap.set(k, v);
    }

    const targetClasses =
      selectedClass === "ALL" ? classesAvailable : [selectedClass];

    const items: Array<CachedSeat & { isLiveCheck?: boolean }> = [];
    for (const date of upcomingDates) {
      for (const cls of targetClasses) {
        const key = `${date}#${cls}`;
        const cached = cachedMap.get(key);
        if (cached) {
          items.push(cached);
        } else {
          items.push({
            date,
            travelClass: cls,
            status: "Check Available",
            isLiveCheck: true,
          });
        }
      }
    }
    return items;
  }, [
    cachedSeats,
    localSeatsMap,
    upcomingDates,
    classesAvailable,
    selectedClass,
  ]);

  const handleCheckAvailability = useCallback(
    async (date: string, travelClass: string) => {
      const cardKey = `${date}#${travelClass}`;
      setCheckingCardKey(cardKey);
      setCheckingProgressText("Connecting to rail systems...");
      setCardErrors((prev) => {
        const next = { ...prev };
        delete next[cardKey];
        return next;
      });

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const apiUrl = getApiUrl();
        const resp = await fetch(
          `${apiUrl}/api/booking-v2/alternate-paths/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trainNumber,
              from: fromStation,
              to: toStation,
              date,
              quota: "GN",
              forceRefresh: true,
              avlClasses: [travelClass],
            }),
            signal: controller.signal,
          },
        );

        if (!resp.ok || !resp.body) {
          let msg = `Search failed (${resp.status})`;
          try {
            const j = await resp.json();
            if (j.message) msg = j.message;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let finalResult: AlternatePathsResponse | null = null;

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
              const chunk = JSON.parse(trimmed);
              if (chunk.type === "progress" && chunk.event) {
                const ev = chunk.event;
                if (ev.type === "check_start") {
                  setCheckingProgressText(`Checking ${ev.from} → ${ev.to}...`);
                } else if (ev.type === "route_ok") {
                  setCheckingProgressText(
                    `Scanning ${ev.stopCount || ""} route stations...`,
                  );
                } else if (ev.type === "check_result" && ev.hasSeat) {
                  setCheckingProgressText(`Found seat: ${ev.from} → ${ev.to}`);
                }
              } else if (chunk.type === "result" && chunk.data) {
                finalResult = chunk.data;
              } else if (chunk.type === "error") {
                throw new Error(chunk.message || "Failed to search availability");
              }
            } catch (e) {
              if (
                e instanceof Error &&
                e.message !== "Failed to search availability"
              ) {
                // Ignore parse errors on malformed line
              } else {
                throw e;
              }
            }
          }
        }

        if (!finalResult) {
          throw new Error("No availability data returned");
        }

        const confirmedLegs = (finalResult.legs || []).filter(
          (l) => l.segmentKind === "confirmed",
        );
        const isDirectConfirmed =
          finalResult.isComplete &&
          confirmedLegs.length === 1 &&
          confirmedLegs[0].from === fromStation &&
          confirmedLegs[0].to === toStation;

        let updatedStatus = "Waitlist / Sold Out";
        let updatedFare = finalResult.totalFare ?? null;

        if (isDirectConfirmed) {
          const leg = confirmedLegs[0];
          updatedStatus =
            leg.availabilityDisplayName ||
            leg.availablityStatus ||
            "AVAILABLE";
          updatedFare = leg.fare ?? updatedFare;
        } else if (confirmedLegs.length > 0) {
          updatedStatus = finalResult.isComplete
            ? "Smart Seat Confirmed"
            : `${confirmedLegs.length} Confirmed Leg${confirmedLegs.length > 1 ? "s" : ""}`;
          setActiveModalData({
            result: finalResult,
            date,
            travelClass,
          });
        } else {
          const wlMatch = finalResult.debugLog?.find(
            (l) =>
              l.includes(`${fromStation} → ${toStation}`) &&
              l.includes("Waiting"),
          );
          if (wlMatch) {
            const m = wlMatch.match(/\((Waiting \([^)]+\)|WL\s*\d+)\)/i);
            if (m) {
              updatedStatus = m[1]
                .replace(/Waiting\s*\(/i, "WL ")
                .replace(/\)/g, "");
            }
          }
        }

        setLocalSeatsMap((prev) => {
          const next = new Map(prev);
          next.set(cardKey, {
            date,
            travelClass,
            status: updatedStatus,
            fare: updatedFare,
            updatedAt: new Date().toISOString(),
          });
          return next;
        });
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const msg =
          err instanceof Error ? err.message : "Failed to check availability";
        setCardErrors((prev) => ({ ...prev, [cardKey]: msg }));
      } finally {
        if (!controller.signal.aborted) {
          setCheckingCardKey(null);
          setCheckingProgressText("");
        }
      }
    },
    [trainNumber, fromStation, toStation],
  );

  const searchUrl = `/?from=${encodeURIComponent(fromStation)}&to=${encodeURIComponent(toStation)}`;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Breadcrumb ── */}
      <nav
        className="flex items-center text-xs font-medium text-slate-500 sm:text-sm"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="transition-colors hover:text-blue-600">
          Home
        </Link>
        <ChevronRight className="mx-1.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="text-slate-500">Confirmed Tickets</span>
        <ChevronRight className="mx-1.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate font-semibold text-slate-900">
          {trainName} ({trainNumber})
        </span>
      </nav>

      {/* ── Main Hero Card & Seat Availability Matrix ── */}
      <header className="shadow-xs space-y-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {chartTimesSlug && (
              <Link
                href={`/chart-times/${chartTimesSlug}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                <Clock className="h-3.5 w-3.5" />
                Chart Preparation Times →
              </Link>
            )}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
            Confirmed Tickets for {trainName}{" "}
            <span className="font-bold text-blue-600">({trainNumber})</span>
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Live seat availability, post-charting vacant berths, and Smart Seats
            split-booking options for travel from{" "}
            <span className="font-semibold text-slate-800">{fromStation}</span>{" "}
            to <span className="font-semibold text-slate-800">{toStation}</span>
            .
          </p>
        </div>

        {/* ── Route Station Selector ("Between the routes") ── */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Route:
            </span>
            {stations.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={fromStation}
                  onChange={(e) => handleFromChange(e.target.value)}
                  className="shadow-2xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Select origin station"
                >
                  {stations.slice(0, -1).map((st) => (
                    <option key={st.stationCode} value={st.stationCode}>
                      {st.stationName} ({st.stationCode})
                    </option>
                  ))}
                </select>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <select
                  value={toStation}
                  onChange={(e) => handleToChange(e.target.value)}
                  className="shadow-2xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Select destination station"
                >
                  {stations.slice(1).map((st) => (
                    <option key={st.stationCode} value={st.stationCode}>
                      {st.stationName} ({st.stationCode})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <span className="rounded border border-slate-200 bg-white px-2 py-0.5">
                  {origin}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="rounded border border-slate-200 bg-white px-2 py-0.5">
                  {dest}
                </span>
              </div>
            )}
          </div>

          {/* Class Filter Pills */}
          {classesAvailable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedClass("ALL")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  selectedClass === "ALL"
                    ? "shadow-xs bg-blue-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Classes
              </button>
              {classesAvailable.map((cls) => (
                <button
                  type="button"
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    selectedClass === cls
                      ? "shadow-xs bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Direct Seat Availability Matrix for Dates ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Calendar className="h-4 w-4 text-blue-600" />
              Seat Availability across Dates
            </h2>
            <span className="text-xs font-medium text-slate-500">
              {fromStation} → {toStation}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seatItems.map((seat, idx) => {
              const cardKey = `${seat.date}#${seat.travelClass}`;
              const isChecking = checkingCardKey === cardKey;
              const cardError = cardErrors[cardKey];
              const details = getStatusDetails(seat.status);
              const isCheckAvailable =
                details.type === "check_available" ||
                Boolean(seat.isLiveCheck) ||
                seat.status === "CHECK_AVAILABLE";

              const displayStatus = isCheckAvailable
                ? "Check Availability"
                : seat.status;
              const displayLabel = isCheckAvailable
                ? "Live check required"
                : details.label;

              const directBookingUrl = details.isConfirmed
                ? irctcBookingRedirect({
                    from: fromStation,
                    to: toStation,
                    trainNo: trainNumber,
                    classCode: seat.travelClass,
                  })
                : null;

              return (
                <div
                  key={`${seat.date}-${seat.travelClass}-${idx}`}
                  className={`rounded-xl border p-4 transition-all duration-150 ${
                    isChecking
                      ? "border-blue-400 bg-blue-50/20 shadow-xs"
                      : details.cardBorder
                  } shadow-2xs flex flex-col justify-between gap-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {formatSeatDateLabel(seat.date)}
                    </span>
                    <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                      Class {seat.travelClass}
                    </span>
                  </div>

                  {isChecking ? (
                    <div className="flex w-full items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/80 p-2.5">
                      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-bold text-blue-900">
                          Searching for real time availability of ticket...
                        </span>
                        {checkingProgressText && (
                          <span className="truncate text-[10px] font-medium text-blue-600">
                            {checkingProgressText}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1">
                        <div>
                          <div
                            className={`text-sm font-extrabold sm:text-base ${details.statusColor}`}
                          >
                            {displayStatus}
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {displayLabel}
                            {seat.fare != null && seat.fare > 0
                              ? ` • ₹${seat.fare.toLocaleString("en-IN")}`
                              : ""}
                          </span>
                        </div>

                        {details.isConfirmed ? (
                          directBookingUrl ? (
                            <a
                              href={directBookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.99]"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Book on IRCTC
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Confirmed
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleCheckAvailability(
                                seat.date,
                                seat.travelClass,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 active:scale-[0.99]"
                          >
                            <Zap className="h-3 w-3 text-amber-300" />
                            {isCheckAvailable ? "Check Available" : "Smart Seat"}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {cardError && (
                        <div className="flex items-center justify-between gap-2 rounded-md bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700">
                          <span className="truncate">{cardError}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCheckAvailability(
                                seat.date,
                                seat.travelClass,
                              )
                            }
                            className="shrink-0 font-bold underline hover:text-rose-900"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Direct Action Buttons ── */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <Link
            href={searchUrl}
            className="shadow-xs inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99]"
          >
            <Search className="h-4 w-4" />
            Search Smart Seats ({fromStation} → {toStation})
          </Link>
          <Link
            href="/chart-vacancy"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99]"
          >
            <Train className="h-4 w-4 text-slate-500" />
            Check Chart Vacancy
          </Link>
          {chartTimesSlug && (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99]"
            >
              <Clock className="h-4 w-4 text-slate-500" />
              Chart Timing
            </Link>
          )}
        </div>
      </header>

      {/* ── Guaranteed Confirmation Guide Card ── */}
      <section className="shadow-xs space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            How to Guarantee a Confirmed Seat on {trainName} ({trainNumber})
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
            Two proven booking strategies when direct tickets are sold out or on
            Waitlist.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-blue-950">
              <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600" />
              1. Smart Seats (Contiguous Split Booking)
            </h3>
            <p className="text-xs leading-relaxed text-slate-700 sm:text-sm">
              When tickets from {origin} to {dest} show{" "}
              <span className="inline-block rounded bg-rose-100 px-1 py-0.5 text-xs font-bold text-rose-700">
                REGRET
              </span>
              , Indian Railways locks the full route. LastBerth scans
              intermediate station pairs on this exact train to find contiguous
              confirmed berths so you travel on the same train without switching
              coaches.
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50 p-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Train className="h-5 w-5 shrink-0 text-slate-700" />
              2. Post-Chart Current Reservation (`CURR_AVBL`)
            </h3>
            <p className="text-xs leading-relaxed text-slate-700 sm:text-sm">
              When 1st reservation charts are prepared (typically 4 hours before
              departure), unallotted Tatkal and quota seats are released to the
              public as{" "}
              <span className="inline-block rounded bg-emerald-100 px-1 py-0.5 text-xs font-bold text-emerald-800">
                CURR_AVBL
              </span>
              . Check{" "}
              <Link
                href="/chart-vacancy"
                className="font-semibold text-blue-600 hover:underline"
              >
                Chart Vacancy
              </Link>{" "}
              right after charting to book immediately on IRCTC.
            </p>
          </div>
        </div>
      </section>

      {/* ── Train Route Halts & Split Opportunities Table ── */}
      {stations.length > 0 && (
        <section className="shadow-xs rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <MapPin className="h-5 w-5 text-blue-600" />
                Scheduled Halts &amp; Split Booking Stations
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
                Intermediate stations on {trainName} ({trainNumber}) where split
                segments can be booked.
              </p>
            </div>
            <span className="self-start rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 sm:self-auto">
              {stations.length} Stops Total
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-900">
                  <th className="p-3">#</th>
                  <th className="p-3">Station</th>
                  <th className="p-3">Arrival</th>
                  <th className="p-3">Departure</th>
                  <th className="p-3">Halt</th>
                  <th className="p-3">Distance</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stations.map((st, i) => {
                  const isOrigin = i === 0;
                  const isDestination = i === stations.length - 1;
                  return (
                    <tr
                      key={i}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="p-3 font-medium text-slate-400">
                        {i + 1}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{st.stationName}</span>
                          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {st.stationCode}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        {isOrigin ? "—" : st.arrivalTime || "—"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {isDestination ? "—" : st.departureTime || "—"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {st.haltTimeMinutes ? `${st.haltTimeMinutes} min` : "—"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {st.distanceKm != null ? `${st.distanceKm} km` : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {!isDestination && (
                          <button
                            type="button"
                            onClick={() => {
                              handleFromChange(st.stationCode);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Check seats from here
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── FAQ Section ── */}
      {faqEntries.length > 0 && (
        <section className="shadow-xs rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="mb-4 text-xl font-bold text-slate-900">
            Frequently Asked Questions
          </h2>
          <div className="divide-y divide-slate-100">
            {faqEntries.map((faq, i) => {
              const isOpen = openFaqIndex === i;
              return (
                <div key={i} className="py-3.5">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 text-left font-semibold text-slate-900 transition-colors hover:text-blue-600"
                  >
                    <span className="text-sm sm:text-base">{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-blue-600" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-2.5 pr-6 text-xs leading-relaxed text-slate-600 sm:text-sm">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {/* ── Smart Seats Split-Booking Modal ── */}
      {activeModalData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setActiveModalData(null)}
        >
          <div
            className="animate-in slide-in-from-bottom sm:zoom-in-95 flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl duration-300 sm:h-auto sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-gray-200"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden">
              <div className="h-1.5 w-12 rounded-full bg-slate-300" />
            </div>
            <AlternatePathContent
              altForTrain={trainNumber}
              altTrainName={trainName}
              altAvlClasses={[activeModalData.travelClass]}
              altLoading={false}
              altResult={activeModalData.result}
              altError={null}
              altProgress={[]}
              journeyDate={activeModalData.date}
              fromCode={fromStation}
              toCode={toStation}
              isAdminUser={false}
              onClose={() => setActiveModalData(null)}
              onOpenSchedule={(tn) => setScheduleTrainNumber(tn)}
              hideSearchAllTrainsBanner={true}
              source="train_confirmed_tickets"
            />
          </div>
        </div>
      )}

      {/* ── Train Route Halts / Schedule Sheet ── */}
      {scheduleTrainNumber && (
        <TrainScheduleBottomSheet
          open={Boolean(scheduleTrainNumber)}
          onClose={() => setScheduleTrainNumber(null)}
          trainNumber={scheduleTrainNumber}
          highlightFrom={fromStation}
          highlightTo={toStation}
        />
      )}
    </div>
  );
}
