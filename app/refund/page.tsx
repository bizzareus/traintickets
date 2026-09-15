import type { Metadata } from "next";
import { Suspense } from "react";
import { RefundClient } from "./RefundClient";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  title: "Request a Refund — LastBerth",
  description:
    "Ask for a refund of your LastBerth chart alert payment. Share your mobile number, train number, journey date and transaction ID and our team will review it.",
  alternates: { canonical: "/refund" },
  openGraph: {
    title: "Request a Refund — LastBerth",
    description:
      "Ask for a refund of your LastBerth chart alert payment.",
    type: "website",
    url: `${siteUrl}/refund`,
  },
};

export default function RefundPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <RefundClient />
    </Suspense>
  );
}
