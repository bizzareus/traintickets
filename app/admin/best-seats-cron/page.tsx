"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

type RouteEntry = {
  from: string;
  to: string;
  date: string;
  status: "ok" | "empty" | "failed";
  train: string | null;
};

type CronRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  due: number;
  batch: number;
  refreshed: number;
  failed: number;
  skipped: number;
  ownerId: string | null;
  routes: RouteEntry[];
};

type CacheSummary = {
  type: string;
  rows: number;
  unexpired: number;
  routes: number;
  newest: string | null;
};

type CronStatus = {
  enabled: boolean;
  runs: CronRun[];
  cache: CacheSummary[];
};

const PW_STORAGE_KEY = "irctc_keeper_admin_password";

function extractError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function BestSeatsCronAdminPage() {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword(window.localStorage.getItem(PW_STORAGE_KEY) ?? "");
  }, []);

  const loadStatus = useCallback(async () => {
    if (!password) {
      setLoading(false);
      return;
    }
    setError("");
    try {
      const { data } = await apiClient.get<CronStatus>(
        "/api/admin/best-seats-cron",
        { headers: { "x-admin-password": password } },
      );
      setStatus(data);
    } catch (err) {
      setError(extractError(err, "Failed to load cron status."));
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Best-seats cache cron</h1>
      <p className="mt-1 text-slate-600">
        When the precompute cron ran, its outcome, and which routes it updated.
        The cron warms the best-train cache for the curated + top-searched routes
        across today + the next 5 days.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Admin password */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow">
        <label className="block text-sm font-medium text-slate-700">
          Admin password
        </label>
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="CHART_TIME_INGESTION_PASSWORD"
            className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(PW_STORAGE_KEY, password);
              setLoading(true);
              void loadStatus();
            }}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
          >
            Save &amp; load
          </button>
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Reload
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : status ? (
        <>
          {/* Cache summary */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Currently cached
              </h2>
              <span
                className={`rounded-md px-2 py-1 text-xs font-bold ${
                  status.enabled
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                cron {status.enabled ? "enabled" : "disabled"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {status.cache.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing cached yet.</p>
              ) : (
                status.cache.map((c) => (
                  <div
                    key={c.type}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                  >
                    <div className="font-bold text-slate-900">{c.type}</div>
                    <div className="mt-1 text-slate-600">
                      {c.unexpired}/{c.rows} rows live · {c.routes} routes
                    </div>
                    <div className="text-xs text-slate-500">
                      newest {fmt(c.newest)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Run history */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-900">
              Recent runs ({status.runs.length})
            </h2>
            {status.runs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No runs recorded yet (only ticks that refreshed at least one
                route are logged).
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-3">Started</th>
                      <th className="py-2 pr-3">Duration</th>
                      <th className="py-2 pr-3">Refreshed</th>
                      <th className="py-2 pr-3">Failed</th>
                      <th className="py-2 pr-3">Due</th>
                      <th className="py-2 pr-3">Routes cached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.runs.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 align-top"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-700">
                          {fmt(r.startedAt)}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">
                          {r.durationMs != null
                            ? `${(r.durationMs / 1000).toFixed(1)}s`
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 font-semibold text-emerald-700">
                          {r.refreshed}
                        </td>
                        <td
                          className={`py-2 pr-3 font-semibold ${
                            r.failed > 0 ? "text-red-700" : "text-slate-400"
                          }`}
                        >
                          {r.failed}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{r.due}</td>
                        <td className="py-2 pr-3">
                          {r.routes.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {r.routes.map((rt, i) => (
                                <span
                                  key={`${rt.from}-${rt.to}-${rt.date}-${i}`}
                                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                                    rt.status === "ok"
                                      ? "bg-emerald-50 text-emerald-800"
                                      : rt.status === "empty"
                                        ? "bg-slate-100 text-slate-600"
                                        : "bg-red-50 text-red-700"
                                  }`}
                                  title={
                                    rt.status === "ok"
                                      ? `cached${rt.train ? ` · train ${rt.train}` : ""}`
                                      : rt.status === "empty"
                                        ? "cached — no confirmed train found"
                                        : "failed to compute"
                                  }
                                >
                                  {rt.from}→{rt.to} {rt.date.slice(5)}
                                  {rt.train ? ` · ${rt.train}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
