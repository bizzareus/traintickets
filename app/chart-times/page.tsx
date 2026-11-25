import type { Metadata } from "next";
import Link from "next/link";
import { listPopularChartTimes } from "@/lib/chartTimes";
import ChartTimesFinder from "./ChartTimesFinder";

export const dynamicParams = true;
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "IRCTC Train Chart Preparation Times by Station",
  description:
    "Check station-by-station 1st and 2nd reservation chart preparation times for Indian Railways trains and spot post-chart vacant berths.",
  alternates: { canonical: "/chart-times" },
};

export default function ChartTimesIndexPage() {
  const trains = listPopularChartTimes();

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${siteUrl}/chart-times`,
    name: "IRCTC Chart Vacancy & Train Chart Preparation Times",
    description:
      "Browse station-by-station reservation chart preparation times for Indian Railways trains. Check 1st and 2nd chart preparation timing to spot vacant berths.",
    url: `${siteUrl}/chart-times`,
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
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          IRCTC Chart Vacancy &amp; Train Chart Preparation Times
        </h1>
        <p className="mt-2 text-slate-600">
          Browse station-by-station reservation chart preparation times for
          Indian Railways trains — when each chart is prepared, so you can check
          chart vacancy and vacant berths. Looking for live vacant berths? See{" "}
          <Link href="/chart-vacancy" className="text-blue-600 hover:underline">
            IRCTC chart vacancy
          </Link>
          .
        </p>
      </header>

      <div className="mb-8">
        <ChartTimesFinder
          initialPopularTrains={trains.map((t) => ({
            trainNumber: t.trainNumber,
            trainName: t.trainName || t.trainNumber,
          }))}
        />
      </div>

      {trains.length > 0 && (
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Popular trains
        </h2>
      )}

      {trains.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {trains.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/chart-times/${t.slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium text-slate-900">
                    {t.trainName || t.trainNumber}
                  </span>
                  <span className="ml-2 text-sm text-slate-500">
                    ({t.trainNumber})
                  </span>
                  {t.originStation && t.destinationStation && (
                    <span className="block text-sm text-slate-500">
                      {t.originStation} → {t.destinationStation}
                    </span>
                  )}
                </span>
                <span className="text-blue-700">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
          Chart-time pages are generated on demand. Open{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
            /chart-times/&lt;train-number&gt;-&lt;train-name&gt;-chart-times
          </code>{" "}
          to generate one.
        </p>
      )}
    </>
  );
}
