import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import {
  getAllSpecialTrains,
  getSpecialTrainsForFestival,
  FESTIVALS_MAP,
} from "@/lib/specialTrains";
import { SpecialTrainsListClient } from "@/components/special-trains/SpecialTrainsListClient";
import { FestivalNavTabs } from "@/components/special-trains/FestivalNavTabs";
import {
  Sparkles,
  ChevronRight,
  Train,
  ShieldCheck,
  Zap,
  Info,
  ArrowRight,
  Calendar,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Special Trains 2026: List, Routes & Book Confirm Tickets | LastBerth",
  description:
    "Explore the complete directory of official festival special trains (Diwali, Chhath Puja, Dusshera, Durga Puja) launched by Indian Railways. Check schedules, stops, seat availability, and book confirmed tickets on LastBerth.",
  alternates: {
    canonical: "/special-trains",
  },
  openGraph: {
    title: "Special Trains 2026: Festival Routes & Confirm Tickets",
    description:
      "Explore 100+ festival special trains announced by Indian Railways for Diwali, Chhath Puja, Dusshera, and Durga Puja 2026. Real-time availability and smart split booking on LastBerth.",
    url: "/special-trains",
    type: "website",
  },
};

export default function SpecialTrainsHubPage() {
  const allTrains = getAllSpecialTrains();
  const diwaliTrains = getSpecialTrainsForFestival("diwali");
  const chhathTrains = getSpecialTrainsForFestival("chhath");
  const dussheraTrains = getSpecialTrainsForFestival("dusshera");
  const pujaTrains = getSpecialTrainsForFestival("puja");

  const festivalCards = [
    {
      cfg: FESTIVALS_MAP.diwali,
      count: diwaliTrains.length,
      gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
      borderColor: "border-amber-200 hover:border-amber-400",
      accent: "text-amber-700 bg-amber-50",
      datesText: "Nov 4 – Nov 8, 2026",
    },
    {
      cfg: FESTIVALS_MAP.chhath,
      count: chhathTrains.length,
      gradient: "from-orange-500/10 via-orange-500/5 to-transparent",
      borderColor: "border-orange-200 hover:border-orange-400",
      accent: "text-orange-700 bg-orange-50",
      datesText: "Nov 12 – Nov 17, 2026",
    },
    {
      cfg: FESTIVALS_MAP.dusshera,
      count: dussheraTrains.length,
      gradient: "from-purple-500/10 via-purple-500/5 to-transparent",
      borderColor: "border-purple-200 hover:border-purple-400",
      accent: "text-purple-700 bg-purple-50",
      datesText: "Oct 16 – Oct 20, 2026",
    },
    {
      cfg: FESTIVALS_MAP.puja,
      count: pujaTrains.length,
      gradient: "from-rose-500/10 via-rose-500/5 to-transparent",
      borderColor: "border-rose-200 hover:border-rose-400",
      accent: "text-rose-700 bg-rose-50",
      datesText: "Oct 16 – Oct 21, 2026",
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Indian Railways Festival Special Trains 2026",
    description:
      "Directory of special festival trains operating across Indian Railways for Diwali, Chhath Puja, Dusshera, and Durga Puja.",
    numberOfItems: allTrains.length,
    itemListElement: allTrains.slice(0, 30).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Trip",
        name: t.trainName,
        identifier: t.trainNumber,
        description: `Festival Special train from ${t.fromStation.name} (${t.fromStation.code}) to ${t.toStation.name} (${t.toStation.code})`,
      },
    })),
  };

  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-50/50 text-slate-900 antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {/* ── Breadcrumb ── */}
        <nav
          className="flex items-center text-xs font-medium text-slate-500 sm:text-sm"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="transition-colors hover:text-blue-600">
            Home
          </Link>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-semibold text-slate-900">
            Special Trains 2026
          </span>
        </nav>

        {/* ── Page Hero Header ── */}
        <header className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 p-6 text-white shadow-lg sm:p-10">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="backdrop-blur-xs inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Autumn & Festive Season 2026</span>
            </div>

            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Indian Railways Special Trains 2026
            </h1>

            <p className="text-sm leading-relaxed text-slate-200 sm:text-base">
              Every festive season, Indian Railways introduces dedicated
              0-series Trains on Demand (TOD) to meet surge passenger demand
              across Diwali, Chhath Puja, Dusshera, and Durga Puja. Select a
              festival category below or search across all {allTrains.length}{" "}
              scheduled special trains.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Train className="h-4 w-4 text-amber-400" />
                {allTrains.length} Total Specials Listed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-emerald-400" />
                Live Availability Sync
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                Smart Confirmed Seats
              </span>
            </div>
          </div>

          <div
            className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-32 top-0 h-48 w-48 rounded-full bg-indigo-500/20 blur-2xl"
            aria-hidden="true"
          />
        </header>

        {/* ── Festival Categories Cards ── */}
        <section
          aria-labelledby="festival-categories-heading"
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2
              id="festival-categories-heading"
              className="text-lg font-bold text-slate-900 sm:text-xl"
            >
              Browse Specials by Festival
            </h2>
            <span className="text-xs font-medium text-slate-500">
              4 Official Categories
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {festivalCards.map((card) => (
              <Link
                key={card.cfg.key}
                href={card.cfg.canonicalPath}
                className={`shadow-xs group rounded-2xl border bg-white p-5 transition-all duration-200 hover:shadow-md ${card.borderColor} flex flex-col justify-between`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-3xl"
                      role="img"
                      aria-label={card.cfg.title}
                    >
                      {card.cfg.iconEmoji}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${card.accent}`}
                    >
                      {card.count} Trains
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                      {card.cfg.title}
                    </h3>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                      {card.datesText}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-blue-600 group-hover:text-blue-700">
                  <span>View Trains</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Key Information Callout ── */}
        <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 sm:p-5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-950">
              How to find confirmed tickets on festival specials:
            </p>
            <p className="text-xs leading-relaxed text-blue-800 sm:text-sm">
              Festival specials typically use <strong>0-series numbers</strong>{" "}
              (such as 01079 or 05047). Click on{" "}
              <strong>“Book Confirm Tickets”</strong> for any train to instantly
              check real-time availability, split-journey options, and
              reservation charts on LastBerth.
            </p>
          </div>
        </div>

        {/* ── Festival Navigation Tabs ── */}
        <FestivalNavTabs currentKey="all" />

        {/* ── Full Interactive Trains List ── */}
        <SpecialTrainsListClient
          trains={allTrains}
          festivalTitle="Festival Special"
        />

        {/* ── Comprehensive Guide & FAQs ── */}
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Frequently Asked Questions about Festival Special Trains
          </h2>

          <div className="grid grid-cols-1 gap-6 text-sm text-slate-600 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">
                What are 0-series festival special trains?
              </h3>
              <p className="leading-relaxed">
                0-series trains are seasonal festival services launched by zonal
                railways (NR, CR, WR, ECR, NER, etc.) to handle surge holiday
                passenger volume. They operate on planned schedules with AC,
                Sleeper, and unreserved coaches.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">
                When do bookings open for special trains?
              </h3>
              <p className="leading-relaxed">
                Unlike regular trains which open 60 days in advance, 0-series
                festival specials often open 10 to 30 days prior to their first
                departure once rake utilization and timings are finalized.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">
                What are TOSF fares on special trains?
              </h3>
              <p className="leading-relaxed">
                Most festival specials operate under Train on Special Fare
                (TOSF) rules, carrying a flat 10% (Second Class 2S) or 30%
                (Sleeper & AC) festive supplementary surcharge to fund
                additional operational rakes.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">
                How do I get a confirmed ticket if trains show Regret / WL?
              </h3>
              <p className="leading-relaxed">
                Use LastBerth&apos;s Smart Seats feature on the home page. Even
                when direct end-to-end booking shows Regret, our algorithm finds
                confirmed sub-leg tickets within the same train or adjacent
                connecting stations.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
