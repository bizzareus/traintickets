"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { irctcBookingRedirect } from "@/lib/irctcBookingRedirect";
import { cn } from "@/lib/utils";

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
  confirmTktStatus?: string;
};

type TrainListItem = {
  trainNumber: string;
  trainName: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: number;
  trainRating?: number;
  fromStnCode?: string;
  toStnCode?: string;
  avlClasses?: string[];
  availabilityCache?: Record<string, AvailabilityCacheEntry>;
  availabilityCacheTatkal?: Record<string, AvailabilityCacheEntry>;
};

type AlternateLeg = {
  from: string;
  to: string;
  confirmTktStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

type AlternatePathsResponse = {
  trainNumber: string;
  legs: AlternateLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
};

function formatDurationMinutes(mins: number | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
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
  return `${w[dt.getUTCDay()]}, ${d} ${months[mo - 1]}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function StationFieldSimple(props: {
  label: string;
  query: string;
  onQueryChange: (q: string) => void;
  value: StationRow | null;
  onSelect: (s: StationRow) => void;
  suggestions: StationRow[];
  loading: boolean;
  pendingDebounce: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const {
    label,
    query,
    onQueryChange,
    value,
    onSelect,
    suggestions,
    loading,
    pendingDebounce,
    open,
    onOpenChange,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);

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
    <div ref={wrapRef} className="relative min-w-0 flex-1 border-r border-gray-200 px-3 py-2.5 sm:px-4">
      <div className="mb-0.5 flex items-center gap-1.5 text-gray-500">
        <span className="text-primary text-sm" aria-hidden>
          🚂
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <input
        type="text"
        className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-400"
        placeholder="Type station…"
        value={displayText}
        onChange={(e) => {
          onQueryChange(e.target.value);
          onOpenChange(true);
        }}
        onFocus={() => onOpenChange(true)}
      />
      {showList && (
        <ul
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {showLoading && <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>}
          {!showLoading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">No stations</li>
          )}
          {suggestions.map((s) => (
            <li key={`${s.stationCode}-${s.stationName}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
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
  const [fromLoad, setFromLoad] = useState(false);
  const [toLoad, setToLoad] = useState(false);
  const [journeyDate, setJourneyDate] = useState<string | null>(null);
  useEffect(() => {
    setJourneyDate(todayYmd());
  }, []);
  const [trains, setTrains] = useState<TrainListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [altClass, setAltClass] = useState("SL");
  const [altForTrain, setAltForTrain] = useState<string | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [altResult, setAltResult] = useState<AlternatePathsResponse | null>(null);
  const [altError, setAltError] = useState<string | null>(null);

  useEffect(() => {
    if (fromDeb.length < 2) {
      setFromSuggest([]);
      return;
    }
    let c = false;
    setFromLoad(true);
    apiClient
      .get<{ data?: { stationList?: StationRow[] } }>("/api/booking-v2/stations/suggest", {
        params: { q: fromDeb },
      })
      .then((r) => {
        if (!c) setFromSuggest(r.data?.data?.stationList ?? []);
      })
      .catch(() => {
        if (!c) setFromSuggest([]);
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
      return;
    }
    let c = false;
    setToLoad(true);
    apiClient
      .get<{ data?: { stationList?: StationRow[] } }>("/api/booking-v2/stations/suggest", {
        params: { q: toDeb },
      })
      .then((r) => {
        if (!c) setToSuggest(r.data?.data?.stationList ?? []);
      })
      .catch(() => {
        if (!c) setToSuggest([]);
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
    async (trainNumber: string) => {
      if (!fromSt || !toSt || !journeyDate) return;
      setAltForTrain(trainNumber);
      setAltLoading(true);
      setAltError(null);
      setAltResult(null);
      try {
        const r = await apiClient.post<AlternatePathsResponse>("/api/booking-v2/alternate-paths", {
          trainNumber,
          from: fromSt.stationCode,
          to: toSt.stationCode,
          date: journeyDate,
          travelClass: altClass,
          quota: "GN",
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
    [fromSt, toSt, journeyDate, altClass],
  );

  const dateLabel = useMemo(
    () => (journeyDate != null ? formatDateLabel(journeyDate) : "—"),
    [journeyDate],
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-primary text-2xl font-bold tracking-tight sm:text-3xl">Train Ticket Booking</h1>
          <p className="mt-1 text-sm text-gray-500">Easy IRCTC Login</p>
          <p className="mt-3 text-sm text-gray-600">
            <Link href="/" className="text-primary font-medium underline-offset-2 hover:underline">
              Back to home
            </Link>
          </p>
        </header>

        <section className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <StationFieldSimple
              label="From"
              query={fromQ}
              onQueryChange={(q) => {
                setFromQ(q);
                setFromSt(null);
              }}
              value={fromSt}
              onSelect={(s) => {
                setFromSt(s);
                setFromQ(`${s.stationCode} - ${s.stationName}`);
              }}
              suggestions={fromSuggest}
              loading={fromLoad}
              pendingDebounce={fromQ !== fromDeb && fromQ.length >= 2}
              open={fromOpen}
              onOpenChange={setFromOpen}
            />
            <div className="flex items-center justify-center border-gray-200 px-1 py-2 sm:border-r sm:py-0">
              <button
                type="button"
                onClick={swapStations}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50"
                aria-label="Swap from and to"
              >
                ⇄
              </button>
            </div>
            <StationFieldSimple
              label="To"
              query={toQ}
              onQueryChange={(q) => {
                setToQ(q);
                setToSt(null);
              }}
              value={toSt}
              onSelect={(s) => {
                setToSt(s);
                setToQ(`${s.stationCode} - ${s.stationName}`);
              }}
              suggestions={toSuggest}
              loading={toLoad}
              pendingDebounce={toQ !== toDeb && toQ.length >= 2}
              open={toOpen}
              onOpenChange={setToOpen}
            />
            <div className="min-w-0 flex-1 border-t border-gray-200 px-3 py-2.5 sm:border-t-0 sm:border-r sm:border-gray-200 sm:px-4">
              <div className="mb-0.5 flex items-center gap-1.5 text-gray-500">
                <span className="text-sm" aria-hidden>
                  📅
                </span>
                <span className="text-xs font-medium uppercase tracking-wide">Departure Date</span>
              </div>
              <input
                type="date"
                className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 outline-none"
                value={journeyDate ?? ""}
                onChange={(e) => setJourneyDate(e.target.value)}
              />
              <p className="mt-0.5 text-xs text-gray-500">{dateLabel}</p>
            </div>
            <div className="flex items-stretch p-2 sm:p-0">
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searchLoading}
                className="bg-primary hover:bg-primary/90 w-full rounded-lg px-6 py-3 text-sm font-bold uppercase tracking-wide text-white sm:min-w-[120px] sm:rounded-none sm:rounded-r-xl sm:py-0 disabled:opacity-60"
              >
                {searchLoading ? "…" : "Search"}
              </button>
            </div>
          </div>
        </section>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">
            Class for best-available finder:{" "}
            <select
              className="ml-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={altClass}
              onChange={(e) => setAltClass(e.target.value)}
            >
              {["SL", "3A", "2A", "3E", "1A", "CC", "EC"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {searchError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{searchError}</p>
        )}

        <ul className="space-y-4">
          {trains.map((t) => (
            <li
              key={`${t.trainNumber}-${t.departureTime}`}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
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
                <div className="flex flex-col items-end gap-1 text-sm">
                  {t.trainRating != null && (
                    <span className="text-gray-600">
                      ★ {t.trainRating.toFixed(1)}
                    </span>
                  )}
                  <a
                    href={`https://www.confirmtkt.com/train-schedule/${t.trainNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium underline-offset-2 hover:underline"
                  >
                    Schedule
                  </a>
                </div>
              </div>

              <div className="mt-3 -mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-min gap-2 px-1">
                  {(t.avlClasses ?? []).map((cls) => {
                    const gn = t.availabilityCache?.[cls];
                    const tq = t.availabilityCacheTatkal?.[cls];
                    return (
                      <div
                        key={cls}
                        className="min-w-[100px] shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs"
                      >
                        <div className="font-bold text-gray-900">{cls}</div>
                        {gn && (
                          <div className="mt-1 text-gray-700">
                            <div className="text-[10px] uppercase text-gray-500">General</div>
                            <div>{gn.availabilityDisplayName ?? gn.confirmTktStatus ?? "—"}</div>
                            {gn.fare != null && <div className="font-semibold">₹{gn.fare}</div>}
                          </div>
                        )}
                        {tq && (
                          <div className="mt-1 border-t border-gray-200 pt-1 text-gray-700">
                            <div className="text-[10px] uppercase text-gray-500">Tatkal</div>
                            <div>{tq.availabilityDisplayName ?? tq.confirmTktStatus ?? "—"}</div>
                            {tq.fare != null && Number(tq.fare) > 0 && (
                              <div className="font-semibold">₹{tq.fare}</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void findAlternates(t.trainNumber)}
                  disabled={altLoading && altForTrain === t.trainNumber}
                  className={cn(
                    "rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-teal-50",
                    altLoading && altForTrain === t.trainNumber && "opacity-60",
                  )}
                >
                  {altLoading && altForTrain === t.trainNumber ? "Finding…" : "Find best available seats"}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {!searchLoading && trains.length === 0 && fromSt && toSt && (
          <p className="text-center text-sm text-gray-500">No trains loaded yet. Tap Search.</p>
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
              }
            }}
          >
            <div
              className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Best available on train {altForTrain}</h3>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                  onClick={() => {
                    setAltResult(null);
                    setAltError(null);
                    setAltForTrain(null);
                  }}
                >
                  Close
                </button>
              </div>
              {altLoading && <p className="text-sm text-gray-600">Checking segments…</p>}
              {altError && <p className="text-sm text-red-700">{altError}</p>}
              {altResult && (
                <div className="space-y-3 text-sm">
                  {!altResult.isComplete && altResult.legs.some((l) => l.confirmTktStatus === "NO_CONFIRMED_PATH") && (
                    <p className="rounded-md bg-gray-100 px-3 py-2 text-gray-800">
                      No fully confirmed multi-segment path found with the greedy search for class {altClass}.
                    </p>
                  )}
                  {altResult.isComplete && (
                    <p className="text-gray-900">
                      Path covers your journey in {altResult.legCount} ticket(s).
                      {altResult.totalFare != null && (
                        <>
                          {" "}
                          Total fare (sum of segments): ₹{altResult.totalFare.toFixed(0)}
                        </>
                      )}
                    </p>
                  )}
                  <ol className="list-decimal space-y-3 pl-5">
                    {altResult.legs.map((leg, i) => (
                      <li key={i} className="text-gray-800">
                        <span className="font-semibold">
                          {leg.from} → {leg.to}
                        </span>
                        {leg.confirmTktStatus === "NO_CONFIRMED_PATH" ? (
                          <span className="ml-2 text-gray-700">No confirmed segment found from here.</span>
                        ) : (
                          <>
                            <div className="mt-1 text-gray-600">
                              {leg.availabilityDisplayName ?? leg.confirmTktStatus}
                              {leg.predictionPercentage ? ` · ${leg.predictionPercentage}%` : ""}
                            </div>
                            {leg.fare != null && <div className="font-medium">Fare: ₹{leg.fare.toFixed(0)}</div>}
                            {leg.confirmTktStatus !== "NO_CONFIRMED_PATH" && (
                              <a
                                href={irctcBookingRedirect({
                                  from: leg.from,
                                  to: leg.to,
                                  trainNo: altResult.trainNumber,
                                  classCode: altClass,
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary mt-2 inline-block font-medium underline-offset-2 hover:underline"
                              >
                                Book on IRCTC
                              </a>
                            )}
                          </>
                        )}
                      </li>
                    ))}
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
