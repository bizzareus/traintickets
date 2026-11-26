import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RefundClient } from "./RefundClient";
import { buildOpenGraph } from "@/lib/seo/metadata";

const REFUND_TITLE = "Request a Chart Alert Refund";
const REFUND_DESC =
  "Ask for a refund of your LastBerth chart alert payment. Share your email, train number, journey date, and transaction ID and our team will review it.";

export const metadata: Metadata = {
  title: REFUND_TITLE,
  description: REFUND_DESC,
  alternates: { canonical: "/refund" },
  openGraph: buildOpenGraph({
    title: `${REFUND_TITLE} | LastBerth`,
    description: "Ask for a refund of your LastBerth chart alert payment.",
    url: "/refund",
  }),
};

export default function RefundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Request Refund</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900">
          Request a Chart Alert Refund
        </h1>

        <Suspense
          fallback={
            <div className="flex min-h-[260px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          }
        >
          <RefundClient />
        </Suspense>

        <section className="mt-8 space-y-3 border-t border-slate-100 pt-6 text-sm leading-relaxed text-slate-600">
          <h2 className="text-base font-bold text-slate-900">
            LastBerth Chart Alert Refund Policy
          </h2>
          <p>
            Paid chart alert subscriptions cover automated server polling and
            real-time vacancy notifications. Eligible refund requests are
            processed at 50% of the alert fee paid and credited back to the
            original payment method via Razorpay within 5–7 business days.
          </p>
          <p>
            Note that LastBerth does not collect train ticket fares—for tickets
            booked directly on{" "}
            <a
              href="https://www.irctc.co.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 underline"
            >
              IRCTC
            </a>
            , standard Indian Railways cancellation and TDR refund rules apply.
            You can also review our{" "}
            <Link href="/terms" className="font-medium text-blue-600 underline">
              Terms of Service
            </Link>{" "}
            or{" "}
            <Link
              href="/contact"
              className="font-medium text-blue-600 underline"
            >
              contact support
            </Link>{" "}
            with your payment reference ID.
          </p>
        </section>
      </div>
    </div>
  );
}
