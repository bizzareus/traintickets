"use client";

import { useMemo, useState } from "react";
import type { FoodMenuClass } from "@/lib/trainFoodMenu";

function inr(n: number | null): string {
  return n == null ? "—" : `₹${n}`;
}

/**
 * Per-class menu sections with a client-side search box. The query matches a
 * meal type (service, e.g. "breakfast") — showing that whole service — or a
 * dish name/description (e.g. "paneer"), filtering to matching items. Empty
 * query shows the full menu.
 */
export function MenuClassesSearch({ classes }: { classes: FoodMenuClass[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return classes
      .map((c) => {
        const services = c.services
          .map((s) => {
            const serviceHit = !t || s.service.toLowerCase().includes(t);
            const items = serviceHit
              ? s.items
              : s.items.filter(
                  (it) =>
                    it.item.toLowerCase().includes(t) ||
                    it.description.toLowerCase().includes(t),
                );
            return { service: s, items, keep: serviceHit || items.length > 0 };
          })
          .filter((s) => s.keep);
        return { cls: c, services };
      })
      .filter((c) => c.services.length > 0);
  }, [q, classes]);

  const hasResults = filtered.length > 0;

  return (
    <div>
      <div className="relative mb-5">
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
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a dish or meal (e.g. paneer, breakfast, tea)…"
          aria-label="Search the menu by dish or meal type"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {!hasResults && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No dishes or meals match &ldquo;{q.trim()}&rdquo;.
        </p>
      )}

      {filtered.map(({ cls, services }) => (
        <section key={cls.classCode} className="mb-8">
          <h2 className="mb-3 text-xl font-bold text-slate-900">
            {cls.className} ({cls.classCode})
          </h2>
          <div className="space-y-4">
            {services.map(({ service: s, items }) => (
              <div
                key={s.service}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900">
                    {s.service}
                  </h3>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                    {inr(s.price)}
                  </span>
                </div>
                <dl className="divide-y divide-slate-100">
                  {items.map((it, i) => (
                    <div
                      key={`${it.item}-${i}`}
                      className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4"
                    >
                      <dt className="shrink-0 font-semibold text-slate-700 sm:w-44">
                        {it.item}
                      </dt>
                      <dd className="text-slate-600">{it.description}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
