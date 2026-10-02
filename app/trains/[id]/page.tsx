import { Suspense } from "react";
import { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import TrainDetailClient, {
  Train,
  StationChartMap,
} from "./TrainDetailClient";
import {
  buildTrainSlug,
  getTopTrainSlugs,
  getTrainIndex,
  parseTrainNumberFromParam,
} from "@/lib/trainSlug";
import { getChartTimesPageData } from "@/lib/chartTimes";

export const dynamicParams = true;

async function fetchTrainData(id: string): Promise<Train | null> {
  const apiUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3009";
  try {
    const res = await fetch(`${apiUrl}/api/trains/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err?.cause?.code === "ECONNREFUSED" || err?.code === "ECONNREFUSED") {
      console.warn(
        `[web] Backend server is not reachable at ${apiUrl} (ECONNREFUSED). Falling back to static dataset for train id=${id}.`,
      );
    } else {
      console.error(`Error fetching train data for id=${id}:`, err);
    }
    return null;
  }
}

export async function generateStaticParams() {
  // Pre-render the top ~500 trains (stable core set + premium named trains +
  // superfast expresses from the local dataset) at their slugged canonical URLs.
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

function calculateHaltMinutes(
  arr?: string | null,
  dep?: string | null,
): string | undefined {
  if (!arr || !dep) return undefined;
  const [ah, am] = arr.split(":").map(Number);
  const [dh, dm] = dep.split(":").map(Number);
  if (isNaN(ah) || isNaN(am) || isNaN(dh) || isNaN(dm)) return undefined;
  const diff = dh * 60 + dm - (ah * 60 + am);
  return diff > 0 ? `${diff}m` : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { trainNumber, local } = resolveTrainParam(id);
  const train = await fetchTrainData(trainNumber);
  const chartTimesData = !train ? await getChartTimesPageData(trainNumber) : null;

  const trainName =
    train?.trainName || chartTimesData?.trainName || local?.trainName;
  const origin =
    train?.originStation ||
    chartTimesData?.originStation ||
    local?.originStation;
  const dest =
    train?.destinationStation ||
    chartTimesData?.destinationStation ||
    local?.destinationStation;
  const canonicalSlug = buildTrainSlug(trainNumber, trainName);

  if (!trainName) {
    return {
      title: `Train ${trainNumber} Schedule, Route & Stops | LastBerth`,
      description: `Full timetable for train ${trainNumber}: station list, arrival/departure timings, halts, platforms and days of operation, plus Tatkal booking windows.`,
      alternates: { canonical: `/trains/${canonicalSlug}` },
    };
  }

  return {
    title: `${trainName} (${trainNumber}) Schedule, Route & Stops | LastBerth`,
    description: `${trainName} (${trainNumber}) timetable from ${origin} to ${dest}: full station-by-station timings, halts, expected platforms, Tatkal booking windows, and chart preparation times.`,
    alternates: { canonical: `/trains/${canonicalSlug}` },
    openGraph: {
      title: `${trainName} (${trainNumber}) Schedule & Stops`,
      description: `${trainName} (${trainNumber}) timetable from ${origin} to ${dest}. Check halts, arrival/departure, and vacant berths on LastBerth.`,
      url: `/trains/${canonicalSlug}`,
      type: "website",
    },
  };
}

export default async function TrainDetailPage({ params }: Props) {
  const { id } = await params;
  const { trainNumber, local } = resolveTrainParam(id);

  // Fetch API train and local/cached chart times data in parallel
  const [train, chartTimesData] = await Promise.all([
    fetchTrainData(trainNumber),
    getChartTimesPageData(trainNumber),
  ]);

  const trainName =
    train?.trainName || chartTimesData?.trainName || local?.trainName;
  const canonicalSlug = buildTrainSlug(trainNumber, trainName);

  // Canonicalize to slugged URL (/trains/12015-ajmer-shatabdi)
  if (trainName && id !== canonicalSlug) {
    permanentRedirect(`/trains/${canonicalSlug}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
  const canonicalUrl = `${siteUrl}/trains/${canonicalSlug}`;
  const displayName = trainName || `Train ${trainNumber}`;

  // Build stationChartTimes map
  const stationChartTimes: StationChartMap = {};
  if (chartTimesData?.stations) {
    for (const s of chartTimesData.stations) {
      stationChartTimes[s.stationCode] = {
        chartOne: s.chartTimeLocal || null,
        chartTwo: s.chartTwoTimeLocal || null,
      };
    }
  }

  // Construct or backfill effectiveTrain so timetable data is never blank
  let effectiveTrain: Train | null = train;
  if (!effectiveTrain && chartTimesData) {
    effectiveTrain = {
      id: chartTimesData.trainNumber,
      trainNumber: chartTimesData.trainNumber,
      trainName: chartTimesData.trainName,
      originStation: chartTimesData.originStation,
      destinationStation: chartTimesData.destinationStation,
      chartRules: chartTimesData.stations.map((s, idx) => ({
        stationCode: s.stationCode,
        chartTimeLocal: s.chartTimeLocal || "",
        sequenceNumber: idx + 1,
        predictionProbability: 0.9,
        avgBerthsReleased: 12,
        optimalWindowStart: s.chartTimeLocal || "",
        optimalWindowEnd: s.chartTwoTimeLocal || "",
      })),
      schedule: {
        trainNumber: chartTimesData.trainNumber,
        trainName: chartTimesData.trainName,
        stationFrom: chartTimesData.originStation,
        stationTo: chartTimesData.destinationStation,
        stationList: chartTimesData.stations.map((s) => ({
          stationCode: s.stationCode,
          stationName: s.stationName,
          arrivalTime: s.arrivalTime || undefined,
          departureTime: s.departureTime || undefined,
          haltMinutes: calculateHaltMinutes(s.arrivalTime, s.departureTime),
          distance: s.distance != null ? s.distance : 0,
          day: s.day ?? 1,
        })),
        trainRunsOn: {
          trainRunsOnMon: "Y",
          trainRunsOnTue: "Y",
          trainRunsOnWed: "Y",
          trainRunsOnThu: "Y",
          trainRunsOnFri: "Y",
          trainRunsOnSat: "Y",
          trainRunsOnSun: "Y",
        },
      },
    };
  } else if (
    effectiveTrain &&
    !effectiveTrain.schedule?.stationList?.length &&
    chartTimesData?.stations?.length
  ) {
    effectiveTrain.schedule = {
      trainNumber: chartTimesData.trainNumber,
      trainName: effectiveTrain.trainName || chartTimesData.trainName,
      stationFrom:
        effectiveTrain.originStation || chartTimesData.originStation,
      stationTo:
        effectiveTrain.destinationStation || chartTimesData.destinationStation,
      stationList: chartTimesData.stations.map((s) => ({
        stationCode: s.stationCode,
        stationName: s.stationName,
        arrivalTime: s.arrivalTime || undefined,
        departureTime: s.departureTime || undefined,
        haltMinutes: calculateHaltMinutes(s.arrivalTime, s.departureTime),
        distance: s.distance != null ? s.distance : 0,
        day: s.day ?? 1,
      })),
      trainRunsOn: effectiveTrain.schedule?.trainRunsOn ?? {
        trainRunsOnMon: "Y",
        trainRunsOnTue: "Y",
        trainRunsOnWed: "Y",
        trainRunsOnThu: "Y",
        trainRunsOnFri: "Y",
        trainRunsOnSat: "Y",
        trainRunsOnSun: "Y",
      },
    };
  }

  const stationList = effectiveTrain?.schedule?.stationList;
  const runsOn = effectiveTrain?.schedule?.trainRunsOn;
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

  const origin =
    effectiveTrain?.originStation ||
    chartTimesData?.originStation ||
    local?.originStation;
  const dest =
    effectiveTrain?.destinationStation ||
    chartTimesData?.destinationStation ||
    local?.destinationStation;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    name: `${displayName} (${trainNumber}) Schedule, Route & Stops`,
    description: `Timetable, station halts, platforms, Tatkal booking windows and chart preparation times for ${displayName} (${trainNumber}).`,
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Trains",
          item: `${siteUrl}/search`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: displayName,
          item: canonicalUrl,
        },
      ],
    },
  };

  const faqEntries: { q: string; a: string }[] = [];
  if (trainName) {
    faqEntries.push({
      q: `When does Tatkal booking open for ${trainName} (${trainNumber})?`,
      a: `Tatkal booking for ${trainName} (${trainNumber}) opens one day before departure at 10:00 AM IST for AC classes (EC, CC, EA, 1A, 2A, 3A) and 11:00 AM IST for Non-AC classes on IRCTC.`,
    });
    if (origin && dest) {
      faqEntries.push({
        q: `What is the route of ${trainName} (${trainNumber})?`,
        a: `${trainName} (${trainNumber}) runs from ${origin} to ${dest}${
          stationList?.length
            ? `, stopping at ${stationList.length} stations en route`
            : ""
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
        mainEntity: faqEntries.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      }
    : null;

  const canonicalChartTimesSlug =
    local?.chartTimesSlug ?? chartTimesData?.slug ?? null;

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
          <div className="space-y-6 sm:space-y-8 animate-pulse">
            {/* Hero Skeleton */}
            <div className="rounded-3xl border border-slate-800 bg-[#0B1120] p-6 sm:p-10 text-white space-y-4">
              <div className="h-4 bg-slate-800 rounded w-48 mb-2" />
              <div className="h-10 bg-slate-700 rounded w-3/4 max-w-md" />
              <div className="h-5 bg-slate-800 rounded w-1/2" />
              <div className="h-20 bg-slate-900/60 rounded-2xl border border-white/10 mt-6" />
            </div>

            {/* Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between"
                >
                  <div className="h-3 bg-slate-100 rounded w-20" />
                  <div className="h-6 bg-slate-200 rounded w-24" />
                  <div className="h-3 bg-slate-50 rounded w-full" />
                </div>
              ))}
            </div>

            {/* Timetable Skeleton */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="h-6 bg-slate-200 rounded w-1/3" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-slate-50 rounded-xl border border-slate-100"
                  />
                ))}
              </div>
            </div>
          </div>
        }
      >
        <TrainDetailClient
          initialTrainData={effectiveTrain}
          chartTimesSlug={canonicalChartTimesSlug}
          stationChartTimes={stationChartTimes}
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
