import type { Metadata } from "next";
import Link from "next/link";
import { listTrainFoodMenuIndex } from "@/lib/trainFoodMenu";
import { FoodMenuList } from "./FoodMenuList";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  title: "IRCTC Train Food Menu & Prices (Vande Bharat)",
  description:
    "Readable IRCTC train food menus and catering prices, organised by class and meal. Browse Vande Bharat train menus with breakfast, lunch/dinner and snack charges — no PDFs.",
  alternates: { canonical: "/irctc-train-food-menu" },
  openGraph: {
    title: "IRCTC Train Food Menu & Prices (Vande Bharat) | LastBerth",
    description:
      "Readable IRCTC train food menus and catering prices, organised by class and meal.",
    url: "/irctc-train-food-menu",
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does food cost on a Vande Bharat train?",
    a: "IRCTC catering charges depend on the meal and class. On most Vande Bharat routes, morning tea is around ₹15, breakfast is roughly ₹120 to ₹155, and lunch or dinner is about ₹220 to ₹245, all inclusive of taxes. Open a specific train below for its exact prices.",
  },
  {
    q: "Is food included in a Vande Bharat ticket?",
    a: "On most Vande Bharat services catering is pre-booked along with the ticket at the time of booking, so the meal charge is added to the fare. If you skip catering at booking, food can sometimes be bought on board subject to availability.",
  },
  {
    q: "What meals are served on Vande Bharat trains?",
    a: "Depending on the departure time and route, a service may include morning tea, breakfast, an evening snack, and lunch or dinner. The exact set of meals and items is listed on each train's menu page.",
  },
  {
    q: "Where does this menu data come from?",
    a: "These menus are taken from the official IRCTC catering menu published for each train and reorganised into a readable format. Each train page links to the original IRCTC source.",
  },
];

export default function TrainFoodMenuIndexPage() {
  const rows = listTrainFoodMenuIndex();

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

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          IRCTC Train Food Menu &amp; Prices
        </h1>
        <p className="mt-2 text-slate-600">
          IRCTC publishes train catering menus only as hard-to-read PDFs. Here
          they are organised by class and meal, with prices inclusive of taxes.
          Pick a train to see its full menu and per-meal charges.
        </p>
      </header>

      <section className="mb-8" aria-label="Standard menus by class">
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Not a Vande Bharat? Standard menus by class
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Rajdhani, Shatabdi, Duronto and Mail/Express trains use IRCTC&apos;s
          standard menu for their class and zone.
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { href: "/irctc-train-food-menu/rajdhani-1ac-executive", label: "Rajdhani 1AC & Executive Chair Car", sub: "First AC (1A) and Executive Chair Car (EC)" },
            { href: "/irctc-train-food-menu/ac-2a-3a-cc", label: "AC 2A / 3A / Chair Car", sub: "Rajdhani, Shatabdi and AC Mail/Express" },
            { href: "/irctc-train-food-menu/duronto-sleeper", label: "Duronto Sleeper Class", sub: "Duronto Express sleeper" },
            { href: "/irctc-train-food-menu/mail-express-humsafar", label: "Mail / Express / Humsafar", sub: "Breakfast, meals, beverages, à la carte" },
          ].map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="flex h-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">
                    {c.label}
                  </span>
                  <span className="block text-xs text-slate-500">{c.sub}</span>
                </span>
                <span className="shrink-0 text-blue-600" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Vande Bharat: opted out of catering?
        </h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Current-booking and opt-out passengers on Vande Bharat trains can get a
          ready-to-eat (cup/tub pack) meal at the same tariff, inclusive of GST:
          in Chair Car, breakfast ₹122, lunch/dinner ₹222 (veg or chicken) and
          evening tea ₹66; in Executive Chair Car, ₹155 / ₹244 / ₹105. Meals
          include RTE items such as Rava Upma/Pongal/Poha, jeera rice with
          rajma/dal, veg or chicken biryani, soup and a beverage.
        </p>
      </section>

      {rows.length > 0 ? (
        <FoodMenuList rows={rows} />
      ) : (
        <p className="text-slate-600">Menus are being added. Check back soon.</p>
      )}

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
        Related:{" "}
        <Link href="/chart-times" className="font-medium text-blue-700 hover:underline">
          train chart preparation times
        </Link>{" "}
        ·{" "}
        <Link href="/pnr-status" className="font-medium text-blue-700 hover:underline">
          PNR status
        </Link>
      </p>
    </>
  );
}
