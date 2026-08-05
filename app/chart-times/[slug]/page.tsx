import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getChartTimesPageData,
  listChartTimesSlugs,
  parseTrainNumberFromSlug,
} from "@/lib/chartTimes";
import { formatJourneyDateUtcLabel } from "@/lib/stationChartMetaSummary";
import { buildTrainSlug } from "@/lib/trainSlug";
import ChartTimesTable from "./ChartTimesTable";
import ChartTimeAlertCTA from "./ChartTimeAlertCTA";

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
    keywords: buildChartTimesKeywords(data),
    alternates: { canonical: `/chart-times/${data.slug}` },
    openGraph: { title, description, type: "article" },
  };
}

/**
 * Query variants travellers actually search for, per train. Covers the train
 * number, train name and origin/destination pair across the common phrasings
 * (chart preparation time, chart time, chart vacancy, first/second chart, chart
 * status) so a single page can rank for the long tail.
 */
function buildChartTimesKeywords(data: {
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
}): string[] {
  const { trainNumber, trainName, originStation, destinationStation } = data;
  const route = `${originStation} to ${destinationStation}`;
  return [
    `${trainNumber} chart preparation time`,
    `${trainNumber} chart time`,
    `${trainNumber} chart vacancy`,
    `${trainNumber} chart status`,
    `${trainNumber} first chart prepared`,
    `${trainNumber} second chart`,
    `when is chart prepared for ${trainNumber}`,
    `irctc chart preparation ${trainNumber}`,
    `${trainName} chart preparation time`,
    `${trainName} (${trainNumber}) chart time`,
    `${route} chart preparation time`,
    `${trainNumber} ${trainName} chart vacancy`,
  ];
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
    keywords: buildChartTimesKeywords(data).join(", "),
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

  const faqItems = [
    {
      question: `When is the first chart prepared for train ${data.trainName} (${data.trainNumber})?`,
      answer: originChart
        ? `The first reservation chart for train ${data.trainName} (${data.trainNumber}) is typically prepared around ${originChart} at its originating station ${firstStation?.stationName} (${firstStation?.stationCode}). The chart is generally prepared 4 hours before the train's scheduled departure from a station.`
        : `The first reservation chart for a train is generally prepared about 4 hours before its scheduled departure from the originating station. Exact chart preparation times per station for ${data.trainName} (${data.trainNumber}) are listed in the table above as they become available.`,
    },
    {
      question: `What is chart preparation time for a station mid-route?`,
      answer: `For boarding stations along the route, the chart is prepared a few hours before the train reaches that station (or at a remote charting location). The table above lists the chart preparation time recorded for each station of ${data.trainName} (${data.trainNumber}).`,
    },
    {
      question: `What is the route of train ${data.trainNumber}?`,
      answer: `Train ${data.trainName} (${data.trainNumber}) runs from ${data.originStation} to ${data.destinationStation}, stopping at ${data.stations.length} stations listed in the schedule table above.`,
    },
  ];

  const tableJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonicalUrl}#table`,
    name: `${data.trainName} (${data.trainNumber}) IRCTC Reservation Chart Preparation Times & Schedule Table`,
    description: `Station-by-station reservation chart preparation times for train ${data.trainName} (${data.trainNumber}) running from ${data.originStation} to ${data.destinationStation}.`,
    numberOfItems: data.stations.length,
    itemListElement: data.stations.map((s, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: `${s.stationName} (${s.stationCode})`,
      description: `Halt ${idx + 1}: ${s.stationName} (${s.stationCode}) — Arrival: ${s.arrivalTime || "Origin"}, Departure: ${s.departureTime || "Destination"}, Day: ${s.day || 1}. 1st Chart Time: ${s.chartTimeLocal || "Awaiting chart data"}${s.chartTwoTimeLocal ? `, 2nd Chart Time: ${s.chartTwoTimeLocal}` : ""}.`,
    })),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(tableJsonLd) }}
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
        <h2 className="mb-2 text-base font-semibold text-slate-900">
          Chart Preparation Summary — {data.trainName} ({data.trainNumber})
        </h2>
        <p>{data.summary}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          Station-by-Station Chart Preparation Time Table
        </h2>
        <ChartTimesTable
          stations={data.stations}
          journeyDate={journeyDate}
          trainNumber={data.trainNumber}
          trainName={data.trainName}
          destinationCode={
            data.stations[data.stations.length - 1]?.stationCode || data.destinationStation
          }
        />
      </section>

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

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-slate-900">
          Frequently Asked Questions — {data.trainName} ({data.trainNumber}) Chart Times
        </h2>
        <div className="space-y-4">
          {faqItems.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
              <h3 className="font-semibold text-slate-900">{item.question}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        Looking for the full timetable, halts and seat confirmation chances?{" "}
        <Link
          href={`/trains/${buildTrainSlug(data.trainNumber, data.trainName)}`}
          className="font-medium text-blue-700 hover:underline"
        >
          View the {data.trainName} ({data.trainNumber}) schedule →
        </Link>
      </p>
    </>
  );
}
