"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";
import { CHART_TIME_INGESTION_TRAIN_LIST_BATCH } from "@/lib/chart-time-ingestion-constants";

type StationResult = {
  stationCode: string;
  stationName: string;
  status: "saved" | "failed" | "skipped";
  error: string | null;
};

type TrainListIngested = {
  kind: "ingested";
  journeyDateUsed: string;
  triedTomorrow: boolean;
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

type TrainListSkipped = {
  kind: "skipped_existing";
  trainNumber: string;
  label: string;
};

type TrainListFailed = {
  kind: "failed";
  trainNumber: string;
  label: string;
  error: string;
};

type TrainListBatchResponse = {
  mode: "train_list";
  datesTried: { today: string; tomorrow: string };
  trains: (TrainListIngested | TrainListSkipped | TrainListFailed)[];
  summary: {
    pickedFromTrainList: number;
    ingestedCount: number;
    skippedExistingDbCount: number;
    failedCount: number;
    stationsAttempted: number;
    stationsSaved: number;
    stationsFailed: number;
    stationsSkipped: number;
    elapsedMs: number;
    remainingPendingTrainList: number;
  };
};

export default function ChartTimeIngestionPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TrainListBatchResponse | null>(null);

  async function onRun() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const { data } = await apiClient.post<TrainListBatchResponse>(
        "/api/chart-time-ingestion/run-train-list",
        {},
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
        Backfill chart times from the <code className="rounded bg-slate-100 px-0.5">TrainList</code>{" "}
        table: up to {CHART_TIME_INGESTION_TRAIN_LIST_BATCH} trains per run that are not yet marked
        done. Journey dates are <strong>IST today</strong>, then <strong>tomorrow</strong> if no
        chart rows or successful composition calls for today. Each row is marked{" "}
        <code className="rounded bg-slate-100 px-0.5">chart_time_ingestion_done</code> after
        processing (reset via SQL if you need to retry).
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Running…" : `Run next ${CHART_TIME_INGESTION_TRAIN_LIST_BATCH} trains`}
        </button>
      </div>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-900">Batch summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              IST dates tried: today {result.datesTried.today}, tomorrow {result.datesTried.tomorrow}
              {" · "}
              Picked: {result.summary.pickedFromTrainList} | Ingested:{" "}
              {result.summary.ingestedCount} | Skipped (already had chart times):{" "}
              {result.summary.skippedExistingDbCount} | Failed: {result.summary.failedCount}
              {" · "}
              Stations — attempted: {result.summary.stationsAttempted}, saved:{" "}
              {result.summary.stationsSaved}, failed: {result.summary.stationsFailed}, skipped:{" "}
              {result.summary.stationsSkipped} | Elapsed: {result.summary.elapsedMs} ms
              {" · "}
              Remaining pending in TrainList: {result.summary.remainingPendingTrainList}
            </p>
          </div>

          {result.trains.map((t, ti) =>
            t.kind === "skipped_existing" ? (
              <div
                key={`${t.trainNumber}-skip-${ti}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
              >
                <span className="font-medium text-slate-900">{t.label}</span> — skipped (chart times
                already in DB); marked done on TrainList.
              </div>
            ) : t.kind === "failed" ? (
              <div
                key={`${t.trainNumber}-err-${ti}`}
                className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow"
              >
                <h3 className="font-semibold text-red-900">{t.label}</h3>
                <p className="mt-2 text-sm text-red-800">{t.error}</p>
              </div>
            ) : (
              <div key={`${t.trainNumber}-${ti}`} className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t.trainName} ({t.trainNumber})
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Journey date used: {t.journeyDateUsed}
                    {t.triedTomorrow && t.journeyDateUsed === result.datesTried.tomorrow
                      ? " (fell back from today)"
                      : null}
                    {" · "}
                    Attempted: {t.totals.attempted} | Saved: {t.totals.succeeded} | Failed:{" "}
                    {t.totals.failed} | Skipped: {t.totals.skipped} | Elapsed: {t.elapsedMs} ms
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
            ),
          )}
        </div>
      )}
    </div>
  );
}
