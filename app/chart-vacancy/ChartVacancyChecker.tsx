"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, CalendarDays, TrainFront } from "lucide-react";
import { apiClient } from "@/lib/api";

type TrainOption = { trainNumber: string; trainName: string };
type ScheduleStation = { stationCode: string; stationName: string };
type CddItem = {
  coachName: string;
  classCode: string;
  positionFromEngine: number;
  vacantBerths: number;
};
type Composition = {
  cdd?: CddItem[];
  trainName?: string;
  from?: string;
  to?: string;
  chartOneDate?: string | null;
  chartTwoDate?: string | null;
  error?: string | null;
  chartStatusResponseDto?: { chartOneFlag?: number; chartTwoFlag?: number };
};

const CLASS_NAMES: Record<string, string> = {
  "1A": "AC First Class (1A)",
  "2A": "AC 2 Tier (2A)",
  "3A": "AC 3 Tier (3A)",
  "3E": "AC 3 Economy (3E)",
  CC: "AC Chair Car (CC)",
  EC: "Exec Chair Car (EC)",
  SL: "Sleeper (SL)",
  "2S": "Second Sitting (2S)",
  FC: "First Class (FC)",
};

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "2026-07-02 10:30:00" / ISO-ish -> "2 Jul 2026, 10:30". Best-effort. */
function prettyChartDate(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return raw;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, y, mo, d, h, min] = m;
  return `${Number(d)} ${months[Number(mo) - 1]} ${y}, ${h}:${min}`;
}

/**
 * Live IRCTC chart-vacancy checker: coach-wise vacant berths after chart preparation.
 *
 * Two modes:
 *  - Standalone (no fixedTrainNumber): a searchable train picker that loads the
 *    schedule and boarding stations on demand (used on /chart-vacancy).
 *  - Fixed train (fixedTrainNumber + presetStations): the train is locked and the
 *    boarding stations are supplied by the page, so it's a one-click vacancy tool
 *    embedded on each per-train chart page.
 */
export default function ChartVacancyChecker({
  fixedTrainNumber,
  fixedTrainName,
  presetStations,
  initialJourneyDate,
}: {
  fixedTrainNumber?: string;
  fixedTrainName?: string;
  presetStations?: ScheduleStation[];
  initialJourneyDate?: string | null;
} = {}) {
  const fixed = Boolean(fixedTrainNumber);

  const [trains, setTrains] = useState<TrainOption[]>([]);
  const [query, setQuery] = useState(
    fixed ? `${fixedTrainNumber} — ${fixedTrainName ?? ""}` : "",
  );
  const [selected, setSelected] = useState<TrainOption | null>(
    fixed ? { trainNumber: fixedTrainNumber as string, trainName: fixedTrainName ?? "" } : null,
  );
  const [open, setOpen] = useState(false);
  const [stations, setStations] = useState<ScheduleStation[]>(
    fixed ? presetStations ?? [] : [],
  );
  const [boarding, setBoarding] = useState(
    fixed ? presetStations?.[0]?.stationCode ?? "" : "",
  );
  const [journeyDate, setJourneyDate] = useState(initialJourneyDate || "");
  const [stationsLoading, setStationsLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Composition | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialJourneyDate) setJourneyDate(todayYmd());
  }, [initialJourneyDate]);

  // Train list for the searchable picker (standalone mode only).
  useEffect(() => {
    if (fixed) return;
    let cancelled = false;
    apiClient
      .get<Array<{ trainNumber?: string; trainName?: string }>>("/api/trains")
      .then((res) => {
        if (cancelled) return;
        setTrains(
          (res.data || [])
            .map((t) => ({
              trainNumber: String(t.trainNumber ?? "").trim(),
              trainName: String(t.trainName ?? "").trim(),
            }))
            .filter((t) => t.trainNumber),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fixed]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trains.slice(0, 30);
    return trains
      .filter((t) => t.trainNumber.toLowerCase().includes(q) || t.trainName.toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, trains]);

  async function selectTrain(t: TrainOption) {
    setSelected(t);
    setQuery(`${t.trainNumber} — ${t.trainName}`);
    setOpen(false);
    setResult(null);
    setError(null);
    setStations([]);
    setBoarding("");
    setStationsLoading(true);
    try {
      const res = await apiClient.get<{ stationList?: ScheduleStation[] }>(
        `/api/irctc/schedule/${t.trainNumber}`,
      );
      const list = (res.data?.stationList || []).map((s) => ({
        stationCode: String(s.stationCode || "").trim().toUpperCase(),
        stationName: s.stationName || String(s.stationCode || ""),
      }));
      setStations(list);
      if (list[0]) setBoarding(list[0].stationCode);
    } catch {
      // Schedule unavailable — the check will surface an error.
    } finally {
      setStationsLoading(false);
    }
  }

  const resolvedNumber = useMemo(() => {
    if (fixed) return fixedTrainNumber as string;
    if (selected) return selected.trainNumber;
    const m = query.trim().match(/^(\d{3,6})/);
    return m ? m[1] : "";
  }, [fixed, fixedTrainNumber, selected, query]);

  async function check() {
    const num = resolvedNumber;
    if (!num) {
      setError("Please select a train.");
      return;
    }
    const board = boarding || stations[0]?.stationCode;
    if (!board) {
      setError("Couldn't determine the boarding station for this train.");
      return;
    }
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.post<Composition>("/api/irctc/train-composition", {
        trainNo: num,
        jDate: journeyDate.slice(0, 10),
        boardingStation: board,
      });
      setResult(res.data);
    } catch {
      setError("Couldn't fetch chart vacancy right now. IRCTC may be busy — try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  const cdd = result?.cdd ?? [];
  const chartPrepared = cdd.length > 0 || result?.chartStatusResponseDto?.chartOneFlag === 1;
  const totalVacant = cdd.reduce((sum, c) => sum + (c.vacantBerths || 0), 0);

  const byClass = useMemo(() => {
    const map = new Map<string, CddItem[]>();
    for (const c of result?.cdd ?? []) {
      const arr = map.get(c.classCode) || [];
      arr.push(c);
      map.set(c.classCode, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.positionFromEngine - b.positionFromEngine);
    return [...map.entries()];
  }, [result]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
        className="flex flex-col gap-4 lg:flex-row lg:items-end"
      >
        {/* Train picker — standalone mode only */}
        {!fixed && (
          <div className="relative flex-1" ref={boxRef}>
            <label htmlFor="cv-train" className="mb-1.5 block text-sm font-medium text-slate-700">
              Train
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="cv-train"
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
                className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
            </div>
            {open && matches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                {matches.map((t) => (
                  <li key={t.trainNumber}>
                    <button
                      type="button"
                      onClick={() => void selectTrain(t)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">{t.trainNumber}</span>
                      <span className="text-slate-600">{t.trainName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Boarding station */}
        <div className={fixed ? "flex-1" : "lg:w-56"}>
          <label htmlFor="cv-board" className="mb-1.5 block text-sm font-medium text-slate-700">
            Boarding station
          </label>
          <select
            id="cv-board"
            value={boarding}
            onChange={(e) => setBoarding(e.target.value)}
            disabled={stationsLoading || stations.length === 0}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {stationsLoading ? (
              <option>Loading…</option>
            ) : stations.length === 0 ? (
              <option>Select a train first</option>
            ) : (
              stations.map((s) => (
                <option key={s.stationCode} value={s.stationCode}>
                  {s.stationName} ({s.stationCode})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Journey date */}
        <div className={fixed ? "lg:w-44" : "lg:w-44"}>
          <label htmlFor="cv-date" className="mb-1.5 block text-sm font-medium text-slate-700">
            Journey date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="cv-date"
              type="date"
              value={journeyDate.slice(0, 10)}
              min={todayYmd()}
              onChange={(e) => setJourneyDate(e.target.value)}
              className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={checking || !resolvedNumber}
          className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check Vacancy"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}

      {result && !error && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <TrainFront className="h-4 w-4 text-blue-700" />
              {result.trainName || fixedTrainName || resolvedNumber} ({resolvedNumber})
            </h3>
            {chartPrepared && (
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
                {totalVacant} vacant berth{totalVacant === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {!chartPrepared ? (
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Chart not prepared yet.</p>
              <p className="mt-1">
                {prettyChartDate(result.chartOneDate)
                  ? `The first reservation chart is expected around ${prettyChartDate(result.chartOneDate)}. Vacant berths appear once it is prepared.`
                  : "Vacant berths appear once IRCTC prepares the reservation chart, a few hours before departure. Check back closer to the journey date."}
                {result.error ? ` (IRCTC: ${result.error})` : ""}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {byClass.map(([cls, coaches]) => {
                  const classTotal = coaches.reduce((s, c) => s + (c.vacantBerths || 0), 0);
                  return (
                    <div key={cls}>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-800">
                          {CLASS_NAMES[cls] || cls}
                        </h4>
                        <span className="text-sm text-slate-500">{classTotal} vacant</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {coaches.map((c) => (
                          <div
                            key={c.coachName}
                            className={`flex min-w-[64px] flex-col items-center rounded-md border px-2.5 py-1.5 text-center ${
                              c.vacantBerths > 0
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <span className="text-sm font-semibold text-slate-900">{c.coachName}</span>
                            <span
                              className={`text-xs font-medium ${
                                c.vacantBerths > 0 ? "text-emerald-700" : "text-slate-400"
                              }`}
                            >
                              {c.vacantBerths} free
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Want the exact vacant berth numbers and a coach map?{" "}
                <Link href="/seat-status" className="font-medium text-blue-600 hover:underline">
                  Open Seat Status &amp; Coach Map →
                </Link>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
