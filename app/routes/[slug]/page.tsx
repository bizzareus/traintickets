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
      <nav className="mb-6 flex text-xs sm:text-sm text-slate-500 font-medium">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="text-slate-900 font-semibold truncate max-w-[250px]">
          {data.origin.name} to {data.destination.name}
        </span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-100 mb-3 tracking-wider uppercase">
          ROUTE GUIDE
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">
          Trains from {data.origin.name} to {data.destination.name}
        </h1>
        <p className="text-slate-600 mt-2 text-sm sm:text-base mb-8">
          Detailed route analysis, waiting list confirmation chances, and Tatkal booking insights.
        </p>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-10">
          <div className="rounded-xl bg-slate-50/50 p-4 border border-slate-200/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Distance</span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">{data.distanceKm} km</div>
          </div>
          <div className="rounded-xl bg-slate-50/50 p-4 border border-slate-200/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Daily Trains</span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">~{data.averageTrainsPerDay}</div>
          </div>
          <div className="rounded-xl bg-slate-50/50 p-4 border border-slate-200/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">WL Chance</span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">{data.waitingListChance}</div>
          </div>
          <div className="rounded-xl bg-slate-50/50 p-4 border border-slate-200/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ideal Booking</span>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">{data.popularBookingWindowDays}d before</div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-955 mb-4">Popular Trains on this Route</h2>
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          {data.topTrains.map((train, idx) => (
            <Link 
              key={idx} 
              href={`/trains/${train.number}`}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-600 hover:shadow-sm transition duration-200 group"
            >
              <div>
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider">
                  #{train.number}
                </span>
                <h3 className="font-bold text-slate-900 mt-2 group-hover:text-blue-600 transition-colors">
                  {train.name}
                </h3>
              </div>
              <span className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition duration-200">
                →
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Need a Confirmed Ticket?</h3>
            <p className="text-sm text-slate-650 mt-1">LastBerth monitors cancellations and alternative routing to get you a seat.</p>
          </div>
          <Link
            href={`/?from=${data.origin.code}&to=${data.destination.code}&fromName=${encodeURIComponent(data.origin.name)}&toName=${encodeURIComponent(data.destination.name)}`}
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm hover:shadow transition duration-200"
          >
            Find Alternate Routes
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
