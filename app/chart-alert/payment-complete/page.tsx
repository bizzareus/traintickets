import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentCompleteClient } from "./PaymentCompleteClient";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export const metadata: Metadata = {
  title: "Chart Alert Payment — LastBerth",
  description:
    "Confirming your chart alert payment. Your train chart preparation alert is activated once payment is verified.",
  alternates: { canonical: "/chart-alert/payment-complete" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Chart Alert Payment — LastBerth",
    description:
      "Confirming your chart alert payment with LastBerth.",
    type: "website",
    url: `${siteUrl}/chart-alert/payment-complete`,
  },
};

export default function PaymentCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <PaymentCompleteClient />
    </Suspense>
  );
}
