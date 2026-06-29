import type { Metadata } from "next";
import Link from "next/link";
import { SearchPnrPanel } from "@/components/booking-v2/SearchPnrPanel";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
const canonicalUrl = `${siteUrl}/pnr-status`;

export const metadata: Metadata = {
  title: "PNR Status Check — Live IRCTC PNR Enquiry & Confirmation Chances | LastBerth",
  description:
    "Check your IRCTC PNR status live with a 10-digit PNR number. See current booking status (CNF, RAC, WL), waiting list confirmation probability, coach/berth, and chart preparation timing.",
  alternates: { canonical: "/pnr-status" },
  openGraph: {
    title: "PNR Status Check — Live IRCTC PNR Enquiry & Confirmation Chances",
    description:
      "Check IRCTC PNR status live, see waiting list (WL) confirmation chances, RAC and CNF meaning, and when your reservation chart is prepared.",
    type: "website",
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is a PNR number?",
    a: "PNR (Passenger Name Record) is a unique 10-digit number printed on the top-left of every Indian Railways ticket. It links your journey details — train, date, class, boarding and destination stations, and each passenger's booking and current status — in the IRCTC reservation system.",
  },
  {
    q: "How do I check my PNR status?",
    a: "Enter your 10-digit PNR number in the box above and select Check PNR Status. We fetch the live status from Indian Railways and show each passenger's current status, coach and berth, the train schedule, and the confirmation probability for waitlisted passengers.",
  },
  {
    q: "What does WL mean in PNR status?",
    a: "WL full form is Waiting List. A waitlisted ticket has no berth yet; you move up as confirmed passengers cancel. Status progresses WL (Waiting List) → RAC (Reservation Against Cancellation) → Confirmed. A lower number like WL/1 confirms far more often than WL/10.",
  },
  {
    q: "What is the difference between CNF, RAC and WL?",
    a: "CNF means your seat or berth is confirmed with a coach and berth number. RAC (Reservation Against Cancellation) gives you a shared side-lower berth and allows boarding. WL (Waiting List) means no berth yet — it must reach RAC or CNF before the chart is prepared, or the e-ticket is auto-cancelled and refunded.",
  },
  {
    q: "What do GNWL, RLWL and PQWL mean?",
    a: "These are waiting-list types. GNWL (General) is issued from the originating station and confirms most often. RLWL (Remote Location) is for intermediate stations and clears mainly through local cancellations. PQWL (Pooled Quota) is shared across several short-distance stations and confirms the least.",
  },
  {
    q: "When is the PNR status final?",
    a: "Your PNR status is finalised when the reservation chart is prepared, usually about 4 hours before the train departs from its originating station, with a second chart closer to departure. After charting, a still-waitlisted e-ticket is automatically cancelled and refunded.",
  },
  {
    q: "What is current availability and current booking?",
    a: "A current available ticket is a fully confirmed seat with coach and berth, sold from leftover berths after charting. This current booking window opens about 4 hours before departure and closes around 30 minutes before, and is often the fastest way to get a confirmed last-minute seat.",
  },
];

export default function PnrStatusPage() {
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    name: "PNR Status Check — Live IRCTC PNR Enquiry & Confirmation Chances",
    description:
      "Check IRCTC PNR status live, view waiting list confirmation chances, and understand CNF, RAC and WL statuses.",
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "PNR Status", item: canonicalUrl },
      ],
    },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-blue-600">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">PNR Status</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          PNR Status Check — Live IRCTC PNR Enquiry
        </h1>
        <p className="mt-2 text-slate-600">
          Enter your 10-digit PNR number to check live Indian Railways booking
          status, see waiting list confirmation chances, and find out when your
          reservation chart is prepared.
        </p>
      </header>

      <div className="mb-8">
        <SearchPnrPanel />
      </div>

      <article className="prose prose-slate max-w-none prose-headings:scroll-mt-24">
        <h2>How do I check my PNR status?</h2>
        <p>
          Enter the 10-digit PNR number from the top-left of your ticket in the
          box above and select <strong>Check PNR Status</strong>. We pull the
          live status from Indian Railways and show each passenger&apos;s current
          status, coach and berth, the full train schedule, and a confirmation
          probability for any waitlisted passengers.
        </p>

        <h2>What does the PNR status tell you?</h2>
        <p>
          Your PNR (Passenger Name Record) status shows whether each passenger is
          Confirmed (CNF), in RAC, or still on the Waiting List (WL), along with
          the train number, date of journey, class, and boarding and destination
          stations. For waitlisted tickets it indicates how likely the seat is to
          confirm before the chart is prepared.
        </p>

        <h2>What do CNF, RAC and WL mean in PNR status?</h2>
        <p>
          The progression of a railway ticket is{" "}
          <strong>WL (Waiting List) → RAC (Reservation Against Cancellation) →
          Confirmed (CNF)</strong>. Each status describes how close you are to a
          guaranteed berth:
        </p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Full form</th>
                <th>What it means</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CNF</td>
                <td>Confirmed</td>
                <td>A berth is assigned; coach and berth number are allotted at charting.</td>
              </tr>
              <tr>
                <td>RAC</td>
                <td>Reservation Against Cancellation</td>
                <td>You may board and share a side-lower berth; often upgrades to CNF at the chart.</td>
              </tr>
              <tr>
                <td>WL</td>
                <td>Waiting List</td>
                <td>No berth yet. Must reach RAC/CNF before charting or the e-ticket is auto-cancelled.</td>
              </tr>
              <tr>
                <td>GNWL</td>
                <td>General Waiting List</td>
                <td>From the originating station; confirms most often.</td>
              </tr>
              <tr>
                <td>RLWL</td>
                <td>Remote Location Waiting List</td>
                <td>For intermediate stations; clears mainly through local cancellations.</td>
              </tr>
              <tr>
                <td>PQWL</td>
                <td>Pooled Quota Waiting List</td>
                <td>Shared across short-distance stations; confirms the least.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>When does the PNR status become final?</h2>
        <p>
          The status is finalised when the reservation chart is prepared, usually
          about <strong>4 hours before departure</strong> from the originating
          station, with a second chart closer to departure. A still-waitlisted
          e-ticket is automatically cancelled and refunded after charting. You can
          look up the exact{" "}
          <Link href="/chart-times" className="text-blue-600 hover:underline">
            chart preparation times for your train
          </Link>{" "}
          to know precisely when to expect the final status.
        </p>

        <h2>What if my ticket stays waitlisted?</h2>
        <p>
          If your ticket is unlikely to confirm, you still have options. A{" "}
          <em>current available ticket</em> is a fully confirmed seat sold from
          berths left vacant after charting — this current booking window opens
          about 4 hours before departure and closes around 30 minutes before.
          LastBerth can also find{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            alternate confirmed seats across coaches and segments
          </Link>{" "}
          when a single direct berth isn&apos;t available.
        </p>

        <h2>Frequently asked questions about PNR status</h2>
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
        <Link
          href="/blog/irctc-pnr-status-check-meaning-guide"
          className="font-medium text-blue-600 hover:underline"
        >
          IRCTC PNR status meaning guide
        </Link>
      </p>
    </>
  );
}
