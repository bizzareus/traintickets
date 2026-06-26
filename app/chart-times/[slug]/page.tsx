import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getChartTimesPageData,
  listChartTimesSlugs,
  parseTrainNumberFromSlug,
} from "@/lib/chartTimes";
import { formatJourneyDateUtcLabel } from "@/lib/stationChartMetaSummary";
import ChartTimesTable from "./ChartTimesTable";
import ChartTimeAlertCTA from "./ChartTimeAlertCTA";
import ChartVacancyChecker from "../../chart-vacancy/ChartVacancyChecker";

function normalizeJourneyDate(raw: string | string[] | undefined): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 10);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export const dynamicParams = true;
export const revalidate = 3600;

export async function generateStaticParams() {
  return listChartTimesSlugs().map((slug) => ({ slug }));
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const trainNumber = parseTrainNumberFromSlug(slug);
  const data = trainNumber ? await getChartTimesPageData(trainNumber) : null;

  if (!data) {
    return {
      title: "IRCTC Vacancy Chart Preparation Times | LastBerth",
      description:
        "Station-by-station IRCTC vacancy chart preparation times for Indian Railways trains.",
      alternates: { canonical: `/chart-times/${slug}` },
    };
  }

  const title = `${data.trainName} (${data.trainNumber}) IRCTC Vacancy Chart Preparation Times — All Stations | LastBerth`;
  const description = `Station-by-station IRCTC vacancy chart preparation times for ${data.trainName} (${data.trainNumber}) from ${data.originStation} to ${data.destinationStation}. See when the first and second charts are prepared at each halt.`;
  return {
    title,
    description,
    alternates: { canonical: `/chart-times/${data.slug}` },
    openGraph: { title, description, type: "article" },
  };
}

export default async function ChartTimesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { date } = await searchParams;
  const journeyDate = normalizeJourneyDate(date);
  const journeyDateLabel = journeyDate
    ? formatJourneyDateUtcLabel(journeyDate)
    : null;
  const trainNumber = parseTrainNumberFromSlug(slug);
  if (!trainNumber) notFound();

  const data = await getChartTimesPageData(trainNumber);
  if (!data || data.stations.length === 0) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
  const canonicalUrl = `${siteUrl}/chart-times/${data.slug}`;
  const firstStation = data.stations[0];
  const originChart = data.stations.find((s) => s.chartTimeLocal)?.chartTimeLocal;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    name: `${data.trainName} (${data.trainNumber}) Chart Preparation Times`,
    description: `Station-by-station reservation chart preparation times for train ${data.trainName} (${data.trainNumber}).`,
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Chart Times",
          item: `${siteUrl}/chart-times`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `${data.trainName} (${data.trainNumber})`,
          item: canonicalUrl,
        },
      ],
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `When is the first chart prepared for train ${data.trainName} (${data.trainNumber})?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: originChart
            ? `The first reservation chart for train ${data.trainName} (${data.trainNumber}) is typically prepared around ${originChart} at its originating station ${firstStation?.stationName} (${firstStation?.stationCode}). The chart is generally prepared 4 hours before the train's scheduled departure from a station.`
            : `The first reservation chart for a train is generally prepared about 4 hours before its scheduled departure from the originating station. Exact chart preparation times per station for ${data.trainName} (${data.trainNumber}) are listed in the table above as they become available.`,
        },
      },
      {
        "@type": "Question",
        name: `What is chart preparation time for a station mid-route?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `For boarding stations along the route, the chart is prepared a few hours before the train reaches that station (or at a remote charting location). The table above lists the chart preparation time recorded for each station of ${data.trainName} (${data.trainNumber}).`,
        },
      },
      {
        "@type": "Question",
        name: `What is the route of train ${data.trainNumber}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Train ${data.trainName} (${data.trainNumber}) runs from ${data.originStation} to ${data.destinationStation}, stopping at ${data.stations.length} stations listed in the schedule above.`,
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-blue-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/chart-times" className="hover:text-blue-700">
          Chart Times
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{data.trainNumber}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {data.trainName} ({data.trainNumber}) — IRCTC Vacancy Chart
          Preparation Times
        </h1>
        <p className="mt-2 text-slate-600">
          Station-by-station reservation chart preparation times for{" "}
          <span className="font-medium">{data.trainName}</span> running from{" "}
          <span className="font-medium">{data.originStation}</span> to{" "}
          <span className="font-medium">{data.destinationStation}</span>.
        </p>
        {journeyDateLabel && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">
            Journey date: {journeyDateLabel}
          </p>
        )}
      </header>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700 shadow-sm">
        <p>{data.summary}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Live chart vacancy for {data.trainName} ({data.trainNumber})
        </h2>
        <ChartVacancyChecker
          fixedTrainNumber={data.trainNumber}
          fixedTrainName={data.trainName}
          presetStations={data.stations.map((s) => ({
            stationCode: s.stationCode,
            stationName: s.stationName,
          }))}
          initialJourneyDate={journeyDate}
        />
      </section>

      <ChartTimesTable
        stations={data.stations}
        journeyDate={journeyDate}
        trainNumber={data.trainNumber}
        trainName={data.trainName}
        destinationCode={
          data.stations[data.stations.length - 1]?.stationCode || data.destinationStation
        }
      />

      <div className="mt-8">
        <ChartTimeAlertCTA
          trainNumber={data.trainNumber}
          trainName={data.trainName}
          destinationCode={
            data.stations[data.stations.length - 1]?.stationCode || data.destinationStation
          }
          stations={data.stations
            .slice(0, -1)
            .map((s) => ({ stationCode: s.stationCode, stationName: s.stationName }))}
          initialJourneyDate={journeyDate}
        />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Looking for the full timetable, halts and seat confirmation chances?{" "}
        <Link
          href={`/trains/${data.trainNumber}`}
          className="font-medium text-blue-700 hover:underline"
        >
          View the {data.trainNumber} train schedule →
        </Link>
      </p>
    </>
  );
}
