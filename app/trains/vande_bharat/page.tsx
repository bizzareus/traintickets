import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getAllVandeBharatTrains } from "@/lib/vandeBharatTrains";
import { VandeBharatTrainsListClient } from "@/components/vande-bharat/VandeBharatTrainsListClient";
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
  alternates: {
    canonical: "/trains/vande_bharat",
  },
  openGraph: {
    title: "Vande Bharat Express Trains 2026: Routes, Timings & Booking",
    description:
      "Explore 160+ official Vande Bharat Express trains across India. Check schedules, halts, seat availability, and book confirmed tickets.",
    url: "/trains/vande_bharat",
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
      "Vande Bharat Express (Train 18) is designed to operate at speeds up to 160–180 km/h on reinforced tracks (such as the Delhi–Agra, Delhi–Bhopal, and Mumbai–Ahmedabad sections). On standard broad-gauge express routes, it operates at 130 km/h with rapid acceleration and deceleration that cuts travel time by 20% to 35% compared to conventional Shatabdi and Superfast expresses.",
  },
  {
    question: "What is the difference between Chair Car (CC) and Executive Class (EC)?",
    answer:
      "AC Chair Car (CC) features a comfortable 3x2 seating arrangement with charging ports, personal reading lights, and pushback recline. Executive Class (EC) offers premium 2x2 seating with wider legroom, enhanced plush upholstery, 180-degree revolving seats (which can rotate to face the direction of train travel or panoramic windows), and complimentary premium meals.",
  },
  {
    question: "Is onboard catering included in Vande Bharat ticket fares?",
    answer:
      "Passengers can opt in or opt out of catering services during booking on IRCTC. If selected, morning tea, breakfast, lunch, high tea, or dinner (depending on train timing and travel duration) are served directly at your seat with fresh, cyclic regional menus curated by IRCTC.",
  },
  {
    question: "Can I opt out of food on Vande Bharat to reduce ticket fare?",
    answer:
      "Yes. Indian Railways allows passengers to opt out of onboard catering at the time of ticket booking, which deducts catering charges from the total ticket fare. Note that food cannot be purchased on board on an ad-hoc basis if the opt-out option was chosen.",
  },
  {
    question: "What are Vande Bharat Sleeper trains?",
    answer:
      "Vande Bharat Sleeper trains are long-distance overnight variants of the Vande Bharat trainset designed to replace traditional Rajdhani rakes. They feature First AC (1A), AC 2-Tier (2A), and AC 3-Tier (3A) berths with superior cushioning, soundproof cabins, sensor-activated touchless washrooms, and smoother jerk-free couplers.",
  },
  {
    question: "How far in advance can I book Vande Bharat tickets?",
    answer:
      "Standard Advance Reservation Period (ARP) is 60 days before the journey date at 08:00 AM IST. In addition, Tatkal booking opens one day in advance at 10:00 AM for AC classes.",
  },
];

export default function VandeBharatTrainsPage() {
  const trains = getAllVandeBharatTrains();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Vande Bharat Express Trains List 2026",
    description:
      "Comprehensive directory of all 160+ operational Vande Bharat Express trains across Indian Railways.",
    numberOfItems: trains.length,
    itemListElement: trains.slice(0, 30).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Trip",
        name: t.trainName,
        identifier: t.trainNumber,
        description: `Vande Bharat Express from ${t.originStation.name} (${t.originStation.code}) to ${t.destinationStation.name} (${t.destinationStation.code})`,
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
            Trains
          </Link>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-900 font-semibold truncate">
            Vande Bharat Express
          </span>
        </nav>

        {/* ── Page Hero Header ── */}
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
              India&apos;s indigenous semi-high speed train fleet connects major business,
              pilgrimage, and state capitals at up to 160 km/h. Featuring aerodynamic
              cabins, revolving ergonomic seats, automated doors, bio-vacuum toilets,
              and panoramic windows. Browse all {trains.length} operational routes below
              and book confirmed tickets.
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

          {/* Decorative Glow */}
          <div
            className="absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute right-32 top-0 h-48 w-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none"
            aria-hidden="true"
          />
        </header>

        {/* ── Key Corridors Strip ── */}
        <section aria-labelledby="vande-bharat-corridors-heading" className="space-y-3">
          <h2
            id="vande-bharat-corridors-heading"
            className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"
          >
            <MapPin className="h-3.5 w-3.5 text-blue-600" />
            Top Vande Bharat Corridors
          </h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_CORRIDORS.map((corridor) => (
              <span
                key={corridor}
                className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {corridor}
              </span>
            ))}
          </div>
        </section>

        {/* ── Vande Bharat Key Features Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1.5">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-blue-50 text-blue-600">
              <Timer className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Rapid Acceleration</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Accelerates from 0 to 100 km/h in just 52 seconds, reducing city-to-city journey times by up to 35%.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1.5">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-purple-50 text-purple-600">
              <Armchair className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">180° Rotating Seats</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Executive Class (EC) chairs rotate 180 degrees to align with travel direction and wide panoramic windows.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1.5">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-amber-50 text-amber-600">
              <Coffee className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Curated IRCTC Catering</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Opt-in hot meals, breakfast, and high tea served at your seat, customized to regional culinary routes.
            </p>
          </div>
        </div>

        {/* ── Interactive Vande Bharat Trains List ── */}
        <VandeBharatTrainsListClient trains={trains} />

        {/* ── Comprehensive Guide & FAQs ── */}
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
