import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SeatStatus } from "@/components/booking-v2/SeatStatus";

export const metadata: Metadata = {
  title: "Train Seat Status & Coach Map | Live Vacant Berth Finder",
  description: "Check real-time train seat status and view visual coach maps. Find vacant berths from your boarding station with our interactive IRCTC seat layout viewer.",
  alternates: {
    canonical: "/seat-status",
  },
  openGraph: {
    title: "Train Seat Status & Coach Map | LastBerth",
    description: "Check real-time train seat status and view visual coach maps.",
    url: "/seat-status",
  },
};

export default function SeatStatusPage() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl text-balance">
            Train Seat Status & Coach Map
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Find your exact seat location and check real-time vacant berths before booking your IRCTC train ticket.
          </p>
        </header>

        <section aria-label="Seat Status Finder" className="rounded-2xl bg-white p-4 sm:p-8 shadow-sm border border-slate-200">
          <SeatStatus />
        </section>

        <article className="mt-16 prose prose-slate mx-auto text-gray-600">
          <h2>How to check your train seat status?</h2>
          <p>
            Using our interactive coach map, you can easily find where your seat is located inside the train coach. 
            Simply enter your train number or name, select your date of journey, boarding station, and the coach number 
            (e.g., S1, B2, A1). If you want to check availability for a specific leg, you can also optionally enter your 
            destination station.
          </p>

          <h3>Find Vacant Berths</h3>
          <p>
            Before booking a ticket, it's often helpful to know if there are any fully or partially vacant seats available 
            on your train. Our vacant berth finder highlights seats that are available for your selected journey leg, 
            giving you a better chance at securing a confirmed ticket.
          </p>
          
          <h3>Understanding the Coach Layout</h3>
          <p>
            The visual coach map organizes seats by bays and cabins, exactly as they appear in the real train. 
            You can easily identify Lower (L), Middle (M), Upper (U), Side Lower (SL), and Side Upper (SU) berths.
          </p>
        </article>
      </main>
    </div>
  );
}
