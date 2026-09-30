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
