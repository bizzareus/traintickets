import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { ResumeBookingClient } from "./ResumeBookingClient";

export const metadata: Metadata = {
  title: "Complete Your Train Booking — LastBerth",
  description: "Resume and complete your saved train reservation on LastBerth.",
  robots: { index: false, follow: false },
};

export default async function ResumeBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <h2 className="text-base font-bold text-slate-800">
            Loading your booking…
          </h2>
        </main>
      }
    >
      <ResumeBookingClient bookingRef={typeof ref === "string" ? ref : ""} />
    </Suspense>
  );
}
