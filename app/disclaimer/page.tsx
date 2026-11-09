import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Disclaimer | LastBerth",
  description:
    "Learn about LastBerth's role as a train meta search engine and the accuracy of its railway data.",
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Disclaimer</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Disclaimer
        </h1>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-600">
          <p className="text-sm text-slate-500">
            Last updated: October 13, 2026
          </p>

          <h2 className="pt-2 text-xl font-bold text-slate-900">
            1. Independent Service
          </h2>
          <p>
            <strong>LastBerth</strong> is a meta search engine for Indian
            Railways. We do not sell or book train tickets — when you pick a
            route, you are taken to IRCTC, where your booking is made and paid
            for under IRCTC&apos;s own terms. LastBerth is not the official
            website of IRCTC, Indian Railways, CRIS, or the Ministry of
            Railways.
          </p>
          <p>
            The official Indian Railways website can be found at{" "}
            <a
              href="https://indianrail.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              indianrail.gov.in
            </a>{" "}
            and IRCTC at{" "}
            <a
              href="https://www.irctc.co.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              irctc.co.in
            </a>
            .
          </p>

          <h2 className="pt-2 text-xl font-bold text-slate-900">
            2. Accuracy of Information
          </h2>
          <p>
            All information provided on LastBerth—including train schedules,
            seat availability insights, chart vacancy tools, refund rules, and
            catering menus—is compiled for general guidance and informational
            purposes only. While we make every effort to keep data accurate and
            updated, railway schedules, quotas, and fare structures are subject
            to change by official authorities without notice.
          </p>

          <h2 className="pt-2 text-xl font-bold text-slate-900">
            3. Bookings and Payments
          </h2>
          <p>
            LastBerth does not book train tickets or accept ticket-booking
            requests. Bookings are completed by you directly on IRCTC after
            LastBerth shows you available options. Payments you make to
            LastBerth are only for LastBerth&apos;s own services (such as seat-alert
            subscriptions), and never for a train ticket. For tickets bought
            through another provider, contact that provider about
            cancellations or refunds.
          </p>

          <h2 className="pt-2 text-xl font-bold text-slate-900">
            4. Limitation of Liability
          </h2>
          <p>
            Under no circumstances shall LastBerth or its operators be liable
            for any direct, indirect, incidental, or consequential loss or
            damage arising out of reliance on the information, tools, or content
            provided on this website.
          </p>
        </div>
      </div>
    </div>
  );
}
