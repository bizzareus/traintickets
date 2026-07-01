"use client";

import { useMemo, useState } from "react";
import type { TrainFoodMenu } from "@/lib/trainFoodMenu";

/** Items that are accompaniments, not dishes — hidden from the visual menu. */
const NON_FOOD = /napkin|sanitizer|tissue|tray ?mat|hand /i;
const NON_VEG = /egg|omelette|omlette|chicken|fish|mutton|prawn|kheema|keema/i;

/** Pick a food emoji + tile gradient from the item name/description. */
function dishVisual(text: string): { emoji: string; bg: string } {
  const t = text.toLowerCase();
  const pick = (emoji: string, bg: string) => ({ emoji, bg });
  if (/water|rail neer/.test(t)) return pick("💧", "from-sky-100 to-sky-50");
  if (/tea|coffee|beverage/.test(t)) return pick("☕", "from-amber-100 to-orange-50");
  if (/juice|lassi|milk|chaas|nimbu|shake|drink/.test(t)) return pick("🥤", "from-rose-100 to-amber-50");
  if (/soup/.test(t)) return pick("🍜", "from-orange-100 to-amber-50");
  if (/biryani|pulao|rice/.test(t)) return pick("🍛", "from-amber-100 to-yellow-50");
  if (/dal|sambar|sambhar|rajma|chole|kadhi|dalma|ghugani/.test(t)) return pick("🥣", "from-orange-100 to-amber-50");
  if (/paneer|kofta|tikka|masala|curry|sabji|bhaji|korma|special|main course/.test(t)) return pick("🍲", "from-red-100 to-orange-50");
  if (/chicken/.test(t)) return pick("🍗", "from-red-100 to-amber-50");
  if (/fish/.test(t)) return pick("🐟", "from-cyan-100 to-sky-50");
  if (/egg|omelette|omlette/.test(t)) return pick("🍳", "from-amber-100 to-yellow-50");
  if (/paratha|parantha|roti|chapati|kulcha|naan|bread|thepla|poori|puri|litti/.test(t)) return pick("🫓", "from-amber-100 to-orange-50");
  if (/idli|idly|dosa|uttapam|utappam|vada|upma|pongal|poha|dhokla/.test(t)) return pick("🥞", "from-yellow-100 to-amber-50");
  if (/samosa|kachori|pakora|bonda|patties|momo|spring roll|cutlet|hot snack|namkeen/.test(t)) return pick("🥟", "from-orange-100 to-yellow-50");
  if (/sandwich|burger|pav|bun/.test(t)) return pick("🥪", "from-lime-100 to-amber-50");
  if (/popcorn/.test(t)) return pick("🍿", "from-yellow-100 to-amber-50");
  if (/cake|muffin|cookie|biscuit|pastry|croissant/.test(t)) return pick("🧁", "from-pink-100 to-rose-50");
  if (/ice ?cream|halwa|jalebi|gulab|kesari|sweet|dessert|mishti|dahi|curd|srikhand|sheera|matho/.test(t)) return pick("🍨", "from-pink-100 to-amber-50");
  if (/fruit|banana|apple|orange/.test(t)) return pick("🍎", "from-rose-100 to-lime-50");
  if (/cereal|corn ?flakes|oats|muesli/.test(t)) return pick("🥣", "from-amber-100 to-yellow-50");
  if (/pickle|condiment|salt|pepper|ketchup|sauce/.test(t)) return pick("🧂", "from-slate-100 to-slate-50");
  if (/vegetable|veg\.?|salad/.test(t)) return pick("🥗", "from-lime-100 to-green-50");
  return pick("🍽️", "from-slate-100 to-slate-50");
}

function VegMark({ nonVeg }: { nonVeg: boolean }) {
  return (
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${nonVeg ? "border-red-700" : "border-green-600"}`}
      title={nonVeg ? "Non-vegetarian" : "Vegetarian"}
      aria-label={nonVeg ? "Non-vegetarian" : "Vegetarian"}
    >
      {nonVeg ? (
        <svg viewBox="0 0 10 10" className="h-2 w-2 fill-red-700">
          <polygon points="5,1 9,9 1,9" />
        </svg>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
      )}
    </span>
  );
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function FoodOrderingMenu({ menu }: { menu: TrainFoodMenu }) {
  const [classCode, setClassCode] = useState(menu.classes[0]?.classCode ?? "");
  const [q, setQ] = useState("");
  const cls = menu.classes.find((c) => c.classCode === classCode) ?? menu.classes[0];

  const sections = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (cls?.services ?? [])
      .map((s) => ({
        service: s.service,
        price: s.price,
        items: s.items.filter(
          (it) =>
            !NON_FOOD.test(it.item) &&
            !NON_FOOD.test(it.description) &&
            (!term ||
              it.item.toLowerCase().includes(term) ||
              it.description.toLowerCase().includes(term) ||
              s.service.toLowerCase().includes(term)),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [cls, q]);

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          IRCTC catering · {menu.route}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {menu.trainName}{" "}
          <span className="text-slate-400">({menu.trainNumberPair})</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          On-board menu · prices inclusive of taxes
        </p>
      </div>

      {/* Class toggle */}
      {menu.classes.length > 1 && (
        <div className="mb-4 inline-flex rounded-full bg-slate-100 p-1">
          {menu.classes.map((c) => (
            <button
              key={c.classCode}
              type="button"
              onClick={() => setClassCode(c.classCode)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                c.classCode === classCode
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {c.className} ({c.classCode})
            </button>
          ))}
        </div>
      )}

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
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search dishes (e.g. paneer, dosa, tea)…"
          aria-label="Search the menu"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      {/* Category jump bar (sticky) */}
      {!q.trim() && sections.length > 0 && (
        <nav className="sticky top-[57px] z-10 -mx-4 mb-4 overflow-x-auto border-y border-slate-100 bg-white/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex gap-2">
            {sections.map((s) => (
              <a
                key={s.service}
                href={`#cat-${slugify(s.service)}`}
                className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:text-amber-700"
              >
                {s.service}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No dishes match &ldquo;{q.trim()}&rdquo;.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.service} id={`cat-${slugify(s.service)}`} className="scroll-mt-28">
              <h2 className="mb-3 border-b border-slate-100 pb-2 text-lg font-bold text-slate-900">
                {s.service}
              </h2>

              <ul className="divide-y divide-slate-100">
                {s.items.map((it, i) => {
                  const nonVeg = NON_VEG.test(it.item) || NON_VEG.test(it.description);
                  const v = dishVisual(`${it.item} ${it.description}`);
                  const price = s.price;
                  return (
                    <li key={`${it.item}-${i}`} className="flex gap-3 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <VegMark nonVeg={nonVeg} />
                          <h3 className="font-semibold text-slate-900">
                            {it.item}
                          </h3>
                        </div>
                        {price != null && (
                          <p className="mt-1 text-xl font-extrabold text-emerald-700">
                            ₹{price}
                          </p>
                        )}
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">
                          {it.description}
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
        Preview UI · dish images are placeholders. For Vande Bharat the price
        shown is the meal/set price (charged per meal, not per dish). Menu served
        on a cyclic basis; items and prices may change. Source: official IRCTC
        menu.
      </p>
    </div>
  );
}
