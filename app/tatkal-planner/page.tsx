import type { Metadata } from "next";
import Link from "next/link";
import TatkalPlannerClient from "./TatkalPlannerClient";
import { getTatkalFaqs } from "@/lib/tatkalPlanner";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Tatkal Booking Date Calculator & Live Clock (2026) | LastBerth",
  description:
    "Calculate exact Tatkal booking dates and 10:00 AM (AC) & 11:00 AM (Non-AC) opening times. Live IST countdown clock, Tatkal charges calculator & speed hacks.",
  alternates: { canonical: "/tatkal-planner" },
  openGraph: {
    title: "Tatkal Booking Date Calculator & Live Clock (2026) | LastBerth",
    description:
      "Calculate exact Tatkal booking dates and 10:00 AM (AC) & 11:00 AM (Non-AC) opening times. Live IST countdown clock, Tatkal charges calculator & speed hacks.",
    url: "https://lastberth.com/tatkal-planner",
    siteName: "LastBerth",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tatkal Booking Date Calculator & Live Clock (2026) | LastBerth",
    description:
      "Calculate exact Tatkal booking dates and 10:00 AM (AC) & 11:00 AM (Non-AC) opening times. Live IST countdown clock, Tatkal charges calculator & speed hacks.",
  },
};

export default function TatkalPlannerPage() {
  const faqs = getTatkalFaqs();

  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Tatkal Booking Date Calculator & Live Countdown Clock",
    url: "https://lastberth.com/tatkal-planner",
    applicationCategory: "TravelApplication",
    operatingSystem: "All",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    description:
      "Free interactive tool to calculate exact Tatkal ticket opening dates and 10:00 AM (AC) & 11:00 AM (Non-AC) opening times with live atomic IST clock.",
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://lastberth.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Tatkal Planner",
        item: "https://lastberth.com/tatkal-planner",
      },
    ],
  };

  return (
    <div className="pb-12">
      {/* Structured Data Scripts */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Header & Introduction */}
      <header className="mb-7">
        <p className="text-sm font-semibold text-teal-700">Tatkal booking planner</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Find your Tatkal booking time
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Tell us when you are travelling and your train class. We’ll tell you exactly when Tatkal
          booking opens.
        </p>
      </header>

      {/* Main Interactive Tool Container */}
      <TatkalPlannerClient />

      {/* SEO & Knowledge Prose Section */}
      <article className="mt-16 space-y-8 border-t border-slate-200 pt-12 text-slate-700">
        <section>
          <h2 className="text-2xl font-bold text-slate-900">
            How Is the IRCTC Tatkal Booking Date Calculated?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Under Indian Railways commercial guidelines, <strong>Tatkal ticket booking opens exactly one day in advance</strong> of the train’s departure from its <em>originating station</em>, excluding the day of journey itself.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            For example, if you are boarding a train that begins its run from New Delhi on Friday, Tatkal tickets for all passengers across that rake open on <strong>Thursday</strong>.
          </p>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
            <strong>Critical Multi-Day Journey Rule:</strong> If your train departs its source station on Day 1 (Monday) and reaches your intermediate boarding station on Day 2 (Tuesday), Tatkal opens on <strong>Sunday</strong> (1 day before source departure), not Monday. Missing this origin offset is the #1 reason passengers miss their booking window.
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900">
            Official Tatkal Booking Timings: AC vs Non-AC Classes
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            To prevent severe server overloading on IRCTC, Indian Railways splits the Tatkal opening into two staggered time slots:
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                10:00:00 AM IST Opening
              </span>
              <h3 className="mt-1 text-lg font-bold text-slate-900">All AC Classes</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Applies to Executive Class (EC), AC 2-Tier (2A), AC 3-Tier (3A), AC 3 Economy (3E), and AC Chair Car (CC). First AC (1A) does not have Tatkal quota.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                11:00:00 AM IST Opening
              </span>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Non-AC Classes</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Applies to Sleeper Class (SL) and Second Sitting (2S). Payment gateways and Master List forms switch strictly at 11:00:00 AM IST.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900">
            The 10-Minute Master List Freeze Window
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            IRCTC enforces a security freeze on the <strong>Passenger Master List</strong> to curb bot scraping. During this window, you cannot add, edit, or delete saved passengers:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-slate-600">
            <li>
              <strong>AC Tatkal Freeze:</strong> 09:50 AM to 10:10 AM IST (Locked)
            </li>
            <li>
              <strong>Non-AC Tatkal Freeze:</strong> 10:50 AM to 11:10 AM IST (Locked)
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Always pre-save passenger details, berth preferences, and senior citizen info in your IRCTC profile at least 15 minutes before the respective opening time.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900">
            What to Do When Tatkal Sells Out in Seconds
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            High-demand trunk routes (such as Delhi to Patna, Mumbai to Goa, or Bangalore to Chennai) frequently exhaust their Tatkal quotas in under 90 seconds. If you miss the Tatkal window, you still have two guaranteed alternatives:
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="font-bold text-slate-900">
                1. Smart Split-Seat Routing via <Link href="/" className="text-blue-600 hover:underline">Finding Smart Seats</Link>
              </h4>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Direct origin-to-destination searches often show WL, but seats are frequently available for intermediate stretches on the same train. LastBerth automatically splits your journey into contiguous legs so you travel with confirmed berths without paying surge pricing.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="font-bold text-slate-900">
                2. Current Availability &amp; <Link href="/chart-vacancy" className="text-blue-600 hover:underline">Chart Vacancy</Link>
              </h4>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                After the first reservation chart is prepared (approx. 4 to 8 hours before departure), unbooked emergency quotas and cancelled berths go on sale as <strong>Current Available (CURR_AVBL)</strong> tickets at normal base fares. Track chart release times on <Link href="/chart-times" className="text-blue-600 hover:underline">Chart Times</Link>.
              </p>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
