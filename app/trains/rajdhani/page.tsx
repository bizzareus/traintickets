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
  Bed,
  Star,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Rajdhani Express Trains 2026: List, Routes, Timings & Booking | LastBerth",
  description:
    "Complete list of Rajdhani Express trains in India. Check routes, timetables, 1A/2A/3A AC classes, and book confirmed tickets on LastBerth.",
  alternates: { canonical: "/trains/rajdhani" },
  openGraph: {
    title: "Rajdhani Express Trains 2026: Routes, Timings & Booking",
    description:
      "Explore all Rajdhani Express trains across India. Check schedules, halts, seat availability, and book confirmed tickets.",
    url: "/trains/rajdhani",
    type: "website",
  },
};

const POPULAR_CORRIDORS = [
  "New Delhi ➔ Howrah (12301/02)",
  "New Delhi ➔ Mumbai Central (12951/52)",
  "New Delhi ➔ Chennai Central (12433/34)",
  "New Delhi ➔ Thiruvananthapuram (12431/32)",
  "New Delhi ➔ Jammu Tawi (12425/26)",
  "New Delhi ➔ Dibrugarh (12423/24)",
  "New Delhi ➔ Bhubaneswar (12421/22)",
  "New Delhi ➔ Secunderabad (12723/24)",
];

const FAQS = [
  {
    question: "What classes are available on Rajdhani Express?",
    answer:
      "Rajdhani Express trains offer First AC (1A), AC 2-Tier (2A), and AC 3-Tier (3A) berths. All classes are fully air-conditioned with complimentary IRCTC meals included in the fare.",
  },
  {
    question: "Is food included in Rajdhani Express ticket fares?",
    answer:
      "Yes, catering charges are bundled into Rajdhani fares. Passengers receive dinner, breakfast, and sometimes lunch depending on the journey duration and timing.",
  },
  {
    question: "What makes Rajdhani Express special?",
    answer:
      "Rajdhani Express trains connect state capitals to New Delhi with the highest priority on the Indian Railways network. They run on dedicated paths with minimal halts, delivering overnight journeys with premium onboard service.",
  },
  {
    question: "What is the Advance Reservation Period for Rajdhani Express?",
    answer:
      "The standard ARP is 60 days from the date of journey at 08:00 AM IST. Tatkal quotas open one day before departure at 10:00 AM for AC classes.",
  },
];

export default function RajdhaniTrainsPage() {
  const trains = getTrains("rajdhani");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Rajdhani Express Trains List 2026",
    numberOfItems: trains.length,
    itemListElement: trains.slice(0, 20).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Trip",
        name: t.trainName,
        identifier: t.trainNumber,
        description: `Rajdhani Express from ${t.originStation.name} to ${t.destinationStation.name}`,
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
          <span className="text-slate-900 font-semibold truncate">Rajdhani Express</span>
        </nav>

        {/* Hero */}
        <header className="rounded-3xl border border-red-900/40 bg-gradient-to-br from-slate-950 via-red-950 to-rose-950 p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 backdrop-blur-xs border border-red-400/30">
              <Star className="h-3.5 w-3.5" />
              <span>Flagship Capital Express Network</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Rajdhani Express Trains 2026
            </h1>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              India&apos;s premium overnight capital-to-capital express trains. Fully AC with priority path, complimentary dining, and highest punctuality standards. Browse all {trains.length} Rajdhani trains and book confirmed tickets.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Train className="h-4 w-4 text-red-400" />
                {trains.length} Trains Listed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Bed className="h-4 w-4 text-amber-400" />
                1A / 2A / 3A Classes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Meals Included
              </span>
            </div>
          </div>
          <div className="absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-red-600/20 blur-3xl pointer-events-none" aria-hidden="true" />
        </header>

        {/* Top Corridors */}
        <section aria-labelledby="corridors-heading" className="space-y-3">
          <h2 id="corridors-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-red-600" />
            Popular Rajdhani Corridors
          </h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_CORRIDORS.map((c) => (
              <span key={c} className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-red-400 hover:text-red-600 transition-colors">
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* Train List */}
        <TrainCatalogListClient
          trains={trains}
          classFilters={["1A", "2A", "3A"]}
          trainTypeName="Rajdhani"
          searchPlaceholder="Search by train number, name, or city (e.g. 12301, Howrah, Mumbai)..."
        />

        {/* FAQs */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Frequently Asked Questions about Rajdhani Express
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
