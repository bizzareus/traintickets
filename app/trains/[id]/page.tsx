import { Suspense } from "react";
import { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import TrainDetailClient, { Train } from "./TrainDetailClient";
import {
  buildTrainSlug,
  getTopTrainSlugs,
  getTrainIndex,
  parseTrainNumberFromParam,
} from "@/lib/trainSlug";

export const dynamicParams = true;

async function fetchTrainData(id: string): Promise<Train | null> {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3009";
  try {
    const res = await fetch(`${apiUrl}/api/trains/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err?.cause?.code === 'ECONNREFUSED' || err?.code === 'ECONNREFUSED') {
      console.warn(`[web] Backend server is not reachable at ${apiUrl} (ECONNREFUSED). Falling back to client-side hydration for train id=${id}.`);
    } else {
      console.error(`Error fetching train data for id=${id}:`, err);
    }
    return null;
  }
}

export async function generateStaticParams() {
  // Pre-render the top ~500 trains (stable core set + premium named trains +
  // superfast expresses from the local dataset) at their slugged canonical
  // URLs; other/bare-number requests render on demand and 308-redirect.
  return getTopTrainSlugs(500).map((id) => ({ id }));
}

type Props = {
  params: Promise<{ id: string }>;
};

/** Resolve the incoming `[id]` param to train number + best-known name + canonical slug. */
function resolveTrainParam(id: string) {
  const trainNumber = parseTrainNumberFromParam(id) ?? id;
  const local = getTrainIndex().get(trainNumber);
  return { trainNumber, local };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { trainNumber, local } = resolveTrainParam(id);
  const train = await fetchTrainData(trainNumber);
  const trainName = train?.trainName || local?.trainName;
  const origin = train?.originStation || local?.originStation;
  const dest = train?.destinationStation || local?.destinationStation;
  const canonicalSlug = buildTrainSlug(trainNumber, trainName);

  if (!trainName) {
    return {
      // Root layout template appends "| LastBerth".
      title: `Train ${trainNumber} Schedule, Route & Stops`,
      description: `Full timetable for train ${trainNumber}: station list, arrival/departure timings, halts, platforms and days of operation, plus Tatkal booking windows.`,
      alternates: { canonical: `/trains/${canonicalSlug}` },
    };
  }

  return {
    title: `${trainName} (${trainNumber}) Schedule, Route & Stops`,
    description: `${trainName} (${trainNumber}) timetable from ${origin} to ${dest}: every stop with arrival/departure times, halts, platforms, days of operation and Tatkal booking windows.`,
    alternates: { canonical: `/trains/${canonicalSlug}` },
  };
}

export default async function TrainDetailPage({ params }: Props) {
  const { id } = await params;
  const { trainNumber, local } = resolveTrainParam(id);
  const train = await fetchTrainData(trainNumber);

  // Canonicalize to the slugged URL (confirmtkt-style /trains/12015-ajmer-shatabdi)
  // whenever the train name is known and the request used a different form.
  const trainName = train?.trainName || local?.trainName;
  const canonicalSlug = buildTrainSlug(trainNumber, trainName);
  if (trainName && id !== canonicalSlug) {
    permanentRedirect(`/trains/${canonicalSlug}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
  const canonicalUrl = `${siteUrl}/trains/${canonicalSlug}`;

  const displayName = trainName || `Train ${trainNumber}`;
  const stationList = train?.schedule?.stationList;
  const runsOn = train?.schedule?.trainRunsOn;
  const runDays = runsOn
    ? [
        ["Monday", runsOn.trainRunsOnMon],
        ["Tuesday", runsOn.trainRunsOnTue],
        ["Wednesday", runsOn.trainRunsOnWed],
        ["Thursday", runsOn.trainRunsOnThu],
        ["Friday", runsOn.trainRunsOnFri],
        ["Saturday", runsOn.trainRunsOnSat],
        ["Sunday", runsOn.trainRunsOnSun],
      ]
        .filter(([, v]) => v === "Y")
        .map(([d]) => d)
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    "name": `${displayName} (${trainNumber}) Schedule, Route & Stops`,
    "description": `Timetable, station list, halts, platforms and Tatkal booking windows for ${displayName} (${trainNumber}).`,
    "url": canonicalUrl,
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": `${siteUrl}/` },
        { "@type": "ListItem", "position": 2, "name": "Trains", "item": `${siteUrl}/search` },
        { "@type": "ListItem", "position": 3, "name": displayName, "item": canonicalUrl },
      ],
    },
  };

  // FAQ structured data — real facts only (Tatkal windows are the official
  // IRCTC rule; route/stops/days come from the train's own schedule data,
  // falling back to the committed local dataset when the API is unreachable).
  const origin = train?.originStation || local?.originStation;
  const dest = train?.destinationStation || local?.destinationStation;
  const faqEntries: { q: string; a: string }[] = [];
  if (trainName) {
    faqEntries.push({
      q: `When does Tatkal booking open for ${trainName} (${trainNumber})?`,
      a: `Tatkal booking for ${trainName} (${trainNumber}) opens one day before departure at 10:00 AM for AC classes (1A, 2A, 3A, CC, EC) and 11:00 AM for Non-AC classes (SL, 2S) on IRCTC.`,
    });
    if (origin && dest) {
      faqEntries.push({
        q: `What is the route of ${trainName} (${trainNumber})?`,
        a: `${trainName} (${trainNumber}) runs from ${origin} to ${dest}${
          stationList?.length ? `, stopping at ${stationList.length} stations en route` : ""
        }. The full station-by-station timetable with arrival and departure times is listed on this page.`,
      });
    }
    if (runDays.length) {
      faqEntries.push({
        q: `On which days does ${trainName} (${trainNumber}) run?`,
        a:
          runDays.length === 7
            ? `${trainName} (${trainNumber}) runs daily, all seven days of the week.`
            : `${trainName} (${trainNumber}) runs on ${runDays.join(", ")}.`,
      });
    }
  }
  const faqJsonLd = faqEntries.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqEntries.map(({ q, a }) => ({
          "@type": "Question",
          "name": q,
          "acceptedAnswer": { "@type": "Answer", "text": a },
        })),
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-32 mb-4"></div>
            <div className="h-10 bg-slate-200 rounded w-2/3 mb-4"></div>
            <div className="h-5 bg-slate-100 rounded w-1/2 mb-8"></div>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex flex-col justify-between">
                  <div className="h-3.5 bg-slate-100 rounded w-16"></div>
                  <div className="h-6 bg-slate-200/80 rounded w-20"></div>
                </div>
              ))}
            </div>
            <div className="border-b border-slate-100 pb-4 mb-4">
              <div className="h-6 bg-slate-100 rounded w-1/4"></div>
            </div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100/60">
                  <div className="h-5 bg-slate-100 rounded w-1/3"></div>
                  <div className="h-5 bg-slate-100 rounded w-1/6"></div>
                  <div className="h-5 bg-slate-100 rounded w-1/12"></div>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <TrainDetailClient
          initialTrainData={train}
          chartTimesSlug={local?.chartTimesSlug ?? null}
          localTrain={
            local
              ? {
                  trainNumber: local.trainNumber,
                  trainName: local.trainName,
                  originStation: local.originStation,
                  destinationStation: local.destinationStation,
                }
              : null
          }
        />
      </Suspense>
    </>
  );
}
