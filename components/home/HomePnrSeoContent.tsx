import Link from "next/link";

interface HomePnrFaq {
  q: string;
  a: string;
}

const PNR_FAQS: HomePnrFaq[] = [
  {
    q: "How does LastBerth find confirmed seats for a waitlisted PNR?",
    a: "When you enter your 10-digit PNR, we inspect live booking status for all passengers. If any passenger is on the waiting list (WL), our engine scans availability across all intermediate station quotas on that exact train. Railways often holds vacant seats for intermediate segments even when direct tickets are sold out. We connect these available segments into a contiguous itinerary so you can travel confirmed on the same train without switching trains.",
  },
  {
    q: "What happens if my ticket stays on the waiting list (WL) at chart preparation?",
    a: "If you hold an online e-ticket and it remains on the waiting list (WL) after final chart preparation (usually 4 hours before departure), Indian Railways automatically cancels it and refunds the fare to your bank account. You cannot board the train with a waitlisted e-ticket. Finding alternate confirmed seats or booking current availability is essential to guarantee your journey.",
  },
  {
    q: "Is it legal to book split tickets on the same train when my PNR is waitlisted?",
    a: "Yes, 100%. Indian Railways and IRCTC ticketing rules permit booking multiple consecutive legs for the same passenger on the same train. You board at your originating station and alight at your destination; you never need to deboard or change trains.",
  },
  {
    q: "What is the difference between GNWL, RLWL, and PQWL in PNR status?",
    a: "GNWL (General Waiting List) is issued from the train's originating station and has the highest confirmation rate as cancellations clear first. RLWL (Remote Location Waiting List) is for intermediate stations and clears only against local quota cancellations. PQWL (Pooled Quota Waiting List) is shared across smaller intermediate stations and has the lowest confirmation probability.",
  },
  {
    q: "When is the reservation chart prepared for my PNR?",
    a: "The first reservation chart is prepared roughly 4 hours before the train departs from its originating station (or at 8:00 PM the previous evening for morning departures). A second chart is prepared 30 to 50 minutes before train departure. Any remaining vacant berths are released as Current Availability (CURR_AVBL).",
  },
  {
    q: "Can I cancel my waitlisted PNR if I find confirmed seats on LastBerth?",
    a: "Yes. Waitlisted e-tickets can be cancelled online on IRCTC up until chart preparation with a minimal clerkage fee (₹60 per passenger). Once you secure confirmed seats through LastBerth's alternate seat finder, you can safely cancel your waitlisted ticket.",
  },
];

/**
 * SEO content and FAQs displayed under the homepage search when the "Search PNR"
 * tab is active. Explains PNR waitlist confirmation, intermediate quota scanning,
 * and chart preparation timing with FAQPage JSON-LD schema.
 */
export function HomePnrSeoContent() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PNR_FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="mt-4 border-t border-slate-200 pt-10">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Waitlisted PNR? How to confirm your seat & find alternate tickets
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Clear, practical answers to what happens when your IRCTC PNR is waitlisted,
          how our alternate seat engine finds available berths, and your options before
          chart preparation.
        </p>

        <div className="mt-8 space-y-8">
          {PNR_FAQS.map((f) => (
            <article key={f.q}>
              <h3 className="text-lg font-semibold text-slate-900">{f.q}</h3>
              <p className="mt-2 text-slate-600">{f.a}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 text-sm text-slate-600">
          See also:{" "}
          <Link href="/chart-times" className="text-blue-600 hover:underline">
            chart preparation times
          </Link>
          {", "}
          <Link href="/chart-vacancy" className="text-blue-600 hover:underline">
            IRCTC chart vacancy
          </Link>
          {", "}
          <Link href="/glossary" className="text-blue-600 hover:underline">
            railway glossary
          </Link>
          {", "}
          <Link href="/pnr-status" className="text-blue-600 hover:underline">
            PNR status enquiry
          </Link>
          {"."}
        </p>
      </div>
    </section>
  );
}
