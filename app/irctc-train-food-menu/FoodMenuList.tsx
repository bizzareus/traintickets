"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TrainFoodMenuIndexRow } from "@/lib/trainFoodMenu";

const PAGE_SIZE = 60;

const TRAIN_TYPES: { key: string; label: string }[] = [
  { key: "all", label: "All Trains" },
  { key: "vande-bharat", label: "Vande Bharat" },
  { key: "rajdhani", label: "Rajdhani" },
  { key: "shatabdi", label: "Shatabdi" },
  { key: "duronto", label: "Duronto" },
  { key: "mail-express", label: "Mail / Express" },
];

function typeBadge(type?: string) {
  switch (type) {
    case "vande-bharat":
      return (
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
          Vande Bharat
        </span>
      );
    case "rajdhani":
      return (
        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
          Rajdhani
        </span>
      );
    case "shatabdi":
      return (
        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
          Shatabdi
        </span>
      );
    case "duronto":
      return (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
          Duronto
        </span>
      );
    case "garib-rath":
      return (
        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-700">
          Garib Rath
        </span>
      );
    case "humsafar":
      return (
        <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-700">
          Humsafar
        </span>
      );
    default:
      return null;
  }
}

export function FoodMenuList({ rows }: { rows: TrainFoodMenuIndexRow[] }) {
  const [q, setQ] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      // Type filter
      if (selectedType !== "all" && r.trainType !== selectedType) {
        return false;
      }

      // Text query
      if (!t) return true;
      return (
        r.trainNumber.includes(t) ||
        r.trainNumberPair.toLowerCase().includes(t) ||
        r.trainName.toLowerCase().includes(t) ||
        r.route.toLowerCase().includes(t)
      );
    });
  }, [q, rows, selectedType]);

  const visibleRows = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  return (
    <div>
      {/* Search Input */}
      <div className="relative mb-4">
        <span
          className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400"
          aria-hidden
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.43 9.8l3.13 3.14a.75.75 0 1 0 1.06-1.06l-3.13-3.14A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by train number (e.g. 12951, 20641) or train name…"
          aria-label="Search train food menus"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Train Type Filter Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TRAIN_TYPES.map((type) => (
          <button
            key={type.key}
            type="button"
            onClick={() => {
              setSelectedType(type.key);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              selectedType === type.key
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Result Count */}
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {visibleRows.length} of {filtered.length}{" "}
          {filtered.length === 1 ? "train" : "trains"}
        </span>
        {filtered.length > visibleCount && (
          <span>Scroll down to see more</span>
        )}
      </div>

      {/* Train List Grid */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleRows.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/irctc-train-food-menu/${r.slug}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md hover:border-slate-300"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="truncate font-semibold text-slate-900 text-sm">
                    {r.route && !r.trainName.includes(" - ")
                      ? `${r.route} ${r.trainName}`
                      : r.trainName}
                  </span>
                  {typeBadge(r.trainType)}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                {r.trainNumber}
              </span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="col-span-full rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No trains match your filters. Try a different search term or reset filters.
          </li>
        )}
      </ul>

      {/* Load More Button */}
      {filtered.length > visibleCount && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Load more trains ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
