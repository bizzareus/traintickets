import type { Metadata } from "next";
import { Suspense } from "react";
import { CancelBookingClient } from "./CancelBookingClient";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  title: "Cancel Train Booking — LastBerth",
  description:
    "Request cancellation for your LastBerth split-ticket reservation. Enter your booking reference and mobile number to review ticket details and submit your cancellation request.",
  alternates: { canonical: "/cancel-booking" },
  openGraph: {
    title: "Cancel Train Booking — LastBerth",
    description:
      "Request cancellation for your LastBerth split-ticket reservation.",
    type: "website",
    url: `${siteUrl}/cancel-booking`,
  },
};

export default function CancelBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <CancelBookingClient />
    </Suspense>
  );
}
