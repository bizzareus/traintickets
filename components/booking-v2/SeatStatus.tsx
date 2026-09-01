"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import { ChevronRight, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { JourneyDatePicker } from "@/components/booking-v2/JourneyDatePicker";
import { IstRailMaintenanceModal } from "@/components/IstRailMaintenance";
import { useIstRailMaintenance } from "@/hooks/useIstRailMaintenance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrainOption = { number: string; label: string };

type StationRow = {
  stationCode: string;
  stationName: string;
};

type CoachOption = {
  coachName: string;
  classCode: string;
  positionFromEngine: number;
  vacantBerths: number;
};

type BerthSplit = {
  splitNo: number;
  from: string;
  to: string;
  quota: string;
  occupancy: boolean;
};

type BerthDetail = {
  cabinCoupe: string | null;
  cabinCoupeNameNo: string | null;
  berthCode: string; // L, M, U, SL, SU
  berthNo: number;
  from: string;
  to: string;
  bsd: BerthSplit[];
  enable: boolean;
};

type CoachCompositionResponse = {
  bdd: BerthDetail[];
  coachName: string;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const BERTH_CODE_LABELS: Record<string, string> = {
  L: "Lower",
  M: "Middle",
  U: "Upper",
  SL: "Side Lower",
  SU: "Side Upper",
};

function getBerthStatus(
  berth: BerthDetail,
): "vacant" | "partial" | "occupied" | "disabled" {
  if (!berth.enable) return "disabled";
  if (!berth.bsd || berth.bsd.length === 0) return "vacant";
  const occupiedCount = berth.bsd.filter((s) => s.occupancy).length;
  if (occupiedCount === 0) return "vacant";
  if (occupiedCount === berth.bsd.length) return "occupied";
  return "partial";
}

const STATUS_COLORS = {
  vacant: {
    bg: "bg-emerald-100 hover:bg-emerald-200",
    border: "border-emerald-300",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
    label: "Vacant",
  },
  partial: {
    bg: "bg-amber-100 hover:bg-amber-200",
    border: "border-amber-300",
    text: "text-amber-800",
    dot: "bg-amber-500",
    label: "Part journey",
  },
  occupied: {
    bg: "bg-red-100 hover:bg-red-200",
    border: "border-red-300",
    text: "text-red-800",
    dot: "bg-red-500",
    label: "Occupied",
  },
  disabled: {
    bg: "bg-gray-100",
    border: "border-gray-200",
    text: "text-gray-400",
    dot: "bg-gray-300",
    label: "N/A",
  },
};

// ---------------------------------------------------------------------------
// TrainAutocomplete
// ---------------------------------------------------------------------------

function TrainAutocomplete({
  value,
  onSelect,
}: {
  value: TrainOption | null;
  onSelect: (t: TrainOption) => void;
}) {
  // `label` already includes the train number (e.g. "12958 - SWRAN J RAJDHANI"),
  // so show it as-is rather than prefixing the number again.
  const [query, setQuery] = useState(value ? value.label : "");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TrainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const debounced = useDebounced(query, 700);

  useEffect(() => {
    if (value) setQuery(value.label);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<TrainOption[]>("/api/irctc/trains", { params: { q } })
      .then((r) => {
        if (!cancelled) setSuggestions(r.data ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load trains. Try again.");
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const showList = open && debounced.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
      >
        Train number / name
      </label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        placeholder="e.g. 12958 or Rajdhani"
        value={query}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              Loading…
            </li>
          )}
          {!loading && error && (
            <li className="px-3 py-2.5 text-sm text-red-600">{error}</li>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-gray-500">
              No trains found.
            </li>
          )}
          {suggestions.map((t) => (
            <li key={t.number}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(t);
                  setQuery(t.label);
                  setOpen(false);
                }}
              >
                <span className="text-gray-700">{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StationField
// ---------------------------------------------------------------------------

function StationField({
  label,
  placeholder,
  value,
  onSelect,
  allowedStations,
}: {
  label: string;
  placeholder?: string;
  value: StationRow | null;
  onSelect: (s: StationRow) => void;
  allowedStations?: StationRow[];
}) {
  const [query, setQuery] = useState(
    value ? `${value.stationCode} - ${value.stationName}` : "",
  );
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<StationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const debounced = useDebounced(query, 700);

  useEffect(() => {
    if (value) setQuery(`${value.stationCode} - ${value.stationName}`);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2 && !allowedStations) {
      setSuggestions([]);
      setError(null);
      return;
    }

    if (allowedStations) {
      if (q.length === 0) {
        setSuggestions(allowedStations);
      } else {
        const lowerQ = q.toLowerCase();
        setSuggestions(
          allowedStations.filter(
            (s) =>
              s.stationCode.toLowerCase().includes(lowerQ) ||
              s.stationName.toLowerCase().includes(lowerQ),
          ),
        );
      }
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data?: { stationList?: StationRow[] } }>(
        "/api/booking-v2/stations/suggest",
        { params: { q, searchString: q } },
      )
      .then((r) => {
        if (!cancelled) setSuggestions(r.data?.data?.stationList ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load stations. Try again.");
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, allowedStations]);

  const showList =
    open && (allowedStations ? true : debounced.trim().length >= 2);

  return (
    <div ref={wrapRef} className="relative">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
      >
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        placeholder={placeholder ?? "Search station…"}
        value={query}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              Loading…
            </li>
          )}
          {!loading && error && (
            <li className="px-3 py-2.5 text-sm text-red-600">{error}</li>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-gray-500">
              No stations found. Try another spelling.
            </li>
          )}
          {suggestions.map((s) => (
            <li key={s.stationCode}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s);
                  setQuery(`${s.stationCode} - ${s.stationName}`);
                  setOpen(false);
                }}
              >
                <span className="font-bold text-blue-700">{s.stationCode}</span>
                <span className="ml-2 text-gray-600">— {s.stationName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Berth Availability List
// ---------------------------------------------------------------------------

function freeSpansOnLeg(b: BerthDetail): [string, string][] {
  const spans: [string, string][] = [];
  let currentSpan: { from: string; to: string } | null = null;

  for (const split of b.bsd) {
    if (!split.occupancy) {
      if (!currentSpan) {
        currentSpan = { from: split.from, to: split.to };
      } else {
        currentSpan.to = split.to;
      }
    } else {
      if (currentSpan) {
        spans.push([currentSpan.from, currentSpan.to]);
        currentSpan = null;
      }
    }
  }
  if (currentSpan) {
    spans.push([currentSpan.from, currentSpan.to]);
  }
  return spans;
}

function BerthAvailabilityList({
  data,
  stationMap,
  bookUrl,
}: {
  data: CoachCompositionResponse;
  stationMap: Record<string, string>;
  bookUrl: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { fullList, partList } = useMemo(() => {
    const full: BerthDetail[] = [];
    const part: BerthDetail[] = [];

    for (const b of data.bdd) {
      if (!b.enable) continue;

      const occupiedSplits = b.bsd.filter((s) => s.occupancy);
      if (occupiedSplits.length === 0) {
        full.push(b);
      } else if (occupiedSplits.length < b.bsd.length) {
        part.push(b);
      }
    }

    full.sort((a, b) => a.berthNo - b.berthNo);
    part.sort((a, b) => a.berthNo - b.berthNo);

    return { fullList: full, partList: part };
  }, [data.bdd]);

  const visibleFull = expanded ? fullList : fullList.slice(0, 4);
  const hiddenCount = fullList.length - visibleFull.length;

  return (
    <div className="w-full">
      {fullList.length > 0 ? (
        <>
          <div className="mb-2.5 mt-2 flex items-center gap-2 px-0.5">
            <CircleCheck className="h-5 w-5 text-emerald-600" />
            <div className="text-base font-medium text-slate-900">
              {fullList.length} {fullList.length === 1 ? "seat" : "seats"} free
              your whole journey
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {visibleFull.map((b) => (
              <SeatRow
                key={b.berthNo}
                berth={b}
                tone="green"
                stationMap={stationMap}
                bookUrl={bookUrl}
              />
            ))}

            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className="py-1.5 text-center text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                + {hiddenCount} more
              </button>
            )}
          </div>
        </>
      ) : partList.length === 0 ? (
        <div className="mt-2 rounded-2xl bg-rose-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-600">
            <X className="h-8 w-8 text-white" />
          </div>
          <div className="text-lg font-medium text-rose-900">
            This coach is full
          </div>
          <div className="mt-1 text-sm text-rose-700">
            There are no seats available for your journey in this coach.
          </div>
        </div>
      ) : null}

      {partList.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {partList.map((b) => (
              <SeatRow
                key={b.berthNo}
                berth={b}
                tone="amber"
                stationMap={stationMap}
                bookUrl={bookUrl}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SeatRow({
  berth,
  tone,
  stationMap,
  bookUrl,
}: {
  berth: BerthDetail;
  tone: "green" | "amber";
  stationMap: Record<string, string>;
  bookUrl: string;
}) {
  const spans = freeSpansOnLeg(berth);

  const c =
    tone === "green"
      ? {
          bg: "bg-emerald-50 hover:bg-emerald-100",
          num: "text-emerald-800",
          numBg: "bg-emerald-200/60",
          label: "text-emerald-900",
          span: "text-emerald-700",
          chev: "text-emerald-300",
        }
      : {
          bg: "bg-white border border-gray-100 hover:bg-gray-50",
          num: "text-amber-900",
          numBg: "bg-amber-100/80",
          label: "text-gray-800",
          span: "text-gray-500",
          chev: "text-gray-300",
        };

  return (
    <div
      className={`flex w-full items-center gap-3 rounded-xl ${c.bg} px-3.5 py-3 text-left`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${c.numBg} shadow-sm`}>
        <span className={`text-[17px] font-bold ${c.num}`}>
          {berth.berthNo}
        </span>
      </div>
      <div className="flex-1">
        <div
          className={`text-[15px] font-medium ${c.label} flex flex-col gap-1`}
        >
          {spans.map(([a, z], i) => {
            const aName = stationMap[a] ? ` (${stationMap[a]})` : "";
            const zName = stationMap[z] ? ` (${stationMap[z]})` : "";
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                {a}{aName} to {z}{zName}
              </div>
            );
          })}
        </div>
        <div className={`mt-0.5 text-[13px] ${c.span}`}>
          {BERTH_CODE_LABELS[berth.berthCode] ?? berth.berthCode}
        </div>
      </div>
      <a
        href={bookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 transition-colors"
      >
        Book this seat
      </a>
    </div>
  );
}

export function SeatStatus() {
  const [selectedTrain, setSelectedTrain] = useState<TrainOption | null>(null);
  const [journeyDate, setJourneyDate] = useState<string | null>(null);
  const [station, setStation] = useState<StationRow | null>(null);
  const [destination, setDestination] = useState<StationRow | null>(null);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [coachesLoading, setCoachesLoading] = useState(false);
  const [coachesError, setCoachesError] = useState<string | null>(null);
  const [coachesErrorKind, setCoachesErrorKind] = useState<
    "connection" | "other"
  >("other");
  // Bumping this re-runs the coach-list loader effect (used by "Try again").
  const [coachReloadKey, setCoachReloadKey] = useState(0);
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);
  const [seatNumber, setSeatNumber] = useState("");

  const [result, setResult] = useState<CoachCompositionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "connection" => IRCTC/Akamai was flaky (503 / network) and it's worth just
  // retrying the same request; "other" => a real problem (bad input, chart not
  // prepared) where retrying won't help.
  const [errorKind, setErrorKind] = useState<"connection" | "other">("other");

  const [trainStations, setTrainStations] = useState<StationRow[] | null>(null);

  // IRCTC nightly maintenance gate. SeatStatus powers both the Chart Vacancy
  // page and the homepage Live Seat Tracker tab, and both read the IRCTC
  // online-charts API, which is down during the window. Route search doesn't
  // use that API, so the gate only lives here.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const {
    maintenanceModalOpen,
    dismissMaintenanceModal,
    displayMinutes,
    onBlockedSearchAttempt,
  } = useIstRailMaintenance(mounted);

  const stationMap = useMemo(
    () =>
      Object.fromEntries(
        trainStations?.map((s) => [s.stationCode, s.stationName]) ?? [],
      ),
    [trainStations],
  );

  const dateInputId = useId();

  useEffect(() => {
    if (!selectedTrain) {
      setTrainStations(null);
      return;
    }
    let cancelled = false;
    apiClient
      .get<{ stationList?: StationRow[] }>(
        `/api/irctc/schedule/${selectedTrain.number}`,
      )
      .then((r) => {
        if (!cancelled && r.data?.stationList) {
          setTrainStations(r.data.stationList);
        }
      })
      .catch(() => {
        if (!cancelled) setTrainStations(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTrain]);

  const destinationStations = useMemo(() => {
    if (!trainStations || !station) return trainStations ?? undefined;
    const idx = trainStations.findIndex(
      (s) => s.stationCode === station.stationCode,
    );
    if (idx === -1) return trainStations;
    return trainStations.slice(idx + 1);
  }, [trainStations, station]);

  useEffect(() => {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setJourneyDate(ymd);
  }, []);

  // Fetch coach list from trainComposition when train+date+station ready
  useEffect(() => {
    if (!selectedTrain || !journeyDate || !station) {
      setCoaches([]);
      setSelectedCoach(null);
      setCoachesError(null);
      return;
    }
    // Block the IRCTC online-charts call during nightly maintenance and show
    // the "Search unavailable" modal instead of letting it fail.
    if (onBlockedSearchAttempt()) {
      setCoaches([]);
      setSelectedCoach(null);
      setCoachesError(null);
      setCoachesLoading(false);
      return;
    }
    let cancelled = false;
    setCoachesLoading(true);
    setCoachesError(null);
    setCoaches([]);
    setSelectedCoach(null);

    apiClient
      .post<{
        cdd?: CoachOption[];
        error?: string | null;
      }>("/api/irctc/train-composition", {
        trainNo: selectedTrain.number,
        jDate: journeyDate,
        boardingStation: station.stationCode,
      })
      .then((r) => {
        if (cancelled) return;
        const cdd = r.data?.cdd ?? [];
        if (cdd.length === 0) {
          setCoachesErrorKind("other");
          setCoachesError(
            r.data?.error ??
              "No coach data available. Chart may not be prepared yet.",
          );
        } else {
          setCoaches(cdd);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const status = (e as { response?: { status?: number } })?.response
            ?.status;
          setCoachesErrorKind(
            status == null || status >= 500 ? "connection" : "other",
          );
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ??
            (e as { message?: string })?.message ??
            "Failed to fetch coach list.";
          setCoachesError(String(msg));
        }
      })
      .finally(() => {
        if (!cancelled) setCoachesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedTrain,
    journeyDate,
    station,
    onBlockedSearchAttempt,
    coachReloadKey,
  ]);

  const resetResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const canSubmit =
    !!selectedTrain &&
    !!journeyDate &&
    !!station &&
    !!selectedCoach &&
    !loading;

  const handleCheck = useCallback(async () => {
    if (
      !canSubmit ||
      !selectedTrain ||
      !journeyDate ||
      !station ||
      !selectedCoach
    )
      return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.post<CoachCompositionResponse>(
        "/api/irctc/coach-composition",
        {
          trainNo: selectedTrain.number,
          boardingStation: station.stationCode,
          remoteStation: destination
            ? destination.stationCode
            : station.stationCode,
          trainSourceStation: station.stationCode,
          jDate: journeyDate,
          coach: selectedCoach.coachName,
          cls: selectedCoach.classCode,
        },
      );
      const data = res.data;
      if (data.error) {
        setErrorKind("other");
        setError(data.error);
        trackAnalyticsEvent({
          name: "seat_status_checked",
          properties: {
            success: false,
            train_number: selectedTrain.number,
            coach: selectedCoach.coachName,
            error: data.error,
          },
        });
      } else {
        setResult(data);
        trackAnalyticsEvent({
          name: "seat_status_checked",
          properties: {
            success: true,
            train_number: selectedTrain.number,
            coach: selectedCoach.coachName,
          },
        });
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      // 503 (IRCTC unreachable after backend retries) or a bare network error
      // (no response) => transient, offer a retry. 4xx => a real client error.
      const isConnection = status == null || status >= 500;
      setErrorKind(isConnection ? "connection" : "other");
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (e as { message?: string })?.message ??
        "Failed to fetch seat status.";
      setError(String(msg));
      trackAnalyticsEvent({
        name: "seat_status_checked",
        properties: {
          success: false,
          train_number: selectedTrain?.number,
          coach: selectedCoach?.coachName,
          error: String(msg),
        },
      });
    } finally {
      setLoading(false);
    }
  }, [
    canSubmit,
    selectedTrain,
    journeyDate,
    station,
    destination,
    selectedCoach,
  ]);

  const highlightBerthNo = useMemo(() => {
    const n = parseInt(seatNumber, 10);
    return !isNaN(n) && n > 0 ? n : null;
  }, [seatNumber]);

  return (
    <div className="space-y-6">
      {/* Form card */}
      <div className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-0 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3.5">
            <TrainAutocomplete
              value={selectedTrain}
              onSelect={(t) => {
                setSelectedTrain(t);
                resetResult();
              }}
            />
          </div>
          <div className="px-4 py-3.5">
            <label
              htmlFor={dateInputId}
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              Date of journey
            </label>
            <JourneyDatePicker
              id={dateInputId}
              value={journeyDate}
              minOffsetDays={-1}
              inputClassName="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              onChange={(ymd) => {
                setJourneyDate(ymd);
                resetResult();
              }}
            />
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3.5">
            <StationField
              label="Boarding station"
              value={station}
              allowedStations={trainStations ?? undefined}
              onSelect={(s) => {
                setStation(s);
                resetResult();
              }}
            />
          </div>
          <div className="px-4 py-3.5">
            <StationField
              label="Destination station (optional)"
              placeholder="Leave empty for all"
              value={destination}
              allowedStations={destinationStations ?? undefined}
              onSelect={(s) => {
                setDestination(s);
                resetResult();
              }}
            />
          </div>
        </div>

        {/* Coach + optional seat number, side by side */}
        <div className="grid gap-0 divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3.5">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Coach
            </label>
            {coachesLoading ? (
              <div className="flex h-[42px] w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <span>Loading coaches…</span>
              </div>
            ) : coachesError ? (
              coachesErrorKind === "connection" ? (
                <div className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                  <span className="truncate font-medium">IRCTC connection issue</span>
                  <button
                    type="button"
                    onClick={() => setCoachReloadKey((k) => k + 1)}
                    className="shrink-0 font-bold text-amber-900 underline hover:text-amber-950"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[42px] w-full items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                  {coachesError}
                </div>
              )
            ) : coaches.length === 0 ? (
              <select
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-400 cursor-not-allowed"
              >
                <option>
                  {selectedTrain && journeyDate && station
                    ? "No coaches found"
                    : "Select train, date & station first"}
                </option>
              </select>
            ) : (
              <select
                value={selectedCoach?.coachName ?? ""}
                onChange={(e) => {
                  const c = coaches.find(
                    (co) => co.coachName === e.target.value,
                  );
                  setSelectedCoach(c ?? null);
                  resetResult();
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select coach…</option>
                {coaches.map((c) => (
                  <option key={c.coachName} value={c.coachName}>
                    {c.coachName} ({c.classCode})
                    {c.vacantBerths > 0 ? ` (${c.vacantBerths} vacant)` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="px-4 py-3.5">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Seat / berth no.{" "}
              <span className="normal-case font-normal text-gray-400">
                (optional)
              </span>
            </label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 23"
              value={seatNumber}
              onChange={(e) => setSeatNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="border-t border-gray-100 px-4 py-3.5">
          <button
            type="button"
            id="seatStatusCheckBtn"
            onClick={() => void handleCheck()}
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto touch-manipulation"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Checking…
              </span>
            ) : (
              "Check berths"
            )}
          </button>
        </div>
      </div>

      {/* Connection trouble — worth just retrying the same request */}
      {error && errorKind === "connection" && (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="alert"
        >
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Trouble connecting to IRCTC servers</p>
            <p className="mt-0.5 text-amber-800">
              IRCTC didn&apos;t respond just now. This is usually temporary —
              please try again.
            </p>
            <button
              type="button"
              onClick={() => void handleCheck()}
              disabled={loading}
              className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Retrying…
                </>
              ) : (
                "Try again"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Real error — retrying won't help */}
      {error && errorKind !== "connection" && (
        <div
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z" />
          </svg>
          <div>
            <p className="font-semibold">Could not fetch seat status</p>
            <p className="mt-0.5 text-red-700">{error}</p>
            <p className="mt-1 text-xs text-red-600">
              The chart may not be prepared yet, or the train/date combination
              is invalid.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-blue-500 px-2 py-0.5 text-xs font-black uppercase tracking-wider">
                  {selectedCoach?.classCode}
                </span>
                <span className="text-lg font-black tracking-tight">
                  {result.coachName}
                </span>
                <span className="text-slate-400">—</span>
                <span className="text-sm font-semibold text-slate-300">
                  {selectedTrain?.label}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>{station?.stationCode}</span>
                <span>·</span>
                <span>
                  {journeyDate
                    ? new Date(journeyDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : ""}
                </span>
                {highlightBerthNo !== null && (
                  <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Berth {highlightBerthNo} highlighted
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={resetResult}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close results"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Coach map */}
          <div className="p-5">
            <BerthAvailabilityList
              data={result}
              stationMap={stationMap}
              bookUrl={`https://www.irctc.co.in/nget/redirect?from=${station?.stationCode ?? ""}&to=${destination?.stationCode ?? station?.stationCode ?? ""}&trainNo=${selectedTrain?.number ?? ""}&class=${selectedCoach?.classCode ?? ""}&page=train-chart`}
            />
          </div>
        </div>
      )}
      <IstRailMaintenanceModal
        open={maintenanceModalOpen}
        onClose={dismissMaintenanceModal}
        minutesDisplay={displayMinutes}
      />
    </div>
  );
}
