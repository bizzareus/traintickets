import Link from "next/link";
import { Header } from "@/components/Header";
import {
  type FestivalKey,
  FESTIVALS_MAP,
  getSpecialTrainsForFestival,
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
  MapPin,
} from "lucide-react";

type Props = {
  festivalKey: FestivalKey;
};

export function FestivalSpecialTrainsPage({ festivalKey }: Props) {
  const cfg = FESTIVALS_MAP[festivalKey];
  const trains = getSpecialTrainsForFestival(festivalKey);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: cfg.title,
    description: cfg.description,
    numberOfItems: trains.length,
    itemListElement: trains.slice(0, 30).map((t, idx) => ({
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
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-slate-900 antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10 sm:px-6 lg:px-8 space-y-8">
        {/* ── Breadcrumb ── */}
        <nav
          className="flex items-center text-xs sm:text-sm text-slate-500 font-medium"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
          <Link
            href="/special-trains"
            className="hover:text-blue-600 transition-colors"
          >
            Special Trains
          </Link>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-900 font-semibold truncate">
            {cfg.title}
          </span>
        </nav>

        {/* ── Page Hero Header ── */}
        <header
          className={`rounded-3xl border border-slate-700/30 bg-gradient-to-br ${cfg.accentColor.gradient} p-6 sm:p-10 text-white shadow-lg relative overflow-hidden`}
        >
          <div className="relative z-10 max-w-3xl space-y-4">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-xs border ${cfg.accentColor.badgeBg}`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{cfg.tagline}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              {cfg.title}
            </h1>

            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              {cfg.description}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Train className="h-4 w-4 text-amber-400" />
                {trains.length} Special Trains Listed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-emerald-400" />
                Active Booking Windows
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                Confirmed Seat Assistance
              </span>
            </div>
          </div>

          {/* Decorative Background Glow */}
          <div
            className="absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute right-32 top-0 h-48 w-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none"
            aria-hidden="true"
          />
        </header>

        {/* ── High-Demand Key Corridors ── */}
        {cfg.keyCorridors.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              Popular {cfg.shortTitle} Corridors
            </h2>
            <div className="flex flex-wrap gap-2">
              {cfg.keyCorridors.map((c) => (
                <span
                  key={c}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Key Information Banner ── */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5 text-sm text-blue-900 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-950">
              How to book confirmed tickets on {cfg.shortTitle}:
            </p>
            <p className="text-blue-800 text-xs sm:text-sm leading-relaxed">
              Festival specials usually carry a <strong>0-series train number</strong> (e.g. {trains[0]?.trainNumber || "05047"}). Click on
              <strong> “Book Confirm Tickets”</strong> on any train to instantly search seat availability,
              smart multi-leg alternatives, and reservation charts on LastBerth.
            </p>
          </div>
        </div>

        {/* ── Festival Navigation Tabs ── */}
        <FestivalNavTabs currentKey={festivalKey} />

        {/* ── Interactive Trains List ── */}
        <SpecialTrainsListClient
          trains={trains}
          festivalKey={festivalKey}
          festivalTitle={cfg.shortTitle}
        />

        {/* ── Comprehensive Guide & FAQs ── */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Frequently Asked Questions about {cfg.title}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
            {cfg.faqs.map((faq) => (
              <div key={faq.question} className="space-y-2">
                <h3 className="font-semibold text-slate-900">{faq.question}</h3>
                <p className="leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
