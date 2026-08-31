import type { Metadata } from "next";
import Link from "next/link";
import { listTrainFoodMenuIndex } from "@/lib/trainFoodMenu";
import { FoodMenuList } from "./FoodMenuList";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  // CTR-focused title: leads with the ranking keyword ("IRCTC Train Food Menu
  // & Prices", pos ~7 on 2k+ impressions) then a question hook that matches the
  // page's top FAQ. Kept short so it survives the "%s | LastBerth" template.
  title: "IRCTC Train Food Menu & Prices: Is Food Free?",
  description:
    "Official IRCTC train food menu and catering prices across 6,300+ Indian Railways trains: Vande Bharat, Rajdhani, Shatabdi, Duronto, and Mail/Express. No PDFs.",
  alternates: { canonical: "/irctc-train-food-menu" },
  openGraph: {
    title: "IRCTC Train Food Menu & Prices: Is Food Free? | LastBerth",
    description:
      "Official IRCTC train food menu and catering prices across 6,300+ Indian Railways trains: Vande Bharat, Rajdhani, Shatabdi, Duronto, and Mail/Express.",
    url: "/irctc-train-food-menu",
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does food cost on a train in India?",
    a: "IRCTC catering charges depend on the train type and class. On Mail & Express trains, standard tea is ₹5-10, veg breakfast is ₹40, veg meal is ₹80, egg meal is ₹90, and chicken biryani is ₹110. On premium trains like Rajdhani and Vande Bharat, breakfast is ₹105-₹155 and lunch/dinner is ₹185-₹245, inclusive of all taxes. Search any train below for exact meal rates.",
  },
  {
    q: "Is food included in train tickets?",
    a: "On Vande Bharat, Rajdhani, Shatabdi, and Duronto trains, catering can be pre-booked with the ticket (catering charge added to the fare) or opted out. On standard Mail, Express, and Superfast trains, food is purchased on board from the pantry car or authorized vendors during travel.",
  },
  {
    q: "What meals are served on Indian Railways trains?",
    a: "Depending on your journey departure time and duration, services include morning tea/coffee, breakfast, lunch, evening tea with snacks, and dinner. Regional menu items vary by operating zone (North, South, East, West, South Central).",
  },
  {
    q: "Where does this menu data come from?",
    a: "All tariffs and dish listings are sourced from official IRCTC on-board catering rate cards, standard commercial circulars, and train-specific menu publications.",
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
          Official IRCTC on-board catering menus and prices across 6,300+ Indian
          Railways trains. Organized by coach class and meal, with prices
          inclusive of taxes. Pick or search any train to view its complete
          menu.
        </p>
      </header>

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
        <section aria-label="Search individual trains">
          <h2 className="mb-3 text-lg font-bold text-slate-900">
            Find Food Menu by Train
          </h2>
          <FoodMenuList rows={rows} />
        </section>
      ) : (
        <p className="text-slate-600">
          Menus are being added. Check back soon.
        </p>
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
        <Link
          href="/chart-times"
          className="font-medium text-blue-700 hover:underline"
        >
          train chart preparation times
        </Link>{" "}
        ·{" "}
        <Link
          href="/pnr-status"
          className="font-medium text-blue-700 hover:underline"
        >
          PNR status
        </Link>
      </p>
    </>
  );
}
