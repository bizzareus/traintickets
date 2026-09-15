"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";

type RefundEntry = {
  id: string;
  mobile: string;
  trainNumber: string;
  journeyDate: string;
  txnId: string | null;
  status: "PENDING" | "RESOLVED" | "REJECTED";
  createdAt: string;
};

function extractError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? fallback;
}

// Same shared key + header the other admin pages (unsubscribes, cron-runs,
// irctc-cookies) use. The httpOnly `admin_session` cookie (sent automatically
// via withCredentials) remains as backup.
const PW_STORAGE_KEY = "irctc_keeper_admin_password";

const STATUS_STYLES: Record<RefundEntry["status"], string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-slate-200 bg-slate-100 text-slate-600",
};

export default function AdminRefundsPage() {
  const [entries, setEntries] = useState<RefundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [filter, setFilter] = useState<"all" | RefundEntry["status"]>("all");
  const [search, setSearch] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    setPassword(window.localStorage.getItem(PW_STORAGE_KEY) ?? "");
  }, []);

  const authHeaders = useCallback(
    () => (password ? { "x-admin-password": password } : {}),
    [password],
  );

  const load = useCallback(async () => {
    if (!password) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await apiClient.get<{ entries: RefundEntry[] }>(
        "/api/refund-requests/admin",
        { headers: authHeaders() },
      );
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(extractError(err, "Failed to load refund requests."));
    } finally {
      setLoading(false);
    }
  }, [password, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePassword = () => {
    window.localStorage.setItem(PW_STORAGE_KEY, password);
    setLoading(true);
    void load();
  };

  async function handleSetStatus(id: string, status: "RESOLVED" | "REJECTED") {
    if (
      !confirm(
        `Mark this refund request as ${status.toLowerCase()}? This only updates the dashboard record.`,
      )
    )
      return;
    setActingId(id);
    try {
      await apiClient.patch(
        `/api/refund-requests/admin/${id}`,
        { status },
        { headers: authHeaders() },
      );
      trackAnalyticsEvent({
        name: "admin_refund_status_changed",
        properties: { status },
      });
      await load();
    } catch (err) {
      alert(extractError(err, "Failed to update status."));
    } finally {
      setActingId(null);
    }
  }

  const filtered = entries.filter((e) => {
    if (filter !== "all" && e.status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (
      q &&
      !`${e.mobile} ${e.trainNumber} ${e.txnId ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });

  const pendingCount = entries.filter((e) => e.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Refund Requests{" "}
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manual refund requests submitted via the /refund form. Each
            submission also emails the monitoring admin. Mark entries resolved
            once the refund is issued.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Password (same shared key as the other admin pages) */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoComplete="current-password"
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          onClick={savePassword}
          disabled={!password}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save & load
        </button>
        <span className="text-xs text-slate-500">
          Saved once in this browser and reused by all admin pages.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Filter:</span>
          {(["all", "PENDING", "RESOLVED", "REJECTED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mobile, train, txn…"
            className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="basis-full text-xs text-slate-500">
          {filtered.length} of {entries.length} shown
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="text-sm">{error}</p>
          <p className="mt-2 text-xs">
            Save the admin password above and click Refresh. If it still fails,
            re-unlock the admin gate from the lock button in the header, then
            refresh.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <p className="text-sm text-slate-500">Loading refund requests…</p>
          </div>
        </div>
      ) : !error && entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          No refund requests yet. They appear here when users submit the /refund
          form.
        </div>
      ) : !error && filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          No entries match the current filter.
        </div>
      ) : !error ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Mobile
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Train
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Journey date
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Txn ID
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Status
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Created
                  </th>
                  <th className="px-6 py-4 font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition hover:bg-slate-50/50"
                  >
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-900">
                      {entry.mobile}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-900">
                      {entry.trainNumber}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-600">
                      {entry.journeyDate.slice(0, 10)}
                    </td>
                    <td className="max-w-40 truncate px-6 py-4 font-mono text-xs text-slate-600">
                      {entry.txnId || (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[entry.status]}`}
                      >
                        {entry.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-600">
                      {new Date(entry.createdAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {entry.status === "PENDING" ? (
                        <span className="flex gap-2">
                          <button
                            onClick={() =>
                              handleSetStatus(entry.id, "RESOLVED")
                            }
                            disabled={actingId === entry.id}
                            className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() =>
                              handleSetStatus(entry.id, "REJECTED")
                            }
                            disabled={actingId === entry.id}
                            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </span>
                      ) : (
                        <span className="text-xs italic text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
