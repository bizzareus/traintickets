"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { Database, RefreshCw, Search } from "lucide-react";
import moment from "moment";
import { apiClient } from "@/lib/api";

type CachedTrain = {
  trainNumber: string;
  itemCount: number;
  dates: string[];
  classes: string[];
  expiresAt: string | null;
  updatedAt: string | null;
};

type CacheInventory = {
  available: boolean;
  tableName: string;
  generatedAt: string;
  scannedItemCount: number;
  validItemCount: number;
  trainCount: number;
  seatItemCount: number;
  routeCount: number;
  summaryCount: number;
  expiresAt: string | null;
  updatedAt: string | null;
  trains: CachedTrain[];
};

function formatTimestamp(value: string | null): string {
  return value
    ? moment.utc(value).utcOffset("+05:30").format("DD MMM, HH:mm:ss")
    : "Not available";
}

function extractError(error: unknown): string {
  const response = error as {
    response?: { data?: { message?: string; error?: string } };
  };
  return (
    response.response?.data?.message ??
    response.response?.data?.error ??
    "Could not read the DynamoDB cache."
  );
}

export default function CacheStatusPage() {
  const [inventory, setInventory] = useState<CacheInventory | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toUpperCase());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiClient.get<CacheInventory>(
        "/api/admin/seat-cache",
      );
      setInventory(data);
    } catch (requestError) {
      setError(extractError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trains =
    inventory?.trains.filter((train) =>
      train.trainNumber.includes(deferredSearch),
    ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Seat availability infrastructure
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            DynamoDB cache
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Valid, unexpired records currently available to train searches.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-sm">
        <div className="grid lg:grid-cols-[1.3fr_2fr]">
          <div className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Database className="h-5 w-5 text-indigo-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${inventory?.available ? "bg-emerald-400" : "bg-amber-400"}`}
                  />
                  <span className="font-semibold">
                    {loading
                      ? "Reading cache"
                      : inventory?.available
                        ? "Cache available"
                        : "Cache unavailable"}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-slate-400">
                  {inventory?.tableName ?? "lastberth-train-seat-cache"}
                </p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Earliest expiry</dt>
                <dd className="mt-1 font-medium text-slate-200">
                  {formatTimestamp(inventory?.expiresAt ?? null)}
                </dd>
                {inventory?.expiresAt && (
                  <dd className="mt-0.5 text-amber-300">
                    {moment(inventory.expiresAt).fromNow()}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-slate-500">Last cache write</dt>
                <dd className="mt-1 font-medium text-slate-200">
                  {formatTimestamp(inventory?.updatedAt ?? null)}
                </dd>
              </div>
            </dl>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">
            {[
              ["Valid items", inventory?.validItemCount ?? 0],
              ["Trains", inventory?.trainCount ?? 0],
              ["Route searches", inventory?.routeCount ?? 0],
              ["Seat records", inventory?.seatItemCount ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="p-5 sm:p-6">
                <dt className="text-xs font-medium text-slate-400">{label}</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                  {loading ? "-" : Number(value).toLocaleString("en-IN")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Cached train numbers
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {deferredSearch
                ? `${trains.length} matching ${inventory?.trainCount ?? 0} trains`
                : `${inventory?.trainCount ?? 0} trains with valid seat records`}
            </p>
          </div>
          <label className="relative block sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search train number</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search train number"
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Train</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Classes</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3">Valid until</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trains.map((train) => (
                <tr key={train.trainNumber} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-900">
                    {train.trainNumber}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {train.dates.length > 0
                      ? `${train.dates[0]}${train.dates.length > 1 ? ` +${train.dates.length - 1}` : ""}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-40 flex-wrap gap-1">
                      {train.classes.map((travelClass) => (
                        <span
                          key={travelClass}
                          className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700"
                        >
                          {travelClass}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-700">
                    {train.itemCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {train.expiresAt
                      ? moment(train.expiresAt).fromNow()
                      : "No TTL"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatTimestamp(train.updatedAt)}
                  </td>
                </tr>
              ))}
              {!loading && trains.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Database className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {deferredSearch
                        ? "No cached train matches this number."
                        : "No valid train cache records found."}
                    </p>
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    Reading valid cache records...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {inventory && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
            Scanned {inventory.scannedItemCount.toLocaleString("en-IN")} items;
            checked {formatTimestamp(inventory.generatedAt)} IST.
          </div>
        )}
      </section>
    </div>
  );
}
