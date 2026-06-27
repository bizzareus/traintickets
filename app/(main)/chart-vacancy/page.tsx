import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { SeatStatus } from "@/components/booking-v2/SeatStatus";

export const metadata: Metadata = {
  title: "IRCTC Chart Vacancy: Indian Railways Train Chart & Vacant Berths | LastBerth",
  description: "IRCTC chart vacancy: Indian Railways train chart and vacant berth availability, coach-wise, on a visual coach map. See free berths from your boarding station and book current-availability tickets.",
  alternates: {
    canonical: "/chart-vacancy",
  },
  openGraph: {
    title: "IRCTC Chart Vacancy: Indian Railways Train Chart & Vacant Berths | LastBerth",
    description: "IRCTC chart vacancy: Indian Railways train chart and vacant berth availability, coach-wise, with a visual coach map.",
    url: "/chart-vacancy",
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "When does chart vacancy show up?",
    a: "Once the train's chart is prepared, which these days is about 4 hours before departure for the first chart, with a second chart made closer to the train leaving. Until then there's nothing to show; check back in that window and the freed-up berths will appear coach by coach.",
  },
  {
    q: "Can I still book a vacant berth after the chart is ready?",
    a: "Yes. Berths left empty after charting are sold as current-availability tickets, with a real coach and berth number. That window stays open until roughly 30 minutes before departure, so a vacant berth here is often the quickest route to a confirmed last-minute seat.",
  },
  {
    q: "What do coach codes like S1, B2 or A1 mean?",
    a: "The letter is the class and the number is its order in the train. S is Sleeper, B is AC 3-tier, A is AC 2-tier, H is AC First, C is Chair Car, D is Second Sitting, so B2 is the second AC 3-tier coach from that class's first one.",
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

export default function ChartVacancyPage() {
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
            IRCTC Chart Vacancy
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Indian Railways train chart &amp; vacant berth availability
          </p>
        </header>

        <section aria-label="Chart Vacancy Finder">
          <SeatStatus />
        </section>

        <article className="mt-16 prose prose-slate mx-auto text-gray-600">
          <h2>What is IRCTC chart vacancy?</h2>
          <p>
            A few hours before a train departs, Railways freezes the final
            passenger list. That is the reservation chart, and chart vacancy is
            whatever is still empty once it is drawn up: berths freed by
            cancellations, plus quota seats nobody booked. Those go back on sale as
            current-availability tickets, sometimes right up to half an hour before
            departure. Put in your train, date and boarding point above and the
            page shows how many berths are open in each coach.
          </p>

          <h2>How do I check chart vacancy for my train?</h2>
          <p>
            Start with the train (number or name, either works), then the travel
            date and the station you&apos;re boarding from. Open a coach such as S4
            or B2 to see its berth map. Travelling only part of the route? Add your
            destination and the map narrows to berths that are free on just that
            leg, which is where a lot of otherwise-hidden seats turn up.
          </p>

          <h3>Spotting a berth you can actually book</h3>
          <p>
            A fully empty berth is the easy case. The ones people miss are
            part-booked berths: a seat taken only between two later stations that
            sits free for your stretch. The map shows both, so even when the
            booking page flashes &ldquo;regret&rdquo; you can often find a berth
            that&apos;s confirmed end-to-end for your journey.
          </p>

          <h3>Reading the coach map</h3>
          <p>
            Each bay mirrors the real coach: Lower (L), Middle (M) and Upper (U)
            run down the main side, with Side Lower (SL) and Side Upper (SU) along
            the aisle. It pays to glance at this before booking, since a side-upper
            is a rough draw for an overnight trip and the map tells you exactly what
            you&apos;re getting.
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
