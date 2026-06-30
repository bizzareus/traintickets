import Link from "next/link";

/**
 * SEO content under the homepage search. Targets the highest-impression queries
 * from Search Console (current-availability timing, IRCTC monthly ticket limit,
 * app vs website for Tatkal, boarding-point change rules, WL/RAC meaning).
 * Plain, human answers + internal links, plus FAQPage JSON-LD for rich results.
 */

const FAQS: { q: string; a: string }[] = [
  {
    q: "When does current availability open in IRCTC?",
    a: "Current availability opens once the reservation chart is prepared, which is usually about four hours before the train leaves its originating station. A second chart is prepared closer to departure (often thirty minutes to a couple of hours before). During this window, berths that were never booked or were cancelled at the last minute are released at the normal fare, and anyone can book them with a real coach and berth. The exact time differs by train and boarding station.",
  },
  {
    q: "What does current availability (current booking) mean?",
    a: "Current booking is last-minute booking of seats that are still empty after the chart is prepared. Unlike a waiting-list ticket, a current-availability ticket is confirmed straight away with a coach and berth, at the regular fare. It is often the quickest way to get a confirmed seat close to departure.",
  },
  {
    q: "How many tickets can be booked on IRCTC in a month?",
    a: "A personal IRCTC account can book up to 12 tickets per month by default. If the account is Aadhaar-linked and at least one passenger in the booking is Aadhaar-verified, the limit goes up to 24 tickets per month. These limits are per user account and reset each calendar month.",
  },
  {
    q: "Is the IRCTC app or website faster for Tatkal? Mobile or laptop?",
    a: "Both the IRCTC Rail Connect app and the website talk to the same servers, so raw speed depends mostly on your internet connection and how quickly you fill in passenger details. A laptop on a stable broadband connection with a saved passenger master list and a ready payment method (UPI or a saved card) is very reliable; many users also find the mobile app quick on good 4G/5G. The real time saver is preparation: pre-save passengers, log in before the window, and have payment ready. AC Tatkal opens at 10 AM and sleeper at 11 AM, one day before the train starts from its origin.",
  },
  {
    q: "What are the IRCTC boarding point change rules?",
    a: "You can change your boarding station once, online, before the reservation chart is prepared (typically a few hours before the train departs its origin). It is free of cost, but once changed you cannot board from the original station, and no fare difference is refunded. Do it from the Booked Ticket History / My Bookings section well before chart preparation.",
  },
  {
    q: "What do WL and RAC mean in railway tickets?",
    a: "WL (Waiting List) means your ticket is in the queue and has no berth yet; if it is an e-ticket and still WL at chart preparation, it is cancelled and refunded automatically. RAC (Reservation Against Cancellation) lets you board and share a side-lower berth, and moves up to a full berth as confirmed passengers cancel. CNF means your seat or berth is confirmed.",
  },
];

export function HomeSeoContent() {
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
    <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="mt-4 border-t border-slate-200 pt-10">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Current availability, Tatkal & waiting-list tickets explained
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Quick, practical answers to the questions travellers ask most about
          IRCTC booking timings and confirming a waiting-list ticket.
        </p>

        <div className="mt-8 space-y-8">
          <article>
            <h3 className="text-lg font-semibold text-slate-900">
              When does current availability open in IRCTC?
            </h3>
            <p className="mt-2 text-slate-600">
              Current availability opens once the reservation chart is prepared,
              usually about <strong>four hours before the train leaves its
              originating station</strong>. A second chart follows closer to
              departure. In that window, unbooked and last-minute-cancelled
              berths are released at the normal fare and confirmed instantly with
              a real coach and berth. The exact time varies by train and
              boarding station, so check the{" "}
              <Link href="/chart-times" className="text-blue-600 hover:underline">
                chart preparation times
              </Link>{" "}
              for your train, or see live{" "}
              <Link href="/chart-vacancy" className="text-blue-600 hover:underline">
                IRCTC chart vacancy
              </Link>{" "}
              after charting.
            </p>
          </article>

          <article>
            <h3 className="text-lg font-semibold text-slate-900">
              How many tickets can you book on IRCTC per month?
            </h3>
            <p className="mt-2 text-slate-600">
              A personal IRCTC account can book up to <strong>12 tickets per
              month</strong>, or up to <strong>24 per month</strong> if the
              account is Aadhaar-linked and at least one passenger is
              Aadhaar-verified. The limit is per account and resets each calendar
              month.
            </p>
          </article>

          <article>
            <h3 className="text-lg font-semibold text-slate-900">
              IRCTC app vs website for Tatkal: mobile or laptop?
            </h3>
            <p className="mt-2 text-slate-600">
              Both use the same servers, so speed comes down to your connection
              and how fast you fill passenger details. A laptop on stable
              broadband with a saved passenger master list and ready payment is
              very reliable; the Rail Connect app is quick on good mobile data.
              The biggest edge is preparation: pre-save passengers, log in
              before the window, and keep UPI or a saved card ready.{" "}
              <strong>AC Tatkal opens at 10 AM and sleeper at 11 AM</strong>, one
              day before the train starts from its origin.
            </p>
          </article>

          <article>
            <h3 className="text-lg font-semibold text-slate-900">
              IRCTC boarding point change rules
            </h3>
            <p className="mt-2 text-slate-600">
              You can change your boarding station once, online, before the chart
              is prepared (typically a few hours before departure from origin).
              It is free, but after changing you cannot board from the original
              station and no fare difference is refunded. Do it from My Bookings
              well before chart preparation.
            </p>
          </article>

          <article>
            <h3 className="text-lg font-semibold text-slate-900">
              What do WL, RAC and CNF mean?
            </h3>
            <p className="mt-2 text-slate-600">
              <strong>WL</strong> (Waiting List) means no berth yet; a
              waiting-list e-ticket is auto-cancelled and refunded if it does not
              clear by charting. <strong>RAC</strong> lets you board with a
              shared side-lower berth and moves up as people cancel.{" "}
              <strong>CNF</strong> means confirmed. See the full{" "}
              <Link href="/glossary" className="text-blue-600 hover:underline">
                railway glossary
              </Link>{" "}
              (also in Hindi, Marathi, Tamil, Telugu, Bengali and Malayalam), or{" "}
              <Link href="/pnr-status" className="text-blue-600 hover:underline">
                check your PNR status
              </Link>{" "}
              for live confirmation chances.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
