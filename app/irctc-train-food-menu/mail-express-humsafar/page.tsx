import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  title:
    "Train Tea, Coffee & Water Prices: Mail, Express & Humsafar (IRCTC) | LastBerth",
  description:
    "Official IRCTC beverage charges on Mail, Express and Humsafar trains: standard tea ₹5, tea with tea bag ₹10, coffee ₹10, Rail Neer water ₹14 (1 litre) / ₹9 (500 ml). At-station vs in-train rates, inclusive of taxes.",
  alternates: { canonical: "/irctc-train-food-menu/mail-express-humsafar" },
  openGraph: {
    title:
      "Train Tea, Coffee & Water Prices: Mail, Express & Humsafar (IRCTC) | LastBerth",
    description:
      "Official IRCTC beverage charges on Mail, Express and Humsafar trains — tea, coffee, soup and Rail Neer water, at-station vs in-train.",
    url: "/irctc-train-food-menu/mail-express-humsafar",
  },
};

type Rate = { item: string; atStation: number | null; inTrain: number | null };
type RateGroup = { title: string; note?: string; rows: Rate[] };

const GROUPS: RateGroup[] = [
  {
    title: "Tea & coffee",
    rows: [
      {
        item: "Standard tea (150 ml, in a 170 ml disposable cup)",
        atStation: 5,
        inTrain: 5,
      },
      {
        item: "Tea with tea bag (150 ml, in a 170 ml disposable cup)",
        atStation: 10,
        inTrain: 10,
      },
      {
        item: "Coffee, instant coffee powder (150 ml, in a 170 ml disposable cup)",
        atStation: 10,
        inTrain: 10,
      },
    ],
  },
  {
    title: "Humsafar trains (via AVM vending machine)",
    note: "Served on board only — not sold at stations.",
    rows: [
      {
        item: "Tea, all variants without tea bag (100 ml, in a 120 ml cup)",
        atStation: null,
        inTrain: 10,
      },
      { item: "Coffee (100 ml, in a 120 ml cup)", atStation: null, inTrain: 15 },
      { item: "Soup (100 ml, in a 120 ml cup)", atStation: null, inTrain: 15 },
    ],
  },
  {
    title: "Rail Neer / packaged drinking water (chilled)",
    rows: [
      { item: "1 litre bottle (1000 ml)", atStation: 14, inTrain: 14 },
      { item: "500 ml bottle", atStation: 9, inTrain: 9 },
    ],
  },
];

function inr(n: number | null): string {
  return n == null ? "N/A" : `₹${n}`;
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does a cup of tea cost on a train?",
    a: "On Mail and Express trains, standard tea is ₹5 and tea made with a tea bag is ₹10, served in a 150 ml portion. Coffee is ₹10. These are the official IRCTC rates, inclusive of taxes, and are the same whether bought at the station or on board.",
  },
  {
    q: "What is the price of a water bottle in a train?",
    a: "Rail Neer (IRCTC packaged drinking water) is ₹14 for a 1 litre bottle and ₹9 for a 500 ml bottle, chilled, inclusive of taxes. The price is the same at the station and on the train.",
  },
  {
    q: "Why are Humsafar beverage prices different?",
    a: "Humsafar trains serve tea, coffee and soup through AVM vending machines on board, in a 100 ml portion: tea ₹10, coffee ₹15 and soup ₹15. These are sold on the train only, not at stations.",
  },
  {
    q: "Are these beverage rates the same on all trains?",
    a: "These are the standard IRCTC rates for Mail, Express and Humsafar trains. Premium trains like Rajdhani, Shatabdi, Vande Bharat and Tejas include catering in the fare with their own menus, so they do not use this à la carte beverage list.",
  },
];

export default function MailExpressHumsafarBeveragesPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Train Food Menu",
        item: `${SITE_URL}/irctc-train-food-menu`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Mail / Express / Humsafar beverage prices",
        item: `${SITE_URL}/irctc-train-food-menu/mail-express-humsafar`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-blue-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/irctc-train-food-menu" className="hover:text-blue-700">
          Train Food Menu
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">Mail / Express / Humsafar</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Train Tea, Coffee &amp; Water Prices
        </h1>
        <p className="mt-2 text-slate-600">
          Official IRCTC beverage charges on{" "}
          <span className="font-medium">Mail, Express and Humsafar</span> trains,
          for items bought at the station or on board. All rates are inclusive of
          taxes and apply to vegetarian items.
        </p>
      </header>

      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-1 text-base font-bold text-slate-900">{g.title}</h2>
            {g.note && <p className="mb-3 text-sm text-slate-500">{g.note}</p>}
            {!g.note && <div className="mb-3" />}
            <ul className="space-y-3">
              {g.rows.map((r) => (
                <li
                  key={r.item}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="mb-3 flex items-start gap-2 sm:mb-0">
                    <span
                      className="mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-green-600"
                      title="Vegetarian"
                      aria-label="Vegetarian"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                    </span>
                    <span className="font-medium text-slate-800">{r.item}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <span className="flex-1 rounded-lg bg-slate-50 px-3 py-2 sm:flex-none sm:min-w-[6.5rem]">
                      <span className="block text-xs text-slate-500">
                        At station
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {inr(r.atStation)}
                      </span>
                    </span>
                    <span className="flex-1 rounded-lg bg-slate-50 px-3 py-2 sm:flex-none sm:min-w-[6.5rem]">
                      <span className="block text-xs text-slate-500">
                        In train
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {inr(r.inTrain)}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-slate-900">
          Frequently asked questions
        </h2>
        <div className="space-y-5">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold text-slate-900">{f.q}</h3>
              <p className="mt-1 text-slate-600">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 text-sm text-slate-500">
        See also{" "}
        <Link
          href="/irctc-train-food-menu"
          className="font-medium text-blue-700 hover:underline"
        >
          per-train food menus (Vande Bharat &amp; Tejas)
        </Link>
        .
      </p>
    </>
  );
}
