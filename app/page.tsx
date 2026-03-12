"use client";

import { useState, useEffect, useCallback } from "react";

type Station = { code: string; name: string };
type TrainOption = { number: string; label: string };

function TrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-1.607-1.274-2.905-2.846-2.905A2.846 2.846 0 008.25 4.77v.958m0 0v.041a2.25 2.25 0 01-.659 1.591L5 10.25m14 0l2.659-2.591A2.25 2.25 0 0021.75 5.77v-.041m-13.5 0v.041a2.25 2.25 0 01-.659 1.591L5 10.25" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

type CheckResult = {
  status: string;
  resultPayload?: { status?: string; seats_available?: number; seatsAvailable?: number };
};

export default function HomePage() {
  const [trainInput, setTrainInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [journeyDate, setJourneyDate] = useState("");
  const [classCode, setClassCode] = useState("3A");
  const [stations, setStations] = useState<Station[]>([]);
  const [trainOptions, setTrainOptions] = useState<TrainOption[]>([]);
  const [trainsLoading, setTrainsLoading] = useState(true);
  const [scheduleStations, setScheduleStations] = useState<Station[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3009";

  useEffect(() => {
    fetch(`${apiUrl}/api/stations`)
      .then((r) => r.json())
      .then(setStations)
      .catch(() => setStations([]));
  }, [apiUrl]);

  useEffect(() => {
    fetch(`${apiUrl}/api/irctc/trains`)
      .then((r) => r.json())
      .then((data: TrainOption[]) => setTrainOptions(Array.isArray(data) ? data : []))
      .catch(() => setTrainOptions([]))
      .finally(() => setTrainsLoading(false));
  }, [apiUrl]);

  const trainNumber = trainInput.includes(" - ") ? trainInput.split(" - ")[0].trim() : trainInput.trim();
  const trainSelected = trainInput.includes(" - ");

  useEffect(() => {
    if (!trainSelected || !trainNumber) {
      setScheduleStations(null);
      return;
    }
    setScheduleLoading(true);
    setScheduleStations(null);
    fetch(`${apiUrl}/api/irctc/schedule/${encodeURIComponent(trainNumber)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stationList?: { stationCode?: string; stationName?: string }[] } | null) => {
        const list = data?.stationList;
        if (Array.isArray(list) && list.length > 0) {
          setScheduleStations(
            list.map((s) => ({
              code: String(s.stationCode ?? "").trim(),
              name: String(s.stationName ?? "").trim(),
            })).filter((s) => s.code)
          );
        } else {
          setScheduleStations([]);
        }
      })
      .catch(() => setScheduleStations([]))
      .finally(() => setScheduleLoading(false));
  }, [apiUrl, trainNumber, trainSelected]);
  const fromCode = from.includes(" - ") ? from.split(" - ")[0].trim() : from.trim();
  const toCode = to.includes(" - ") ? to.split(" - ")[0].trim() : to.trim();

  const pollCheck = useCallback(
    async (jobId: string) => {
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(`${apiUrl}/api/availability/check/${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (data.error === "Not found") {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (data.status === "success" || data.status === "failed") {
          setCheckResult({
            status: data.status,
            resultPayload: data.resultPayload as CheckResult["resultPayload"],
          });
          setLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setLoading(false);
      setError("Check timed out. Try again.");
    },
    [apiUrl]
  );

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!trainNumber.trim() || !fromCode || !journeyDate) {
      setError("Please enter train number, from station and date.");
      return;
    }
    setError(null);
    setCheckResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/availability/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainNumber: trainNumber.trim(),
          stationCode: fromCode,
          classCode: classCode || "3A",
          journeyDate: journeyDate.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Request failed. Please try again.");
        setLoading(false);
        return;
      }
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
      if (data.jobId) {
        pollCheck(data.jobId);
      } else {
        setLoading(false);
        setError("Could not start availability check.");
      }
    } catch (err) {
      setError("Request failed. Is the API running?");
      setLoading(false);
    }
  }

  function swapFromTo() {
    setFrom(to);
    setTo(from);
  }

  const stationsForRoute = scheduleStations?.length ? scheduleStations : stations;
  const stationOptions = stationsForRoute
    .filter(
      (s) =>
        s.code.toLowerCase().includes(from.toLowerCase()) ||
        s.name.toLowerCase().includes(from.toLowerCase())
    )
    .slice(0, 15);
  const toOptions = stationsForRoute
    .filter(
      (s) =>
        s.code.toLowerCase().includes(to.toLowerCase()) ||
        s.name.toLowerCase().includes(to.toLowerCase())
    )
    .slice(0, 15);

  const trainFilter = trainInput.toLowerCase();
  const trainDropdownOptions = trainFilter
    ? trainOptions.filter(
        (t) =>
          t.label.toLowerCase().includes(trainFilter) ||
          t.number.toLowerCase().includes(trainFilter)
      )
    : trainOptions;
  const trainDatalistOptions = trainDropdownOptions.slice(0, 200);

  const seatsAvailable =
    checkResult?.resultPayload &&
    (checkResult.resultPayload.seats_available ?? checkResult.resultPayload.seatsAvailable);
  const isAvailable = checkResult?.status === "success" && checkResult?.resultPayload?.status === "seat_available";

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-xl font-semibold text-[#0f766e]">RailChart</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[#0f766e]">Train Ticket Booking</h1>
          <p className="mt-1 text-slate-500 text-base">Check realtime seat availability</p>
        </div>

        <form onSubmit={handleSearch}>
          <div className="flex flex-col sm:flex-row items-stretch gap-0 rounded-2xl border border-slate-200 bg-slate-50/80 shadow-sm overflow-hidden">
            <div className="flex-1 min-w-0 flex flex-wrap sm:flex-nowrap items-end gap-2 sm:gap-0 p-4 sm:p-3">
              <div className="flex-1 min-w-[180px] sm:min-w-0 relative">
                <label className="block text-xs font-medium text-slate-500 mb-1">Train</label>
                <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0f766e]/20 focus-within:border-[#0f766e]">
                  <TrainIcon className="h-5 w-5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={trainInput}
                    onChange={(e) => setTrainInput(e.target.value)}
                    placeholder={trainsLoading ? "Loading trains…" : "Search train number or name"}
                    list="train-list"
                    className="w-full min-w-0 bg-transparent text-slate-800 placeholder:text-slate-400 outline-none"
                    autoComplete="off"
                  />
                </div>
                <datalist id="train-list">
                  {trainDatalistOptions.map((t) => (
                    <option key={`${t.number}-${t.label}`} value={t.label} />
                  ))}
                </datalist>
              </div>

              <div className="flex-1 min-w-[140px] sm:min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0f766e]/20 focus-within:border-[#0f766e]">
                  <TrainIcon className="h-5 w-5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder={scheduleLoading ? "Loading route…" : scheduleStations ? "Boarding station" : "Station code"}
                    list="from-list"
                    className="w-full min-w-0 bg-transparent text-slate-800 placeholder:text-slate-400 outline-none"
                  />
                </div>
                <datalist id="from-list">
                  {stationOptions.map((s) => (
                    <option key={s.code} value={`${s.code} - ${s.name}`} />
                  ))}
                </datalist>
              </div>

              <button
                type="button"
                onClick={swapFromTo}
                className="shrink-0 self-center rounded-lg bg-slate-200/80 p-2 text-slate-500 hover:bg-slate-300 hover:text-slate-700 transition"
                aria-label="Swap from and to"
              >
                <SwapIcon className="h-5 w-5" />
              </button>

              <div className="flex-1 min-w-[140px] sm:min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0f766e]/20 focus-within:border-[#0f766e]">
                  <TrainIcon className="h-5 w-5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder={scheduleLoading ? "Loading route…" : scheduleStations ? "Destination station" : "Station code"}
                    list="to-list"
                    className="w-full min-w-0 bg-transparent text-slate-800 placeholder:text-slate-400 outline-none"
                  />
                </div>
                <datalist id="to-list">
                  {toOptions.map((s) => (
                    <option key={s.code} value={`${s.code} - ${s.name}`} />
                  ))}
                </datalist>
              </div>

              <div className="flex-1 min-w-[140px] sm:min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">Departure Date</label>
                <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0f766e]/20 focus-within:border-[#0f766e]">
                  <CalendarIcon className="h-5 w-5 text-slate-400 shrink-0" />
                  <input
                    type="date"
                    value={journeyDate}
                    onChange={(e) => setJourneyDate(e.target.value)}
                    required
                    className="w-full min-w-0 bg-transparent text-slate-800 outline-none [color-scheme:light]"
                  />
                </div>
              </div>

              <div className="w-24">
                <label className="block text-xs font-medium text-slate-500 mb-1">Class</label>
                <select
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-[#0f766e]/20 focus:border-[#0f766e]"
                >
                  <option value="3A">3A</option>
                  <option value="2A">2A</option>
                  <option value="SL">SL</option>
                  <option value="1A">1A</option>
                  <option value="CC">CC</option>
                </select>
              </div>
            </div>

            <div className="sm:w-[140px] p-3 flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#0f766e] py-3.5 font-semibold text-white uppercase tracking-wide transition hover:bg-[#0d6961] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Checking…" : "Search"}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading && !checkResult && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">Triggering availability check…</p>
            <p className="mt-2 text-sm text-slate-500">Waiting for realtime result from Browser Use.</p>
            <div className="mt-4 h-2 w-48 mx-auto rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full w-1/2 animate-pulse bg-[#0f766e]/30 rounded-full" />
            </div>
          </div>
        )}

        {checkResult && !loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
            <h2 className="text-lg font-semibold text-slate-900">Realtime availability</h2>
            {isAvailable ? (
              <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4">
                <p className="font-medium text-green-800">
                  Seats available
                  {typeof seatsAvailable === "number" && (
                    <span className="ml-2 font-semibold">({seatsAvailable} seat{seatsAvailable !== 1 ? "s" : ""})</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-green-700">
                  Train {trainNumber} from {fromCode} on {journeyDate} — book now on IRCTC.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
                <p className="font-medium text-amber-800">No seats available</p>
                <p className="mt-1 text-sm text-amber-700">
                  Train {trainNumber} from {fromCode} on {journeyDate} — try another date or class.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
