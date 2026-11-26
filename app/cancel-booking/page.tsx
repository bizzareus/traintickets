import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CancelBookingClient } from "./CancelBookingClient";
import { buildOpenGraph } from "@/lib/seo/metadata";

const CANCEL_TITLE = "Cancel Train Booking";
const CANCEL_DESC =
  "Request cancellation for your LastBerth split-ticket reservation. Enter your booking reference and mobile number to review details and submit.";

export const metadata: Metadata = {
  title: CANCEL_TITLE,
  description: CANCEL_DESC,
  alternates: { canonical: "/cancel-booking" },
  openGraph: buildOpenGraph({
    title: `${CANCEL_TITLE} | LastBerth`,
    description:
      "Request cancellation for your LastBerth split-ticket reservation.",
    url: "/cancel-booking",
  }),
};

export default function CancelBookingPage() {
  return (
    <main className="min-h-[80vh] bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
          >
            ← Back to Search
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Cancel Train Booking
          </h1>
          <p className="mt-1.5 text-xs text-slate-600 sm:text-sm">
            Request cancellation for your LastBerth split-ticket reservation
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          }
        >
          <CancelBookingClient />
        </Suspense>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600 shadow-sm">
          <h2 className="mb-2 text-base font-bold text-slate-900">
            How Split-Ticket Cancellation Works
          </h2>
          <p>
            Enter your LastBerth booking reference (for example,{" "}
            <code>LB-XXXXX</code>) and the 10-digit mobile number used during
            reservation to inspect your split-journey legs and submit a
            cancellation request.
          </p>
          <p className="mt-2">
            Indian Railways cancellation charges depend on ticket class and how
            many hours remain before the train&apos;s scheduled departure. For
            chart alert subscription refunds, visit{" "}
            <Link
              href="/refund"
              className="font-medium text-blue-600 underline"
            >
              Request a Refund
            </Link>{" "}
            or email{" "}
            <a
              href="mailto:support@lastberth.com"
              className="font-medium text-blue-600 underline"
            >
              support@lastberth.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
