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
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">
          {data.origin.name} to {data.destination.name}
        </span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl mb-4">
          Trains from {data.origin.name} to {data.destination.name}
        </h1>
        <p className="text-lg text-slate-600 mb-8">
          Detailed route analysis, waiting list confirmation chances, and Tatkal booking insights.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
            <div className="text-sm font-semibold text-blue-800">Distance</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.distanceKm} km</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <div className="text-sm font-semibold text-slate-600">Daily Trains</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">~{data.averageTrainsPerDay}</div>
          </div>
          <div className="rounded-lg bg-orange-50 p-4 border border-orange-100">
            <div className="text-sm font-semibold text-orange-800">WL Chance</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.waitingListChance}</div>
          </div>
          <div className="rounded-lg bg-green-50 p-4 border border-green-100">
            <div className="text-sm font-semibold text-green-800">Ideal Booking</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.popularBookingWindowDays} days before</div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-4">Popular Trains on this Route</h2>
        <div className="grid gap-4 sm:grid-cols-2 mb-12">
          {data.topTrains.map((train, idx) => (
            <Link 
              key={idx} 
              href={`/trains/${train.number}`}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-500 hover:shadow-md transition duration-200 group"
            >
              <div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider">
                  #{train.number}
                </span>
                <h3 className="font-bold text-slate-900 mt-1 group-hover:text-blue-600 transition-colors">
                  {train.name}
                </h3>
              </div>
              <span className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition duration-200">
                →
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-xl bg-slate-900 p-6 text-white text-center">
          <h3 className="text-xl font-bold mb-2">Need a Confirmed Ticket?</h3>
          <p className="text-slate-300 mb-4">LastBerth monitors cancellations and alternative routing to get you a seat.</p>
          <Link
            href={`/?from=${data.origin.code}&to=${data.destination.code}&fromName=${encodeURIComponent(data.origin.name)}&toName=${encodeURIComponent(data.destination.name)}`}
            className="inline-block bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-full font-bold transition-colors"
          >
            Find Alternate Routes
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
