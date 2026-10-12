import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRouteData, getTopRoutes } from "@/lib/seo/routes-db";

export const dynamicParams = true;

export async function generateStaticParams() {
  const routes = await getTopRoutes();
  return routes.map((r) => ({
    slug: `${r.origin}-to-${r.dest}`,
  }));
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const match = slug.match(/^([a-z0-9-]+)-to-([a-z0-9-]+)$/);
  if (!match) return {};

  const [, origin, dest] = match;
  const data = await getRouteData(origin, dest);
  if (!data) return {};

  const title = `Trains from ${data.origin.name} to ${data.destination.name} | Seat Availability & Waiting List Chances`;
  const description = `Find train availability, waiting list chances, and travel insights for trains running from ${data.origin.name} to ${data.destination.name}. Average ${data.averageTrainsPerDay} trains daily.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/routes/${slug}`,
    },
  };
}

export default async function RoutePage({ params }: Props) {
  const { slug } = await params;
  const match = slug.match(/^([a-z0-9-]+)-to-([a-z0-9-]+)$/);
  if (!match) notFound();

  const [, originSlug, destSlug] = match;
  const data = await getRouteData(originSlug, destSlug);
  if (!data) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Trains from ${data.origin.name} to ${data.destination.name}`,
    description: `Train ticket availability and booking stats between ${data.origin.name} and ${data.destination.name}.`,
  };

  return (
    <>
      <nav className="mb-6 flex text-xs font-medium text-slate-500 sm:text-sm">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="max-w-[250px] truncate font-semibold text-slate-900">
          {data.origin.name} to {data.destination.name}
        </span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="mb-3 inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-800">
          ROUTE GUIDE
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          Trains from {data.origin.name} to {data.destination.name}
        </h1>
        <p className="mb-8 mt-2 text-sm text-slate-600 sm:text-base">
          Detailed route analysis, waiting list confirmation chances, and Tatkal
          booking insights.
        </p>

        <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Distance
            </span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {data.distanceKm} km
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Daily Trains
            </span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              ~{data.averageTrainsPerDay}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              WL Chance
            </span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {data.waitingListChance}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ideal Booking
            </span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {data.popularBookingWindowDays}d before
            </div>
          </div>
        </div>

        <h2 className="text-slate-955 mb-4 text-xl font-bold">
          Popular Trains on this Route
        </h2>
        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          {data.topTrains.map((train, idx) => (
            <Link
              key={idx}
              href={`/trains/${train.number}`}
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition duration-200 hover:border-blue-600 hover:shadow-sm"
            >
              <div>
                <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-blue-600">
                  #{train.number}
                </span>
                <h3 className="mt-2 font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                  {train.name}
                </h3>
              </div>
              <span className="text-slate-400 transition duration-200 group-hover:translate-x-1 group-hover:text-blue-600">
                →
              </span>
            </Link>
          ))}
        </div>

        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 p-6 shadow-sm sm:p-7 md:flex-row md:items-center">
          <div>
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-800">
              ⚡ LIVE SEAT SCANNER
            </span>
            <h3 className="text-xl font-extrabold text-slate-950">
              Need a Confirmed Ticket from {data.origin.name} to{" "}
              {data.destination.name}?
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Search real-time availability, split-journey contiguous bookings
              on the same train, and vacant berths after charting.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center md:w-auto">
            <Link
              href={`/?from=${data.origin.code}&to=${data.destination.code}&fromName=${encodeURIComponent(data.origin.name)}&toName=${encodeURIComponent(data.destination.name)}&utm_source=route_page&utm_medium=primary_cta&utm_campaign=${slug}`}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-bold text-white shadow-md transition duration-200 hover:bg-blue-700 hover:shadow-lg active:scale-[0.98]"
            >
              Search Confirmed Seats Now →
            </Link>
            <Link
              href={`/chart-vacancy`}
              className="shadow-2xs inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition duration-200 hover:bg-slate-50"
            >
              📊 Check Vacancies
            </Link>
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
