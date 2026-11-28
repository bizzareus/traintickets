import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RefundClient } from "./RefundClient";
import { buildBreadcrumbJsonLd, buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Request a Chart Alert Refund",
  description:
    "Ask for a refund of your LastBerth chart alert payment. Share your email, train number, journey date, and transaction ID and our team will review it.",
  canonical: "/refund",
});

export default function RefundPage() {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", item: "https://lastberth.com" },
    { name: "Request Refund", item: "https://lastberth.com/refund" },
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
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

          <h2 className="pt-2 text-base font-bold text-slate-900">
            How Refund Requests Are Reviewed
          </h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Enter the email address used during checkout along with your train
              number, journey date, and Razorpay transaction ID.
            </li>
            <li>
              Our support team verifies the alert subscription status and checks
              whether automated chart monitoring was delivered for your train.
            </li>
            <li>
              Approved refunds are initiated back to your original UPI, card, or
              netbanking account within 5–7 business days.
            </li>
          </ol>
          <p>
            If your reservation chart has not yet been prepared, you can track
            expected release timings on{" "}
            <Link
              href="/chart-times"
              className="font-medium text-blue-600 underline"
            >
              Train Chart Times
            </Link>{" "}
            or inspect live post-charting empty seats via{" "}
            <Link
              href="/chart-vacancy"
              className="font-medium text-blue-600 underline"
            >
              Chart Vacancy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
