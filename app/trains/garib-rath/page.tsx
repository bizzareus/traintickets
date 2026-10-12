import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getTrains } from "@/lib/trainCatalog";
import { TrainCatalogListClient } from "@/components/trains/TrainCatalogListClient";
import {
  ChevronRight,
  Train,
  MapPin,
  ShieldCheck,
  Wallet,
  Bed,
} from "lucide-react";

export const metadata: Metadata = {
  title:
    "Garib Rath Express Trains 2026: List, Routes, Timings & Booking | LastBerth",
  description:
    "Complete list of Garib Rath Express trains in India. Check routes, timetables, affordable AC 3-Tier classes, and book confirmed tickets on LastBerth.",
  alternates: { canonical: "/trains/garib-rath" },
  openGraph: {
    title: "Garib Rath Express Trains 2026: Routes, Timings & Booking",
    description:
      "Explore all Garib Rath Express trains across India. Check schedules, halts, affordable AC seat availability, and book confirmed tickets.",
    url: "/trains/garib-rath",
    type: "website",
  },
};

const POPULAR_CORRIDORS = [
  "Pune ➔ Nagpur (12113/14)",
  "Lokmanya Tilak ➔ Trivandrum (12201/02)",
  "Jabalpur ➔ Hazrat Nizamuddin (12187/88)",
  "Saharsa ➔ Amritsar (12204)",
  "Jammu Tawi ➔ New Delhi (12207/08)",
  "Kathgodam ➔ Delhi (12208)",
];

const FAQS = [
  {
    question: "What classes are available on Garib Rath Express?",
    answer:
      "Garib Rath Express primarily offers AC 3-Tier (3A) berths at subsidised fares — no non-AC coaches. The lower fare structure makes it the most budget-friendly AC overnight train in India.",
  },
  {
    question: "Is food included in Garib Rath Express fares?",
    answer:
      "No, catering charges are not included in Garib Rath fares. Passengers can purchase food from pantry car or IRCTC e-catering services on supported routes.",
  },
  {
    question: "What is the difference between Garib Rath and Rajdhani Express?",
    answer:
      "Garib Rath offers AC 3-Tier class at a significantly lower price point without complimentary meals. Rajdhani offers 1A, 2A, and 3A with IRCTC meals bundled into fares and a higher priority path.",
  },
  {
    question: "Can I book Tatkal tickets on Garib Rath?",
    answer:
      "Yes, Tatkal quota is available on Garib Rath Express trains. Tatkal booking for AC classes opens one day before the journey date at 10:00 AM IST.",
  },
];

export default function GaribRathTrainsPage() {
  const trains = getTrains("garib-rath");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Garib Rath Express Trains List 2026",
    numberOfItems: trains.length,
    itemListElement: trains.slice(0, 20).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Trip",
        name: t.trainName,
        identifier: t.trainNumber,
        description: `Garib Rath Express from ${t.originStation.name} to ${t.destinationStation.name}`,
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
            Garib Rath Express
          </span>
        </nav>

        {/* Hero */}
        <header className="relative overflow-hidden rounded-3xl border border-green-900/40 bg-gradient-to-br from-slate-950 via-green-950 to-emerald-950 p-6 text-white shadow-xl sm:p-10">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="backdrop-blur-xs inline-flex items-center gap-2 rounded-full border border-green-400/30 bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300">
              <Wallet className="h-3.5 w-3.5" />
              <span>Budget AC Overnight Express</span>
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Garib Rath Express Trains 2026
            </h1>
            <p className="text-sm leading-relaxed text-slate-200 sm:text-base">
              India&apos;s affordable AC overnight express trains — fully
              air-conditioned 3-Tier berths at subsidised fares. Browse all{" "}
              {trains.length} Garib Rath trains and book confirmed tickets.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Train className="h-4 w-4 text-green-400" />
                {trains.length} Trains Listed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Bed className="h-4 w-4 text-amber-400" />
                3A Fully AC
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Budget-Friendly Fares
              </span>
            </div>
          </div>
          <div
            className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-green-600/20 blur-3xl"
            aria-hidden="true"
          />
        </header>

        {/* Top Corridors */}
        <section aria-labelledby="corridors-heading" className="space-y-3">
          <h2
            id="corridors-heading"
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            <MapPin className="h-3.5 w-3.5 text-green-600" />
            Popular Garib Rath Corridors
          </h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_CORRIDORS.map((c) => (
              <span
                key={c}
                className="shadow-2xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-green-400 hover:text-green-600"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* Train List */}
        <TrainCatalogListClient
          trains={trains}
          classFilters={["3A", "2A"]}
          trainTypeName="Garib Rath"
          searchPlaceholder="Search by train number, name, or city (e.g. 12113, Pune, Jammu)..."
        />

        {/* FAQs */}
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Frequently Asked Questions about Garib Rath Express
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
