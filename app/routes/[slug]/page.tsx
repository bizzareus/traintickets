import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRouteData, getTopRoutes } from "@/lib/seo/routes-db";
import { getRouteTrains } from "@/lib/seo/route-content";
import { buildTrainSlug } from "@/lib/trainSlug";

export const dynamicParams = false;
export const dynamic = "force-static";

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

  const title = `Trains from ${data.originCity} to ${data.destinationCity} | Route & Timetables`;
  const description = `Compare train schedules and boarding stations from ${data.originCity} to ${data.destinationCity}, then search live seat availability for your travel date.`;

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
  const trains = await getRouteTrains(data);
  if (trains.length === 0) notFound();
  const firstTrain = trains[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Trains from ${data.originCity} to ${data.destinationCity}`,
    description: `Train schedules and boarding stations between ${data.originCity} and ${data.destinationCity}.`,
  };

  return (
    <>
      <nav className="mb-6 flex text-xs font-medium text-slate-500 sm:text-sm">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="max-w-[250px] truncate font-semibold text-slate-900">
          {data.originCity} to {data.destinationCity}
        </span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="mb-3 inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-800">
          ROUTE GUIDE
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          Trains from {data.originCity} to {data.destinationCity}
        </h1>
        <p className="mb-8 mt-2 text-sm text-slate-600 sm:text-base">
          Compare selected train schedules, their actual boarding stations, and
          intermediate stops. Check availability for your travel date before
          booking.
        </p>

        <h2 className="mb-4 text-xl font-bold text-slate-900">
          Selected trains on this route
        </h2>
        <ul className="mb-10 grid gap-4 sm:grid-cols-2">
          {trains.map((train) => (
            <li
              key={train.number}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <h3 className="font-bold text-slate-900">
                {train.name} ({train.number})
              </h3>
              <p className="mt-3 text-sm text-slate-700">
                {train.from.stationName} ({train.from.stationCode})
                {train.from.departureTime &&
                  ` · Departs ${train.from.departureTime}`}
                {" → "}
                {train.to.stationName} ({train.to.stationCode})
                {train.to.arrivalTime && ` · Arrives ${train.to.arrivalTime}`}
              </p>
              {train.via.length > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  Via {train.via.join(", ")}
                </p>
              )}
              <Link
                href={`/trains/${buildTrainSlug(train.number, train.name)}`}
                className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline"
              >
                View train timetable →
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 p-6 shadow-sm sm:p-7 md:flex-row md:items-center">
          <div>
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-800">
              ⚡ LIVE SEAT SCANNER
            </span>
            <h3 className="text-xl font-extrabold text-slate-950">
              Need a Confirmed Ticket from {data.originCity} to{" "}
              {data.destinationCity}?
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Start with {firstTrain.from.stationName} (
              {firstTrain.from.stationCode}) to {firstTrain.to.stationName} (
              {firstTrain.to.stationCode}), or change stations in the search
              form. Availability depends on your journey date and class.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center md:w-auto">
            <Link
              href={`/?from=${firstTrain.from.stationCode}&to=${firstTrain.to.stationCode}&fromName=${encodeURIComponent(firstTrain.from.stationName)}&toName=${encodeURIComponent(firstTrain.to.stationName)}&utm_source=route_page&utm_medium=primary_cta&utm_campaign=${slug}`}
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
        <p className="mt-6 text-sm text-slate-600">
          Train schedules can change. Confirm departure times and complete
          ticket details with{" "}
          <a
            href="https://www.irctc.co.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 hover:underline"
          >
            IRCTC
          </a>{" "}
          before travel.
        </p>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
