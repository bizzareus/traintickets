"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TrainFoodMenuIndexRow } from "@/lib/trainFoodMenu";

/**
 * Client-side filter over the (small, ~85) list of train food menus. Renders a
 * search box that matches on train number, name or route.
 */
export function FoodMenuList({ rows }: { rows: TrainFoodMenuIndexRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        r.trainNumber.includes(t) ||
        r.trainNumberPair.toLowerCase().includes(t) ||
        r.trainName.toLowerCase().includes(t) ||
        r.route.toLowerCase().includes(t),
    );
  }, [q, rows]);

  return (
    <div>
      <input
        type="search"
        inputMode="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by train number, name or station code…"
        aria-label="Search train food menus"
        className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      <p className="mb-3 text-sm text-slate-500">
        {filtered.length} {filtered.length === 1 ? "train" : "trains"}
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/irctc-train-food-menu/${r.slug}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">
                  {r.route && !r.trainName.includes(" - ")
                    ? `${r.route} ${r.trainName}`
                    : r.trainName}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                {r.trainNumber}
              </span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-sm text-slate-500">No trains match your search.</li>
        )}
      </ul>
    </div>
  );
}
