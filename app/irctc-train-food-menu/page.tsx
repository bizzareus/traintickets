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
    "Is food free on Vande Bharat trains? See what's included and exact IRCTC catering prices by class and meal — breakfast ~₹120, lunch/dinner ~₹220. No PDFs.",
  alternates: { canonical: "/irctc-train-food-menu" },
  openGraph: {
    title: "IRCTC Train Food Menu & Prices: Is Food Free? | LastBerth",
    description:
      "Is food free on Vande Bharat trains? What's included, plus exact IRCTC catering prices by class and meal — breakfast ~₹120, lunch/dinner ~₹220.",
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

      <section className="mb-8" aria-label="Standard menus by train category & zone">
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Catering Menus by Train Category
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Official IRCTC food menus and per-meal pricing across major Indian Railways train types.
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 mb-6">
          {[
            { href: "/irctc-train-food-menu/ac-coach-food-menu-prices", label: "AC 2A / 3A / Chair Car Menu", sub: "Standard AC 2-Tier, 3-Tier and Chair Car meal charges" },
            { href: "/irctc-train-food-menu/duronto-sleeper-class-food-menu-prices", label: "Duronto Sleeper Class Menu", sub: "Official Duronto Express sleeper class catering prices" },
            { href: "/irctc-train-food-menu/rajdhani-express-food-menu-prices", label: "Rajdhani Express Food Menu", sub: "1AC, 2A, 3A & Executive Chair Car catering prices" },
            { href: "/irctc-train-food-menu/shatabdi-express-food-menu-prices", label: "Shatabdi Express Food Menu", sub: "Executive Chair Car (EC) & AC Chair Car (CC)" },
            { href: "/irctc-train-food-menu/vande-bharat-express-food-menu-prices", label: "Vande Bharat Express Menu", sub: "Executive Class & Chair Car catering rates" },
            { href: "/irctc-train-food-menu/duronto-express-food-menu-prices", label: "Duronto Express Food Menu", sub: "Sleeper Class, 3A, 2A & 1A catering charges" },
            { href: "/irctc-train-food-menu/ac-express-trains-food-menu-prices", label: "AC Express & Garib Rath Menu", sub: "Humsafar, AC Express & Garib Rath catering rates" },
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

        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          Zonal AC &amp; Sleeper Coach Menus
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
          {[
            { href: "/irctc-train-food-menu/north-zone-2ac-3ac-cc-food-menu", label: "North Zone AC Menu" },
            { href: "/irctc-train-food-menu/south-zone-2ac-3ac-cc-food-menu", label: "South Zone AC Menu" },
            { href: "/irctc-train-food-menu/east-zone-2ac-3ac-cc-food-menu", label: "East Zone AC Menu" },
            { href: "/irctc-train-food-menu/west-zone-2ac-3ac-cc-food-menu", label: "West Zone AC Menu" },
          ].map((z) => (
            <Link
              key={z.href}
              href={z.href}
              className="block rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center text-xs font-semibold text-slate-800 hover:bg-slate-100 hover:text-blue-700 transition-colors"
            >
              {z.label}
            </Link>
          ))}
        </div>

        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          Zonal Duronto Sleeper Menus
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { href: "/irctc-train-food-menu/north-zone-duronto-sleeper-food-menu", label: "North Duronto Sleeper" },
            { href: "/irctc-train-food-menu/south-zone-duronto-sleeper-food-menu", label: "South Duronto Sleeper" },
            { href: "/irctc-train-food-menu/east-zone-duronto-sleeper-food-menu", label: "East Duronto Sleeper" },
            { href: "/irctc-train-food-menu/west-zone-duronto-sleeper-food-menu", label: "West Duronto Sleeper" },
          ].map((z) => (
            <Link
              key={z.href}
              href={z.href}
              className="block rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center text-xs font-semibold text-slate-800 hover:bg-slate-100 hover:text-blue-700 transition-colors"
            >
              {z.label}
            </Link>
          ))}
        </div>
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
