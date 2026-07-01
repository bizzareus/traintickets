"use client";

import { useMemo, useState } from "react";
import type { StandardMenuGroup } from "@/lib/standardMenu";
import { dishVisual } from "@/lib/foodEmoji";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function StandardMenuView({ group }: { group: StandardMenuGroup }) {
  const [zoneKey, setZoneKey] = useState(group.zones[0]?.key ?? "");
  const [q, setQ] = useState("");
  const zone = group.zones.find((z) => z.key === zoneKey) ?? group.zones[0];

  const services = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (zone?.services ?? [])
      .map((s) => ({
        service: s.service,
        price: s.price,
        sets: term
          ? s.sets.filter(
              (x) =>
                x.toLowerCase().includes(term) ||
                s.service.toLowerCase().includes(term),
            )
          : s.sets,
      }))
      .filter((s) => s.sets.length > 0);
  }, [zone, q]);

  return (
    <div className="pb-16">
      {/* Zone selector */}
      <div className="mb-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Zone / menu
        </p>
        <div className="flex flex-wrap gap-2">
          {group.zones.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZoneKey(z.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                z.key === zoneKey
                  ? "bg-amber-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {z.zone}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
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
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this menu (e.g. paneer, poori, biryani)…"
          aria-label="Search the menu"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      {/* Category jump bar */}
      {!q.trim() && services.length > 0 && (
        <nav className="sticky top-[57px] z-10 -mx-4 mb-4 overflow-x-auto border-y border-slate-100 bg-white/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex gap-2">
            {services.map((s) => (
              <a
                key={s.service}
                href={`#svc-${slugify(s.service)}`}
                className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:text-amber-700"
              >
                {s.service}
              </a>
            ))}
          </div>
        </nav>
      )}

      {services.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No dishes match &ldquo;{q.trim()}&rdquo; in this zone.
        </p>
      ) : (
        <div className="space-y-8">
          {services.map((s) => (
            <section
              key={s.service}
              id={`svc-${slugify(s.service)}`}
              className="scroll-mt-28"
            >
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-slate-100 pb-2">
                <h2 className="text-lg font-bold text-slate-900">{s.service}</h2>
                {s.price != null && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                    ₹{s.price}
                    <span className="ml-1 text-xs font-medium text-amber-600/80">
                      / person
                    </span>
                  </span>
                )}
              </div>
              {s.sets.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  {s.sets.length} daily menu sets (served on a weekly rotation).
                </p>
              )}
              <ul className="divide-y divide-slate-100">
                {s.sets.map((setText, i) => {
                  const v = dishVisual(setText);
                  return (
                    <li key={i} className="flex gap-3 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {s.sets.length > 1 && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                              Set {i + 1}
                            </span>
                          )}
                          {s.price != null && (
                            <span className="text-lg font-extrabold text-emerald-700">
                              ₹{s.price}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                          {setText}
                        </p>
                      </div>
                      <div
                        className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${v.bg} text-4xl shadow-sm ring-1 ring-black/5`}
                        aria-hidden
                      >
                        {v.emoji}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Dish images are illustrative. Menus rotate daily (Set 1 to Set 7) and may
        vary by zone and season. Prices are per meal, inclusive of taxes. Source:
        official IRCTC menu (
        <a
          href={zone?.sourcePdfUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-blue-700 hover:underline"
        >
          {zone?.zone} PDF
        </a>
        ).
      </p>
    </div>
  );
}
