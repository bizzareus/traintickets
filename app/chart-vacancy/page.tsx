import type { Metadata } from "next";
import Link from "next/link";
import ChartTimesFinder from "../chart-times/ChartTimesFinder";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
const canonicalUrl = `${siteUrl}/chart-vacancy`;

export const metadata: Metadata = {
  title: "IRCTC Chart Vacancy — Live Train Chart & Vacant Berths After Charting | LastBerth",
  description:
    "Check IRCTC chart vacancy for any train: when the reservation chart is prepared, vacant berths after charting, and how to book current-availability tickets. Station-wise chart times + chart-prep alerts.",
  alternates: { canonical: "/chart-vacancy" },
  openGraph: {
    title: "IRCTC Chart Vacancy — Live Train Chart & Vacant Berths After Charting",
    description:
      "Train chart vacancy: chart preparation time, vacant berths after the chart is prepared, and current-availability booking.",
    type: "website",
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is IRCTC chart vacancy?",
    a: "Chart vacancy is the list of berths still empty after a train's reservation chart is prepared. These vacancies come from cancellations and unfilled quotas, and the vacant berths can be booked as current-availability tickets right up to about 30 minutes before departure.",
  },
  {
    q: "How do I check chart vacancy for a train?",
    a: "Enter your train name or number and journey date above. We show the station-wise reservation chart preparation times for that train, so you know exactly when the chart is ready — then you can check the live vacant berths and book any current-availability seat before departure.",
  },
  {
    q: "When is the train chart prepared?",
    a: "The first reservation chart is prepared a few hours before departure from the originating station — typically about 4 hours before, and now up to 8 hours before for many trains. A second chart is prepared closer to departure. Vacant berths appear once the chart is ready.",
  },
  {
    q: "Can I book a vacant berth after chart preparation?",
    a: "Yes. After charting, berths left vacant become current-availability (current booking) seats with a coach and berth number. This window opens about 4 hours before departure and closes around 30 minutes before, and is often the fastest way to get a confirmed last-minute seat.",
  },
  {
    q: "What is the difference between chart vacancy and current availability?",
    a: "Chart vacancy is the count of empty berths shown after the chart is prepared. Current availability is the bookable form of those vacant berths — a fully confirmed seat with coach and berth that you can purchase in the current-booking window before the train departs.",
  },
  {
    q: "Does a waitlisted ticket get a vacant berth at charting?",
    a: "It can. Waitlist progresses WL (Waiting List) → RAC (Reservation Against Cancellation) → Confirmed as berths free up. If your ticket is still waitlisted when the chart is prepared, the e-ticket is auto-cancelled and refunded — so vacant berths then open for current booking by others.",
  },
];

export default function ChartVacancyPage() {
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    name: "IRCTC Chart Vacancy — Live Train Chart & Vacant Berths After Charting",
    description:
      "Check IRCTC chart vacancy: chart preparation time, vacant berths after charting, and current-availability booking.",
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Chart Vacancy", item: canonicalUrl },
      ],
    },
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to check IRCTC chart vacancy",
    step: [
      {
        "@type": "HowToStep",
        name: "Find your train's chart time",
        text: "Enter the train name/number and journey date to see when its reservation chart is prepared at each station.",
      },
      {
        "@type": "HowToStep",
        name: "Wait for chart preparation",
        text: "The first chart is prepared a few hours before departure (about 4–8 hours). Vacant berths appear once the chart is ready.",
      },
      {
        "@type": "HowToStep",
        name: "Book a vacant berth",
        text: "Book any vacant berth as a current-availability ticket before the current-booking window closes ~30 minutes before departure.",
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-blue-600">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">Chart Vacancy</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          IRCTC Chart Vacancy — Live Train Chart &amp; Vacant Berths
        </h1>
        <p className="mt-2 text-slate-600">
          Find when a train&apos;s reservation chart is prepared, see vacant
          berths after charting, and book current-availability tickets. Enter your
          train and journey date to get station-wise chart times.
        </p>
      </header>

      <div className="mb-6">
        <ChartTimesFinder />
      </div>

      <div className="mb-8 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          Want the <strong>live vacant berths</strong> right now, or a confirmed
          last-minute seat?
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/seat-status"
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            Seat Status &amp; Coach Map
          </Link>
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Find a confirmed seat
          </Link>
        </div>
      </div>

      <article className="prose prose-slate max-w-none">
        <h2>What is IRCTC chart vacancy?</h2>
        <p>
          Chart vacancy is the list of berths still empty after a train&apos;s
          reservation chart is prepared. These vacancies arise from cancellations
          and unfilled quotas, and the vacant berths can be booked as
          current-availability tickets right up to about 30 minutes before
          departure.
        </p>

        <h2>How do I check chart vacancy?</h2>
        <p>
          Enter your train name or number and journey date above to see the
          station-wise{" "}
          <Link href="/chart-times" className="text-blue-600 hover:underline">
            chart preparation times
          </Link>{" "}
          for that train — so you know exactly when the chart is ready. Once it is
          prepared, check the live vacant berths via{" "}
          <Link href="/seat-status" className="text-blue-600 hover:underline">
            Seat Status &amp; Coach Map
          </Link>{" "}
          and book any current-availability seat before departure.
        </p>

        <h2>When is the train chart prepared?</h2>
        <p>
          The first reservation chart is prepared a few hours before departure
          from the originating station — typically about <strong>4 hours</strong>,
          and now up to <strong>8 hours</strong> for many trains. A second chart
          is prepared closer to departure. Vacant berths appear once the chart is
          ready.
        </p>

        <h2>How do I book a vacant berth after charting?</h2>
        <p>
          After charting, berths left vacant become{" "}
          <em>current-availability</em> (current booking) seats with a coach and
          berth number. The current-booking window opens about 4 hours before
          departure and closes around 30 minutes before — often the fastest way to
          get a confirmed last-minute seat. If a single direct berth isn&apos;t
          available, LastBerth can also{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            find confirmed seats across coaches and segments
          </Link>
          .
        </p>

        <h2>Frequently asked questions about chart vacancy</h2>
        {FAQS.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </article>

      <p className="mt-8 text-sm text-slate-500">
        Related:{" "}
        <Link href="/chart-times" className="font-medium text-blue-600 hover:underline">
          Train chart preparation times
        </Link>{" "}
        ·{" "}
        <Link href="/pnr-status" className="font-medium text-blue-600 hover:underline">
          PNR status check
        </Link>
      </p>
    </>
  );
}
