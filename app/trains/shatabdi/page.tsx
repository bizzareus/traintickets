import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getTrains } from "@/lib/trainCatalog";
import { TrainCatalogListClient } from "@/components/trains/TrainCatalogListClient";
import {
  ChevronRight,
  Train,
  MapPin,
  Zap,
  ShieldCheck,
  Clock,
} from "lucide-react";

export const metadata: Metadata = {
  title:
    "Shatabdi Express Trains 2026: List, Routes, Timings & Booking | LastBerth",
  description:
    "Complete list of Shatabdi & Jan Shatabdi Express trains in India. Check routes, timetables, Chair Car & Executive classes, and book confirmed tickets on LastBerth.",
  alternates: { canonical: "/trains/shatabdi" },
  openGraph: {
    title: "Shatabdi Express Trains 2026: Routes, Timings & Booking",
    description:
      "Explore all Shatabdi Express trains across India. Check schedules, halts, seat availability, and book confirmed tickets.",
    url: "/trains/shatabdi",
    type: "website",
  },
};

const POPULAR_CORRIDORS = [
  "New Delhi ➔ Bhopal (12001/02)",
  "New Delhi ➔ Amritsar (12013/14)",
  "New Delhi ➔ Ajmer (12015/16)",
  "New Delhi ➔ Chandigarh (12045/46)",
  "Mumbai ➔ Pune (12026)",
  "Chennai ➔ Mysuru (12007/08)",
  "Howrah ➔ Ranchi (12022)",
  "Guwahati ➔ Dibrugarh (12235/36)",
];

const FAQS = [
  {
    question: "What classes are available on Shatabdi Express?",
    answer:
      "Shatabdi Express trains offer AC Chair Car (CC) and Executive Chair Car (EC) classes. All seats are fully air-conditioned with complimentary meals included in the fare.",
  },
  {
    question: "Is food included in Shatabdi Express ticket fares?",
    answer:
      "Yes, IRCTC catering charges are bundled into Shatabdi fares. Passengers receive breakfast, lunch, or dinner based on the train timing and journey duration.",
  },
  {
    question: "What is the difference between Shatabdi and Jan Shatabdi?",
    answer:
      "Jan Shatabdi Express has both AC and non-AC coaches, making it more affordable. Standard Shatabdi runs are fully AC with premium catering, while Jan Shatabdi offers Second Sitting (2S) and Sleeper (SL) options without catering.",
  },
  {
    question: "What is the maximum speed of Shatabdi Express?",
    answer:
      "Shatabdi Express trains are authorised to run at speeds up to 130–150 km/h on upgraded tracks, making them among the fastest conventional trains in India on their respective corridors.",
  },
];

export default function ShatabdiTrainsPage() {
  const trains = getTrains("shatabdi");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Shatabdi Express Trains List 2026",
    numberOfItems: trains.length,
    itemListElement: trains.slice(0, 20).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Trip",
        name: t.trainName,
        identifier: t.trainNumber,
        description: `Shatabdi Express from ${t.originStation.name} to ${t.destinationStation.name}`,
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
        {/* Breadcrumb */}
        <nav
          className="flex items-center text-xs font-medium text-slate-500 sm:text-sm"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="transition-colors hover:text-blue-600">
            Home
          </Link>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-semibold text-slate-900">
            Shatabdi Express
          </span>
        </nav>

        {/* Hero */}
        <header className="relative overflow-hidden rounded-3xl border border-orange-900/40 bg-gradient-to-br from-slate-950 via-orange-950 to-amber-950 p-6 text-white shadow-xl sm:p-10">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="backdrop-blur-xs inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-300">
              <Zap className="h-3.5 w-3.5" />
              <span>Premium Day Express Network</span>
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Shatabdi Express Trains 2026
            </h1>
            <p className="text-sm leading-relaxed text-slate-200 sm:text-base">
              India&apos;s iconic same-day intercity express trains connecting
              major metros and state capitals. Fully AC with complimentary IRCTC
              catering. Browse all {trains.length} trains and book confirmed
              tickets.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Train className="h-4 w-4 text-orange-400" />
                {trains.length} Trains Listed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-amber-400" />
                Same-Day Returns
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Meals Included
              </span>
            </div>
          </div>
          <div
            className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-orange-600/20 blur-3xl"
            aria-hidden="true"
          />
        </header>

        {/* Top Corridors */}
        <section aria-labelledby="corridors-heading" className="space-y-3">
          <h2
            id="corridors-heading"
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            <MapPin className="h-3.5 w-3.5 text-orange-600" />
            Popular Shatabdi Corridors
          </h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_CORRIDORS.map((c) => (
              <span
                key={c}
                className="shadow-2xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-orange-400 hover:text-orange-600"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* Train List */}
        <TrainCatalogListClient
          trains={trains}
          classFilters={["CC", "EC"]}
          trainTypeName="Shatabdi"
          searchPlaceholder="Search by train number, name, or city (e.g. 12001, Bhopal, Amritsar)..."
        />

        {/* FAQs */}
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Frequently Asked Questions about Shatabdi Express
          </h2>
          <div className="grid grid-cols-1 gap-6 text-sm text-slate-600 md:grid-cols-2">
            {FAQS.map((faq) => (
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
