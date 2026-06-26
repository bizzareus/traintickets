import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { SeatStatus } from "@/components/booking-v2/SeatStatus";

export const metadata: Metadata = {
  title: "IRCTC Chart Vacancy — Live Vacant Berths & Coach Map | LastBerth",
  description: "Check IRCTC chart vacancy: live vacant berths after the reservation chart is prepared, coach-wise, with a visual coach map. See free berths from your boarding station and book current-availability tickets.",
  alternates: {
    canonical: "/seat-status",
  },
  openGraph: {
    title: "IRCTC Chart Vacancy — Live Vacant Berths & Coach Map | LastBerth",
    description: "Live IRCTC chart vacancy: coach-wise vacant berths after charting, with a visual coach map.",
    url: "/seat-status",
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is IRCTC chart vacancy?",
    a: "Chart vacancy is the berths left empty after a train's reservation chart is prepared, from cancellations and unfilled quotas. Enter your train, date and boarding station to see the coach-wise vacant berths; they can be booked as current-availability tickets before departure.",
  },
  {
    q: "How do I check chart vacancy and vacant berths?",
    a: "After the reservation chart is prepared, select a coach to see its berth map with vacant, booked and partially-booked berths for your journey leg. The live coach map highlights exactly which berths are free so you can book a confirmed last-minute seat.",
  },
  {
    q: "What do the coach codes like S1, B2, A1 mean?",
    a: "The letter is the class — S is Sleeper, B is AC 3 Tier, A is AC 2 Tier, H is AC First, C is Chair Car, D is Second Sitting — and the number is the coach sequence in that class. So B2 is the second AC 3-Tier coach.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function SeatStatusPage() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl text-balance">
            IRCTC Chart Vacancy — Live Vacant Berths &amp; Coach Map
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Check live chart vacancy — coach-wise vacant berths after the
            reservation chart is prepared — on a visual coach map, and book any
            current-availability seat before departure.
          </p>
        </header>

        <section aria-label="Chart Vacancy Finder" className="rounded-2xl bg-white p-4 sm:p-8 shadow-sm border border-slate-200">
          <SeatStatus />
        </section>

        <article className="mt-16 prose prose-slate mx-auto text-gray-600">
          <h2>What is IRCTC chart vacancy?</h2>
          <p>
            Chart vacancy is the list of berths left empty after a train&apos;s
            reservation chart is prepared — from cancellations and unfilled quotas.
            Enter your train, journey date and boarding station above to see the
            coach-wise vacant berths on a live coach map, then book any vacant
            berth as a current-availability ticket before departure.
          </p>

          <h2>How to check chart vacancy and seat status?</h2>
          <p>
            Using our interactive coach map, you can easily find where your seat is located inside the train coach. 
            Simply enter your train number or name, select your date of journey, boarding station, and the coach number 
            (e.g., S1, B2, A1). If you want to check availability for a specific leg, you can also optionally enter your 
            destination station.
          </p>

          <h3>Find Vacant Berths</h3>
          <p>
            Before booking a ticket, it&apos;s often helpful to know if there are any fully or partially vacant seats available
            on your train. Our vacant berth finder highlights seats that are available for your selected journey leg, 
            giving you a better chance at securing a confirmed ticket.
          </p>
          
          <h3>Understanding the Coach Layout</h3>
          <p>
            The visual coach map organizes seats by bays and cabins, exactly as they appear in the real train.
            You can easily identify Lower (L), Middle (M), Upper (U), Side Lower (SL), and Side Upper (SU) berths.
          </p>

          <h2>Frequently asked questions</h2>
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}

          <p>
            Related:{" "}
            <Link href="/chart-times">train chart preparation times</Link> ·{" "}
            <Link href="/pnr-status">PNR status check</Link>
          </p>
        </article>
      </main>
    </div>
  );
}
