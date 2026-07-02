"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

type TaskResult = {
  taskId: string;
  trainNumber: string;
  from: string;
  to: string;
  journeyDate: string | null;
  status: string;
  retryCount: number;
  lastError: string | null;
};

type CronRun = {
  id: string;
  cronName: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: string;
  isLeader: boolean;
  tasksClaimed: number;
  tasksRun: number;
  completedCount: number;
  failedCount: number;
  input: { istNow?: string; claimedTaskIds?: string[] } | null;
  output: { results?: TaskResult[] } | null;
  error: string | null;
};

function extractError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

// Reuse the same admin password gate as the other admin tools.
const PW_STORAGE_KEY = "irctc_keeper_admin_password";

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

/** Seconds between this run and the previous (older) one. */
function gapSeconds(runs: CronRun[], i: number): number | null {
  if (i >= runs.length - 1) return null;
  const cur = new Date(runs[i].startedAt).getTime();
  const prev = new Date(runs[i + 1].startedAt).getTime();
  return Math.round((cur - prev) / 1000);
}

function statusColor(s: string): string {
  if (s === "success") return "bg-green-100 text-green-800";
  if (s === "error") return "bg-red-100 text-red-800";
  if (s === "skipped_overlap") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export default function CronRunsAdminPage() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    setPassword(window.localStorage.getItem(PW_STORAGE_KEY) ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!password) {
      setLoading(false);
      return;
    }
    setError("");
    try {
      const { data } = await apiClient.get<{ runs: CronRun[] }>(
        "/api/availability/admin/cron-runs",
        { headers: { "x-admin-password": password }, params: { limit: 300 } },
      );
      setRuns(data.runs ?? []);
    } catch (err) {
      setError(extractError(err, "Failed to load cron runs."));
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePassword = () => {
    window.localStorage.setItem(PW_STORAGE_KEY, password);
    setLoading(true);
    void load();
  };

  const shown = onlyProblems
    ? runs.filter(
        (r) =>
          r.status !== "success" ||
          r.failedCount > 0 ||
          (r.durationMs ?? 0) > 55_000,
      )
    : runs;

  // Quick stats over the loaded window.
  const successRuns = runs.filter((r) => r.status === "success").length;
  const overlaps = runs.filter((r) => r.status === "skipped_overlap").length;
  const errors = runs.filter((r) => r.status === "error").length;
  const maxGap = runs.reduce((m, _r, i) => {
    const g = gapSeconds(runs, i);
    return g != null && g > m ? g : m;
  }, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">
        Chart-notification cron runs
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Every leader tick of the notification cron. Watch for gaps &gt; ~60s
        (late/missed runs), <code>skipped_overlap</code> (a run ran into the next
        minute), and errors.
      </p>

      {/* Password */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && savePassword()}
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={savePassword}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Load
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
        >
          Refresh
        </button>
        <label className="ml-2 flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
          />
          Problems only
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && runs.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Runs loaded", value: runs.length },
            { label: "Success", value: successRuns },
            { label: "Overlaps", value: overlaps },
            { label: "Errors", value: errors },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
            </div>
          ))}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:col-span-4">
            <div className="text-xs text-slate-500">
              Largest gap between consecutive runs (should be ~60s)
            </div>
            <div
              className={`text-xl font-bold ${maxGap > 90 ? "text-red-600" : "text-slate-900"}`}
            >
              {maxGap}s
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Started (IST)</th>
                <th className="px-3 py-2">Gap</th>
                <th className="px-3 py-2">Dur</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Claimed</th>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">✓ / ✗</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const idx = runs.indexOf(r);
                const gap = gapSeconds(runs, idx);
                const isOpen = expanded[r.id];
                const hasDetail =
                  (r.output?.results?.length ?? 0) > 0 || !!r.error;
                return (
                  <Fragment key={r.id}>
                    <tr className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {fmt(r.startedAt)}
                      </td>
                      <td
                        className={`px-3 py-2 ${gap != null && gap > 90 ? "font-semibold text-red-600" : "text-slate-500"}`}
                      >
                        {gap != null ? `${gap}s` : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusColor(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.tasksClaimed}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.tasksRun}</td>
                      <td className="px-3 py-2 text-slate-600">
                        <span className="text-green-700">{r.completedCount}</span>
                        {" / "}
                        <span className="text-red-700">{r.failedCount}</span>
                      </td>
                      <td className="px-3 py-2">
                        {hasDetail && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))
                            }
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            {isOpen ? "Hide" : "Details"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-3 py-3">
                          {r.error && (
                            <p className="mb-2 text-xs text-red-700">
                              <span className="font-semibold">error:</span>{" "}
                              {r.error}
                            </p>
                          )}
                          {(r.output?.results?.length ?? 0) > 0 ? (
                            <table className="min-w-full text-xs">
                              <thead className="text-left text-slate-500">
                                <tr>
                                  <th className="px-2 py-1">Train</th>
                                  <th className="px-2 py-1">From→To</th>
                                  <th className="px-2 py-1">Date</th>
                                  <th className="px-2 py-1">Status</th>
                                  <th className="px-2 py-1">Retry</th>
                                  <th className="px-2 py-1">Last error</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.output!.results!.map((t) => (
                                  <tr key={t.taskId}>
                                    <td className="px-2 py-1">{t.trainNumber}</td>
                                    <td className="px-2 py-1">
                                      {t.from}→{t.to}
                                    </td>
                                    <td className="px-2 py-1">
                                      {t.journeyDate ?? "—"}
                                    </td>
                                    <td className="px-2 py-1">{t.status}</td>
                                    <td className="px-2 py-1">{t.retryCount}</td>
                                    <td className="px-2 py-1 text-red-700">
                                      {t.lastError ?? ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-slate-500">
                              No task detail.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    {password ? "No runs found." : "Enter the admin password."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
