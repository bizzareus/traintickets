import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getDiwaliSpecialTrains } from "@/lib/diwaliTrains";
import { DiwaliTrainsListClient } from "./DiwaliTrainsListClient";
import { Sparkles, ChevronRight, Train, ShieldCheck, Zap, Info } from "lucide-react";

export const metadata: Metadata = {
  title: "Diwali Special Trains 2026: List, Routes & Book Confirm Tickets | LastBerth",
  description:
    "Complete list of 63+ Diwali festival special trains launched by Indian Railways. Explore routes, schedules, stops, running days, and book confirmed tickets on LastBerth.",
  alternates: {
    canonical: "/trains/diwali",
  },
  openGraph: {
    title: "Diwali Special Trains 2026: List, Routes & Book Confirm Tickets",
    description:
      "Explore 63+ official festival special trains announced for Diwali 2026 by Indian Railways. Check timings, halts, and secure confirmed tickets.",
    url: "/trains/diwali",
    type: "website",
  },
};

export default function DiwaliSpecialTrainsPage() {
  const trains = getDiwaliSpecialTrains();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Diwali Festival Special Trains 2026",
    description:
      "Comprehensive directory of Diwali festival special trains launched across Indian Railways.",
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
          <span className="text-slate-500">Special Trains</span>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-900 font-semibold truncate">Diwali Special Trains</span>
        </nav>

        {/* ── Page Hero Header ── */}
        <header className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 p-6 sm:p-10 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300 backdrop-blur-xs border border-amber-300/30">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Diwali & Festival Season 2026</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Diwali Special Trains 2026
            </h1>

            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              Indian Railways has launched dedicated 0-series festival special trains across major trunk
              routes (Delhi, Mumbai, Kolkata, Patna, Gorakhpur, Banaras, Ayodhya, and Bengaluru) to ease the
              holiday travel rush. Browse all scheduled specials below and find confirmed seats.
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

        {/* ── Key Information Banner ── */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5 text-sm text-blue-900 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-950">How to book confirmed tickets on festival specials:</p>
            <p className="text-blue-800 text-xs sm:text-sm leading-relaxed">
              Festival specials usually carry a <strong>0-series train number</strong> (e.g. 05047). Click on
              <strong> “Book Confirm Tickets”</strong> on any train to instantly search seat availability,
              smart multi-leg alternatives, and reservation charts on LastBerth.
            </p>
          </div>
        </div>

        {/* ── Interactive Trains List ── */}
        <DiwaliTrainsListClient trains={trains} />

        {/* ── Comprehensive Guide & FAQs ── */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Frequently Asked Questions about Diwali Special Trains
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">What are 0-series Diwali special trains?</h3>
              <p className="leading-relaxed">
                0-series trains are seasonal festival services launched by zonal railways (NR, WR, ECR, NER, etc.)
                to accommodate heavy holiday passenger volume. They operate on planned schedules with AC,
                Sleeper, and unreserved coaches.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">When do bookings open for special trains?</h3>
              <p className="leading-relaxed">
                While regular trains follow the standard 60-day reservation window, supplementary 0-series festival
                specials often open 10 to 30 days prior to their departure once operational rakes are confirmed.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">What if a special train is waitlisted (WL / Regret)?</h3>
              <p className="leading-relaxed">
                Use LastBerth&apos;s Smart Seats algorithm to uncover split-berth availability on the same train or
                check post-charting Current Availability (CURR_AVBL) berths prepared 4 hours before departure.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">Do festival specials charge higher fares?</h3>
              <p className="leading-relaxed">
                Special trains operate under Train on Special Fare (TOSF) rules, carrying a nominal 10% (2S) to 30%
                (Sleeper/AC) surcharge over standard Mail/Express fares to cover festival operational costs.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <p>Data source: Official Indian Railways Festival Special Train Notifications via IndiaRailInfo.</p>
            <Link href="/" className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
              Back to Train Search ➔
            </Link>
          </div>
        </section>
      </main>

      {/* Structured Schema Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
