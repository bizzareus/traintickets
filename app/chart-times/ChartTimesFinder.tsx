"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CalendarDays, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { buildChartTimesSlug } from "@/lib/chartTimesSlug";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import { useDebounce } from "@/lib/hooks/useDebounce";

export type TrainOption = { trainNumber: string; trainName: string };

interface ChartTimesFinderProps {
  initialPopularTrains?: TrainOption[];
}

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Searchable train picker + journey date → navigates to that train's chart-times page. */
export default function ChartTimesFinder({
  initialPopularTrains = [],
}: ChartTimesFinderProps) {
  const router = useRouter();
  const [searchResults, setSearchResults] = useState<TrainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TrainOption | null>(null);
  const [open, setOpen] = useState(false);
  const [journeyDate, setJourneyDate] = useState("");
  const [navigating, setNavigating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Default the journey date to today. Done after mount (not via initial state)
  // so the server-rendered HTML and client hydration can't disagree on "today"
  // across timezones / the midnight boundary.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJourneyDate(todayYmd());
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isSelectionActive =
    !!selected &&
    debouncedQuery.trim() ===
      `${selected.trainNumber} — ${selected.trainName}`.trim();
  const isQueryLongEnough = debouncedQuery.trim().length >= 2;
  const isSearching = isQueryLongEnough && !isSelectionActive;

  // Search trains via API with debounce
  useEffect(() => {
    const q = debouncedQuery.trim();

    if (
      selected &&
      q === `${selected.trainNumber} — ${selected.trainName}`.trim()
    ) {
      return;
    }

    if (q.length < 2) {
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(false);

    apiClient
      .get<Array<{ trainNumber?: string; trainName?: string; label?: string }>>(
        "/api/trains",
        { params: { q } },
      )
      .then((res) => {
        if (cancelled) return;
        const list = (res.data || [])
          .map((t) => ({
            trainNumber: String(t.trainNumber ?? "").trim(),
            trainName: String(t.trainName ?? "").trim(),
          }))
          .filter((t) => t.trainNumber);
        setSearchResults(list);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selected]);

  const trains = isSearching ? searchResults : initialPopularTrains;

  // The train we'll navigate to: an explicit selection, else a bare number typed in.
  const resolvedTrain: TrainOption | null = useMemo(() => {
    if (selected) return selected;
    const raw = query.trim();
    const match = raw.match(/^(\d{3,6})(?:\s*[-—]\s*(.*))?$/);
    if (match) {
      const num = match[1];
      const name = match[2]?.trim() || "";
      const known = trains.find((t) => t.trainNumber === num);
      return known ?? { trainNumber: num, trainName: name };
    }
    return null;
  }, [selected, query, trains]);

  function selectTrain(t: TrainOption) {
    setSelected(t);
    setQuery(`${t.trainNumber} — ${t.trainName}`);
    setOpen(false);
    trackAnalyticsEvent({
      name: "chart_times_train_selected",
      properties: { train_number: t.trainNumber },
    });
  }

  function submit() {
    if (!resolvedTrain) return;
    trackAnalyticsEvent({
      name: "chart_times_search_submitted",
      properties: {
        train_number: resolvedTrain.trainNumber,
        journey_date: journeyDate || "",
      },
    });
    const slug = buildChartTimesSlug(
      resolvedTrain.trainNumber,
      resolvedTrain.trainName,
    );
    const qs = journeyDate ? `?date=${journeyDate}` : "";
    // The target page is server-rendered and can take a few seconds (schedule +
    // chart-time fetches), so show a loader until this component unmounts on nav.
    setNavigating(true);
    router.push(`/chart-times/${slug}${qs}`);
  }

  const isQueryTooShort = debouncedQuery.trim().length < 2;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        {/* Searchable train picker */}
        <div className="relative flex-1" ref={boxRef}>
          <label
            htmlFor="chart-times-train"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Train
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="chart-times-train"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search train name or number…"
              className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
            {loading && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>
          {open && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {loading && trains.length === 0 ? (
                <li className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  Searching trains…
                </li>
              ) : loadError ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Couldn&apos;t load trains — enter a train number directly to continue.
                </li>
              ) : trains.length === 0 && !isQueryTooShort ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  No trains found for &ldquo;{debouncedQuery.trim()}&rdquo;
                </li>
              ) : trains.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Type at least 2 characters to search…
                </li>
              ) : (
                <>
                  {isQueryTooShort && initialPopularTrains.length > 0 && (
                    <li className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Popular Trains
                    </li>
                  )}
                  {trains.map((t) => (
                    <li key={t.trainNumber}>
                      <button
                        type="button"
                        onClick={() => selectTrain(t)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                      >
                        <span className="font-medium text-slate-900">
                          {t.trainNumber}
                        </span>
                        <span className="truncate text-slate-600">
                          {t.trainName}
                        </span>
                      </button>
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </div>

        {/* Train-start date (Day 1 origin departure for this run) */}
        <div className="sm:w-48">
          <label
            htmlFor="chart-times-date"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Train start date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="chart-times-date"
              type="date"
              value={journeyDate}
              min={todayYmd()}
              onChange={(e) => setJourneyDate(e.target.value)}
              className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!resolvedTrain || navigating}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {navigating ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Loading…
            </>
          ) : (
            "View chart times"
          )}
        </button>
      </form>
    </div>
  );
}
