import type { Metadata } from "next";
import Link from "next/link";
import {
  CATERING_BLOCKS,
  type CateringItem,
  type CateringSection,
} from "@/lib/mailExpressCatering";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  title:
    "Mail, Express & Humsafar Train Food Menu & Prices (IRCTC) | LastBerth",
  description:
    "Official IRCTC catering charges on Mail, Express and Humsafar trains: breakfast, meals (veg, egg, chicken biryani), tea, coffee, Rail Neer water and the full à la carte tariff. At-station vs in-train rates, inclusive of taxes.",
  alternates: { canonical: "/irctc-train-food-menu/mail-express-humsafar" },
  openGraph: {
    title:
      "Mail, Express & Humsafar Train Food Menu & Prices (IRCTC) | LastBerth",
    description:
      "Official IRCTC catering charges on Mail, Express and Humsafar trains: breakfast, meals, beverages and the full à la carte tariff.",
    url: "/irctc-train-food-menu/mail-express-humsafar",
  },
};

function inr(n: number | null | undefined): string {
  return n == null ? "N/A" : `₹${n}`;
}

function VegMark({ veg }: { veg: boolean }) {
  return veg ? (
    <span
      className="mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-green-600"
      title="Vegetarian"
      aria-label="Vegetarian"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
    </span>
  ) : (
    <span
      className="mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-red-700"
      title="Non-vegetarian"
      aria-label="Non-vegetarian"
    >
      <svg viewBox="0 0 10 10" className="h-2 w-2 fill-red-700">
        <polygon points="5,1 9,9 1,9" />
      </svg>
    </span>
  );
}

function PriceChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-center sm:flex-none sm:min-w-[6rem] sm:text-left">
      <span className="block text-xs text-slate-500">{label}</span>
      <span className="text-base font-bold text-slate-900">{value}</span>
    </span>
  );
}

function ItemRow({ it, mode }: { it: CateringItem; mode: CateringSection["mode"] }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="mb-3 flex items-start gap-2 sm:mb-0">
        <VegMark veg={it.veg} />
        <span className="min-w-0">
          <span className="block font-medium text-slate-800">{it.item}</span>
          {it.desc && (
            <span className="mt-0.5 block text-sm text-slate-500">{it.desc}</span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        {mode === "station-train" ? (
          <>
            <PriceChip label="At station" value={inr(it.atStation)} />
            <PriceChip label="In train" value={inr(it.inTrain)} />
          </>
        ) : (
          <PriceChip label="Price" value={inr(it.price)} />
        )}
      </div>
    </li>
  );
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does food cost on a Mail or Express train?",
    a: "Standard IRCTC rates (inclusive of taxes): a veg breakfast is ₹35 at the station / ₹40 on board, a veg meal is ₹70 / ₹80, chicken biryani is ₹100 / ₹110, and the budget Janta Meal is ₹15 / ₹20. À la carte snacks start at ₹20.",
  },
  {
    q: "How much is a cup of tea or a water bottle on a train?",
    a: "Standard tea is ₹5 and tea with a tea bag is ₹10; coffee is ₹10. Rail Neer packaged water is ₹14 for 1 litre and ₹9 for 500 ml. These rates are the same at the station and on board.",
  },
  {
    q: "What is the cheapest meal on a train?",
    a: "The Janta Meal (7 pooris, aloo dry curry and pickle) is the cheapest at ₹15 at the station and ₹20 on board. Among à la carte items, chapati, samosa, idli and jalebi are ₹20.",
  },
  {
    q: "Are these rates the same on all trains?",
    a: "These are the standard rates for Mail, Express and Humsafar trains. Premium trains like Rajdhani, Shatabdi, Vande Bharat and Tejas include catering in the fare with their own set menus, so they do not use this à la carte list.",
  },
];

const TOC = CATERING_BLOCKS.map((b) => ({ id: b.id, heading: b.heading }));

export default function MailExpressHumsafarPage() {
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
        name: "Mail / Express / Humsafar catering charges",
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
          Mail, Express &amp; Humsafar Train Food Menu &amp; Prices
        </h1>
        <p className="mt-2 text-slate-600">
          Official IRCTC catering charges on{" "}
          <span className="font-medium">Mail, Express and Humsafar</span> trains
          — breakfast, meals, beverages and the full à la carte tariff. Prices
          are inclusive of taxes; à la carte prices are inclusive of GST.
        </p>
      </header>

      {/* Jump nav */}
      <nav
        aria-label="Sections"
        className="mb-8 flex flex-wrap gap-2 text-sm font-medium"
      >
        {TOC.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            {t.heading}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        {CATERING_BLOCKS.map((block) => (
          <section key={block.id} id={block.id} className="scroll-mt-20">
            <h2 className="mb-4 text-xl font-bold text-slate-900">
              {block.heading}
            </h2>
            <div className="space-y-6">
              {block.sections.map((s) => (
                <div key={s.title}>
                  {(block.sections.length > 1 || s.title !== block.heading) && (
                    <h3 className="mb-1 text-base font-semibold text-slate-800">
                      {s.title}
                    </h3>
                  )}
                  {s.note && (
                    <p className="mb-2 text-sm text-slate-500">{s.note}</p>
                  )}
                  <ul className="mt-2 space-y-3">
                    {s.items.map((it) => (
                      <ItemRow key={it.item} it={it} mode={s.mode} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Items are marked vegetarian (green) or non-vegetarian (red). Rates are
        the standard IRCTC catering charges and may be revised by Railways.
      </p>

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
