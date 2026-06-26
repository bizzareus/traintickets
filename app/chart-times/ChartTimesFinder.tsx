"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CalendarDays } from "lucide-react";
import { apiClient } from "@/lib/api";
import { buildChartTimesSlug } from "@/lib/chartTimesSlug";

type TrainOption = { trainNumber: string; trainName: string };

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Searchable train picker + journey date → navigates to that train's chart-times page. */
export default function ChartTimesFinder() {
  const router = useRouter();
  const [trains, setTrains] = useState<TrainOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TrainOption | null>(null);
  const [open, setOpen] = useState(false);
  const [journeyDate, setJourneyDate] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Default the journey date to today. Done after mount (not via initial state)
  // so the server-rendered HTML and client hydration can't disagree on "today"
  // across timezones / the midnight boundary.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJourneyDate(todayYmd());
  }, []);

  // Load the train list once for client-side searching.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Array<{ trainNumber?: string; trainName?: string }>>("/api/trains")
      .then((res) => {
        if (cancelled) return;
        const list = (res.data || [])
          .map((t) => ({
            trainNumber: String(t.trainNumber ?? "").trim(),
            trainName: String(t.trainName ?? "").trim(),
          }))
          .filter((t) => t.trainNumber);
        setTrains(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trains.slice(0, 30);
    return trains
      .filter(
        (t) =>
          t.trainNumber.toLowerCase().includes(q) ||
          t.trainName.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [query, trains]);

  // The train we'll navigate to: an explicit selection, else a bare number typed in.
  const resolvedTrain: TrainOption | null = useMemo(() => {
    if (selected) return selected;
    const raw = query.trim();
    const numMatch = raw.match(/^(\d{3,6})$/);
    if (numMatch) {
      const known = trains.find((t) => t.trainNumber === numMatch[1]);
      return known ?? { trainNumber: numMatch[1], trainName: "" };
    }
    return null;
  }, [selected, query, trains]);

  function selectTrain(t: TrainOption) {
    setSelected(t);
    setQuery(`${t.trainNumber} — ${t.trainName}`);
    setOpen(false);
  }

  function submit() {
    if (!resolvedTrain) return;
    const slug = buildChartTimesSlug(
      resolvedTrain.trainNumber,
      resolvedTrain.trainName,
    );
    const qs = journeyDate ? `?date=${journeyDate}` : "";
    router.push(`/chart-times/${slug}${qs}`);
  }

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
              className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
          </div>
          {open && (matches.length > 0 || loadError) && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {loadError && trains.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Couldn&apos;t load the train list — type a train number to continue.
                </li>
              ) : (
                matches.map((t) => (
                  <li key={t.trainNumber}>
                    <button
                      type="button"
                      onClick={() => selectTrain(t)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">
                        {t.trainNumber}
                      </span>
                      <span className="text-slate-600">{t.trainName}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* Journey date */}
        <div className="sm:w-48">
          <label
            htmlFor="chart-times-date"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Journey date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="chart-times-date"
              type="date"
              value={journeyDate}
              min={todayYmd()}
              onChange={(e) => setJourneyDate(e.target.value)}
              className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!resolvedTrain}
          className="rounded-md bg-teal-700 px-5 py-2.5 font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          View chart times
        </button>
      </form>
    </div>
  );
}
