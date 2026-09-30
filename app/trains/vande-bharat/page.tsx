import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getTrains } from "@/lib/trainCatalog";
import { TrainCatalogListClient } from "@/components/trains/TrainCatalogListClient";
import {
  Sparkles,
  ChevronRight,
  Train,
  ShieldCheck,
  Zap,
  MapPin,
  Coffee,
  Armchair,
  Timer,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Vande Bharat Express Trains 2026: List, Routes, Timings & Booking | LastBerth",
  description:
    "Complete list of 160+ Vande Bharat Express trains in India. Check routes, timetables, intermediate stops, Chair Car & Executive classes, catering menus, and book confirmed tickets on LastBerth.",
  alternates: { canonical: "/trains/vande-bharat" },
  openGraph: {
    title: "Vande Bharat Express Trains 2026: Routes, Timings & Booking",
    description:
      "Explore 160+ official Vande Bharat Express trains across India. Check schedules, halts, seat availability, and book confirmed tickets.",
    url: "/trains/vande-bharat",
    type: "website",
  },
};

const POPULAR_CORRIDORS = [
  "New Delhi ➔ Varanasi (22435/36)",
  "New Delhi ➔ Shri Mata Vaishno Devi Katra (22439/40)",
  "Mumbai Central ➔ Gandhinagar Capital (20901/02)",
  "MGR Chennai Central ➔ Mysuru (20607/08)",
  "Howrah ➔ New Jalpaiguri (22301/02)",
  "Howrah ➔ Puri (22895/96)",
  "Secunderabad ➔ Visakhapatnam (20833/34)",
  "Patna ➔ Howrah (22347/48)",
];

const FAQS = [
  {
    question: "What is the maximum operating speed of Vande Bharat Express?",
    answer:
      "Vande Bharat Express is designed to operate at speeds up to 160–180 km/h on reinforced tracks. On standard broad-gauge express routes, it operates at 130 km/h with rapid acceleration that cuts travel time by 20–35% compared to conventional expresses.",
  },
  {
    question: "What is the difference between Chair Car (CC) and Executive Class (EC)?",
    answer:
      "AC Chair Car (CC) features 3x2 seating with charging ports and pushback recline. Executive Class (EC) offers premium 2x2 seating with 180-degree revolving seats, wider legroom, and complimentary premium meals.",
  },
  {
    question: "Is onboard catering included in Vande Bharat ticket fares?",
    answer:
      "Passengers can opt in or out of catering during booking on IRCTC. If selected, meals are served directly at your seat with fresh regional menus curated by IRCTC.",
  },
  {
    question: "What are Vande Bharat Sleeper trains?",
    answer:
      "Vande Bharat Sleeper trains are long-distance overnight variants designed to replace traditional Rajdhani rakes. They feature 1A, 2A, and 3A berths with superior cushioning and smoother jerk-free couplers.",
  },
  {
    question: "How far in advance can I book Vande Bharat tickets?",
    answer:
      "Standard Advance Reservation Period (ARP) is 60 days before the journey date at 08:00 AM IST. Tatkal booking opens one day in advance at 10:00 AM for AC classes.",
  },
];

export default function VandeBharatTrainsPage() {
  const trains = getTrains("vande-bharat");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Vande Bharat Express Trains List 2026",
    numberOfItems: trains.length,
    itemListElement: trains.slice(0, 30).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Trip",
        name: t.trainName,
        identifier: t.trainNumber,
        description: `Vande Bharat Express from ${t.originStation.name} to ${t.destinationStation.name}`,
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
        {/* Breadcrumb */}
        <nav className="flex items-center text-xs sm:text-sm text-slate-500 font-medium" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-900 font-semibold truncate">Vande Bharat Express</span>
        </nav>

        {/* Hero */}
        <header className="rounded-3xl border border-blue-900/40 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300 backdrop-blur-xs border border-blue-400/30">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Flagship Semi-High Speed Network</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Vande Bharat Express Trains 2026
            </h1>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              India&apos;s indigenous semi-high speed train fleet connects major business, pilgrimage, and state capitals at up to 160 km/h. Browse all {trains.length} operational routes and book confirmed tickets.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Train className="h-4 w-4 text-blue-400" />
                {trains.length} Trains Listed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" />
                160 km/h Capable
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Live Availability & Charts
              </span>
            </div>
          </div>
          <div className="absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" aria-hidden="true" />
        </header>

        {/* Top Corridors */}
        <section aria-labelledby="corridors-heading" className="space-y-3">
          <h2 id="corridors-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-blue-600" />
            Top Vande Bharat Corridors
          </h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_CORRIDORS.map((c) => (
              <span key={c} className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-blue-400 hover:text-blue-600 transition-colors">
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1.5">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-blue-50 text-blue-600">
              <Timer className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Rapid Acceleration</h3>
            <p className="text-xs text-slate-500 leading-relaxed">0 to 100 km/h in 52 seconds — cuts journey times by up to 35%.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1.5">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-purple-50 text-purple-600">
              <Armchair className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">180° Rotating Seats</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Executive Class chairs rotate fully to face travel direction.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1.5">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-amber-50 text-amber-600">
              <Coffee className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Curated IRCTC Catering</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Opt-in hot meals served at your seat with regional menus.</p>
          </div>
        </div>

        {/* Train List */}
        <TrainCatalogListClient
          trains={trains}
          classFilters={["CC", "EC", "Sleeper"]}
          trainTypeName="Vande Bharat"
          searchPlaceholder="Search by train number, name, or city (e.g. 20171, Varanasi, Mumbai)..."
        />

        {/* FAQs */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Frequently Asked Questions about Vande Bharat Express
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
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
