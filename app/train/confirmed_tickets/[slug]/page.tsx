import { Suspense } from "react";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import TrainConfirmedTicketsClient, {
  TrainInfo,
} from "./TrainConfirmedTicketsClient";
import {
  buildTrainSlug,
  getTrainIndex,
  parseTrainNumberFromParam,
} from "@/lib/trainSlug";

import { getChartTimesPageData } from "@/lib/chartTimes";
import { getTrainCachedSeats } from "@/lib/dynamodb";

export const dynamicParams = true;
// Availability must not be frozen into build-time or hourly ISR HTML.
export const dynamic = "force-dynamic";

async function fetchTrainData(trainNumber: string): Promise<TrainInfo | null> {
  const apiUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3009";
  try {
    const res = await fetch(`${apiUrl}/api/trains/${trainNumber}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type Props = {
  params: Promise<{ slug: string }>;
};

function resolveTrainParam(slug: string) {
  const trainNumber = parseTrainNumberFromParam(slug) ?? slug;
  const local = getTrainIndex().get(trainNumber);
  return { trainNumber, local };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { trainNumber, local } = resolveTrainParam(slug);
  const train = await fetchTrainData(trainNumber);
  const trainName = train?.trainName || local?.trainName;
  const origin = train?.originStation || local?.originStation;
  const dest = train?.destinationStation || local?.destinationStation;
  const canonicalSlug = buildTrainSlug(trainNumber, trainName);

  if (!trainName) {
    return {
      title: `Confirmed Tickets for Train ${trainNumber}`,
      description: `Check live cached seat availability, post-charting empty berths, and Smart Seats split-booking options for Train ${trainNumber}.`,
      alternates: { canonical: `/train/confirmed_tickets/${canonicalSlug}` },
    };
  }

  return {
    title: `Confirmed Tickets for ${trainName} (${trainNumber}) - Live Seat Availability`,
    description: `How to get confirmed tickets on ${trainName} (${trainNumber}) from ${origin} to ${dest}. Live cached seat status, post-charting berths, and Smart Seats segment booking.`,
    alternates: { canonical: `/train/confirmed_tickets/${canonicalSlug}` },
  };
}

export default async function TrainConfirmedTicketsPage({ params }: Props) {
  const { slug } = await params;
  const { trainNumber, local } = resolveTrainParam(slug);
  const train = await fetchTrainData(trainNumber);

  const trainName = train?.trainName || local?.trainName;
  const canonicalSlug = buildTrainSlug(trainNumber, trainName);

  if (trainName && slug !== canonicalSlug) {
    permanentRedirect(`/train/confirmed_tickets/${canonicalSlug}`);
  }

  const origin = train?.originStation || local?.originStation || "Origin";
  const dest =
    train?.destinationStation || local?.destinationStation || "Destination";
  const cachedSeats = await getTrainCachedSeats(trainNumber, origin, dest);
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
  const canonicalUrl = `${siteUrl}/train/confirmed_tickets/${canonicalSlug}`;

  const displayName = trainName || `Train ${trainNumber}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    name: `Confirmed Tickets for ${displayName} (${trainNumber})`,
    description: `Cached seat availability, Smart Seats split-booking options, and post-charting vacant berths for ${displayName} (${trainNumber}).`,
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Confirmed Tickets",
          item: canonicalUrl,
        },
      ],
    },
  };

  const faqEntries = [
    {
      q: `How do I get a confirmed ticket on ${displayName} (${trainNumber}) when status shows REGRET?`,
      a: `When direct tickets on ${displayName} show REGRET, use LastBerth Smart Seats to search for contiguous split-segments on the same train (e.g., ${origin} to Kanpur + Kanpur to ${dest}).`,
    },
    {
      q: `When are vacant seats released for ${displayName} (${trainNumber})?`,
      a: `Vacant seats and unutilized quotas for ${displayName} are released into Current Reservation (CURR_AVBL) immediately after 1st chart preparation, roughly 4 hours before departure from origin.`,
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  let schedule = train?.schedule;
  if (!schedule?.stationList || schedule.stationList.length === 0) {
    try {
      const ctData = await getChartTimesPageData(trainNumber);
      if (ctData?.stations && ctData.stations.length > 0) {
        schedule = {
          stationList: ctData.stations.map((st) => ({
            stationCode: st.stationCode,
            stationName: st.stationName,
            arrivalTime: st.arrivalTime || "",
            departureTime: st.departureTime || "",
            distanceKm: st.distance != null ? Number(st.distance) : undefined,
          })),
        };
      }
    } catch {
      // Fallback silently if chart times data is unavailable
    }
  }

  const trainInfo: TrainInfo = {
    trainNumber,
    trainName: displayName,
    originStation: origin,
    destinationStation: dest,
    availableClasses: train?.availableClasses || [],
    departureTime: train?.departureTime,
    arrivalTime: train?.arrivalTime,
    schedule,
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
      <Suspense
        fallback={
          <div className="shadow-xs animate-pulse rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="mb-4 h-6 w-1/3 rounded bg-slate-200"></div>
            <div className="mb-8 h-10 w-2/3 rounded bg-slate-100"></div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl border border-slate-200/60 bg-slate-50 p-4"
                ></div>
              ))}
            </div>
          </div>
        }
      >
        <TrainConfirmedTicketsClient
          trainInfo={trainInfo}
          slug={canonicalSlug}
          cachedSeats={cachedSeats}
          chartTimesSlug={local?.chartTimesSlug ?? null}
          faqEntries={faqEntries}
        />
      </Suspense>
    </>
  );
}
