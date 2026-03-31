"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";
import { CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH } from "@/lib/chart-time-ingestion-constants";

type StationResult = {
  stationCode: string;
  stationName: string;
  status: "saved" | "failed" | "skipped";
  error: string | null;
};

type TrainIngestionOk = {
  ok: true;
  trainNumber: string;
  journeyDate: string;
  trainName: string;
  totals: {
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  elapsedMs: number;
  stations: StationResult[];
};

type TrainIngestionFail = {
  ok: false;
  trainNumber: string;
  error: string;
};

type BatchIngestionResponse = {
  journeyDate: string;
  trains: (TrainIngestionOk | TrainIngestionFail)[];
  skippedAlreadyInDb?: string[];
  summary: {
    trainCount: number;
    trainsSkippedExistingDb?: number;
    trainsRun?: number;
    trainsOk: number;
    trainsFailed: number;
    stationsAttempted: number;
    stationsSaved: number;
    stationsFailed: number;
    stationsSkipped: number;
    elapsedMs: number;
  };
};

export default function ChartTimeIngestionPage() {
  const [trainNumbersText, setTrainNumbersText] = useState("");
  const [journeyDate, setJourneyDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BatchIngestionResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const { data } = await apiClient.post<BatchIngestionResponse>(
        "/api/chart-time-ingestion/run",
        {
          trainNumbersText,
          journeyDate: journeyDate.trim(),
        },
      );
      setResult(data);
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      setError(
        ax.response?.data?.message ??
          ax.response?.data?.error ??
          "Failed to run chart-time ingestion.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chart-time ingestion</h1>
      <p className="mt-1 text-slate-600">
        Backfill chart times station-by-station using IRCTC train composition.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow"
      >
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Train numbers
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Paste plain numbers (one per line) or quoted train-list lines like{" "}
              <code className="rounded bg-slate-100 px-0.5">&quot;22637 - WEST COAST EXP&quot;,</code>{" "}
              — the number before <code className="rounded bg-slate-100 px-0.5"> - </code> is used.
              Duplicates ignored; trains that already have rows in{" "}
              <code className="rounded bg-slate-100 px-0.5">TrainStationChartTime</code> are skipped.
              Up to {CHART_TIME_INGESTION_MAX_TRAINS_PER_BATCH} trains per run.
            </p>
            <textarea
              value={trainNumbersText}
              onChange={(e) => setTrainNumbersText(e.target.value)}
              className="mt-2 min-h-[10rem] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              placeholder={`"22637 - WEST COAST EXP",
"22638 - WEST COAST EXP",
12951`}
              required
              spellCheck={false}
            />
          </div>
          <div className="sm:max-w-xs">
            <label className="block text-sm font-medium text-slate-700">
              Journey date
            </label>
            <input
              type="date"
              value={journeyDate}
              onChange={(e) => setJourneyDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Running..." : "Run ingestion"}
        </button>
      </form>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-900">Batch summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              Date: {result.journeyDate} | Parsed trains: {result.summary.trainCount}
              {(result.summary.trainsSkippedExistingDb ?? 0) > 0 && (
                <>
                  {" "}
                  | Skipped (already in DB): {result.summary.trainsSkippedExistingDb}
                </>
              )}
              {(result.summary.trainsRun ?? result.trains.length) > 0 && (
                <>
                  {" "}
                  | Run: {result.summary.trainsRun ?? result.trains.length} (
                  {result.summary.trainsOk} ok, {result.summary.trainsFailed} failed)
                </>
              )}
              {" "}
              | Stations — attempted: {result.summary.stationsAttempted}, saved:{" "}
              {result.summary.stationsSaved}, failed: {result.summary.stationsFailed},
              skipped: {result.summary.stationsSkipped} | Total elapsed:{" "}
              {result.summary.elapsedMs} ms
            </p>
            {result.skippedAlreadyInDb && result.skippedAlreadyInDb.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                <span className="font-medium text-slate-800">Not ingested (existing chart times):</span>{" "}
                {result.skippedAlreadyInDb.join(", ")}
              </p>
            )}
          </div>

          {result.trains.map((t, ti) =>
            t.ok ? (
              <div key={`${t.trainNumber}-${ti}`} className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t.trainName} ({t.trainNumber})
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Attempted: {t.totals.attempted} | Saved: {t.totals.succeeded} |
                    Failed: {t.totals.failed} | Skipped: {t.totals.skipped} | Elapsed:{" "}
                    {t.elapsedMs} ms
                  </p>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-700">Station</th>
                        <th className="px-4 py-3 font-medium text-slate-700">Code</th>
                        <th className="px-4 py-3 font-medium text-slate-700">Status</th>
                        <th className="px-4 py-3 font-medium text-slate-700">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.stations.map((s, idx) => (
                        <tr
                          key={`${s.stationCode}-${idx}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-4 py-3">{s.stationName || "-"}</td>
                          <td className="px-4 py-3">{s.stationCode || "-"}</td>
                          <td className="px-4 py-3">{s.status}</td>
                          <td className="px-4 py-3">{s.error || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div
                key={`${t.trainNumber}-err-${ti}`}
                className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow"
              >
                <h3 className="font-semibold text-red-900">
                  Train {t.trainNumber} — failed
                </h3>
                <p className="mt-2 text-sm text-red-800">{t.error}</p>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
