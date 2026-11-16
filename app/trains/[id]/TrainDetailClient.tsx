"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { getStationByCodeOrName, isPublishedRoute } from "@/lib/seo/routes-db";
import { parseTrainNumberFromSlug } from "@/lib/chartTimesSlug";
import {
  Train as TrainIcon,
  Clock,
  Calendar,
  MapPin,
  ArrowRight,
  Zap,
  ChevronDown,
  Search,
  Share2,
  Ticket,
  CheckCircle2,
  Check,
  Utensils,
  Armchair,
  List,
  Table as TableIcon,
  X,
  ExternalLink,
  Radio,
  PhoneCall,
  MessageSquare,
} from "lucide-react";

export type ScheduleStation = {
  stationCode: string;
  stationName: string;
  arrivalTime?: string;
  departureTime?: string;
  haltMinutes?: string;
  distance?: string | number;
  day?: number;
  expectedPlatformNo?: string;
};

export type TrainRunsOn = {
  trainRunsOnMon?: string;
  trainRunsOnTue?: string;
  trainRunsOnWed?: string;
  trainRunsOnThu?: string;
  trainRunsOnFri?: string;
  trainRunsOnSat?: string;
  trainRunsOnSun?: string;
};

export type Train = {
  id: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
  chartRules: {
    stationCode: string;
    chartTimeLocal: string;
    sequenceNumber: number;
    predictionProbability: number;
    avgBerthsReleased: number;
    optimalWindowStart: string;
    optimalWindowEnd: string;
  }[];
  schedule?: {
    trainNumber: string;
    trainName: string;
    stationFrom: string;
    stationTo: string;
    stationList: ScheduleStation[];
    trainRunsOn?: TrainRunsOn;
  };
};

export type StationChartMap = Record<
  string,
  { chartOne: string | null; chartTwo: string | null }
>;

export type LocalTrainMeta = {
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
};

type Props = {
  initialTrainData: Train | null;
  chartTimesSlug?: string | null;
  localTrain?: LocalTrainMeta | null;
  stationChartTimes?: StationChartMap | null;
  foodMenuUrl?: string | null;
  catalogClasses?: string[] | null;
  catalogTrainType?: string | null;
};

const DAY_KEYS = [
  ["Mon", "trainRunsOnMon"],
  ["Tue", "trainRunsOnTue"],
  ["Wed", "trainRunsOnWed"],
  ["Thu", "trainRunsOnThu"],
  ["Fri", "trainRunsOnFri"],
  ["Sat", "trainRunsOnSat"],
  ["Sun", "trainRunsOnSun"],
] as const;

const CLASS_INFO: Record<string, { name: string; desc: string }> = {
  "1A": {
    name: "First AC Sleeper",
    desc: "Lockable 2-berth & 4-berth cabins with attendant service and luxury bedding.",
  },
  "2A": {
    name: "AC 2-Tier Sleeper",
    desc: "Curtained berths with personal reading lights, charging ports, and linen.",
  },
  "3A": {
    name: "AC 3-Tier Sleeper",
    desc: "Air-conditioned 3-tier berths equipped with reading lamps and charging sockets.",
  },
  "3E": {
    name: "3 AC Economy",
    desc: "Modern high-capacity air-conditioned berths with personal conveniences.",
  },
  EC: {
    name: "Executive Chair Car",
    desc: "Spacious 2x2 luxury seating with ample legroom and priority catering.",
  },
  CC: {
    name: "AC Chair Car",
    desc: "Comfortable 3x2 air-conditioned seating with fold-down meal trays.",
  },
  EA: {
    name: "Executive Anubhuti",
    desc: "Aircraft-style luxury recline seats with footrests and entertainment screens.",
  },
  SL: {
    name: "Sleeper Class",
    desc: "Standard reserved non-air-conditioned sleeper berths for economical travel.",
  },
  "2S": {
    name: "Second Seating",
    desc: "Reserved non-AC chair car seating suitable for intercity daytime journeys.",
  },
};

function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

function calculateChartOffset(
  depTime?: string | null,
  chartTime?: string | null,
): string | null {
  const depMins = parseTimeToMinutes(depTime);
  const chartMins = parseTimeToMinutes(chartTime);
  if (depMins == null || chartMins == null) return null;

  let diff = depMins - chartMins;
  if (diff < 0) diff += 24 * 60;
  if (diff <= 0) return null;

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours === 0) return `~${mins}m before dep`;
  if (mins === 0) return `~${hours}h before dep`;
  if (mins >= 20 && mins <= 40) return `~${hours}.5h before dep`;
  return `~${hours}h ${mins}m before dep`;
}

function formatMinutes(totalMins: number): string {
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim();
}

export default function TrainDetailClient({
  initialTrainData,
  chartTimesSlug = null,
  localTrain = null,
  stationChartTimes = null,
  foodMenuUrl = null,
  catalogClasses = null,
  catalogTrainType = null,
}: Props) {
  const params = useParams();
  const [clientTrain, setClientTrain] = useState<Train | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");
  const [stationQuery, setStationQuery] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const rawId = typeof params?.id === "string" ? params.id : null;
  const trainNumber = rawId ? (parseTrainNumberFromSlug(rawId) ?? rawId) : null;

  useEffect(() => {
    if (!initialTrainData && !clientTrain && trainNumber) {
      let cancelled = false;
      apiClient
        .get<Train>(`/api/trains/${trainNumber}`)
        .then((r) => {
          if (!cancelled && r.data) setClientTrain(r.data);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [initialTrainData, clientTrain, trainNumber]);

  const train: Train | null =
    clientTrain ??
    initialTrainData ??
    (localTrain
      ? {
          id: localTrain.trainNumber,
          trainNumber: localTrain.trainNumber,
          trainName: localTrain.trainName,
          originStation: localTrain.originStation,
          destinationStation: localTrain.destinationStation,
          chartRules: [],
        }
      : null);

  const stationList = useMemo(
    () => train?.schedule?.stationList ?? [],
    [train?.schedule?.stationList],
  );

  const filteredStations = useMemo(() => {
    const q = stationQuery.toLowerCase().trim();
    if (!q) return stationList;
    return stationList.filter(
      (s) =>
        s.stationName.toLowerCase().includes(q) ||
        s.stationCode.toLowerCase().includes(q),
    );
  }, [stationList, stationQuery]);

  const originStation =
    stationList[0]?.stationName || train?.originStation || "Source";
  const originCode =
    stationList[0]?.stationCode || train?.originStation || "SRC";
  const destStation =
    stationList[stationList.length - 1]?.stationName ||
    train?.destinationStation ||
    "Destination";
  const destCode =
    stationList[stationList.length - 1]?.stationCode ||
    train?.destinationStation ||
    "DEST";

  const firstDeparture = stationList[0]?.departureTime;
  const lastArrival = stationList[stationList.length - 1]?.arrivalTime;
  const daysDiff = Math.max(
    0,
    (stationList[stationList.length - 1]?.day ?? 1) -
      (stationList[0]?.day ?? 1),
  );

  const totalMinutes = useMemo(() => {
    const dep = parseTimeToMinutes(firstDeparture);
    const arr = parseTimeToMinutes(lastArrival);
    if (dep == null || arr == null) return null;
    let mins = arr - dep + daysDiff * 24 * 60;
    if (mins <= 0) mins += 24 * 60;
    return mins;
  }, [firstDeparture, lastArrival, daysDiff]);

  const totalDuration = totalMinutes ? formatMinutes(totalMinutes) : null;

  const lastDistance = stationList[stationList.length - 1]?.distance;
  const totalDistanceKm =
    lastDistance != null ? Math.round(Number(lastDistance)) : null;

  const averageSpeedKmH =
    totalDistanceKm && totalMinutes && totalMinutes > 0
      ? Math.round(totalDistanceKm / (totalMinutes / 60))
      : null;

  const runsOn = train?.schedule?.trainRunsOn;
  const dayFlags = DAY_KEYS.map(([label, key]) => ({
    label,
    active: !runsOn || runsOn[key] === "Y" || runsOn[key] === "1",
  }));
  const runsPerWeek = dayFlags.filter((d) => d.active).length;

  const originChartTimes = stationChartTimes?.[originCode];
  const firstChartTime =
    originChartTimes?.chartOne ||
    train?.chartRules?.[0]?.chartTimeLocal ||
    null;
  const secondChartTime =
    originChartTimes?.chartTwo ||
    train?.chartRules?.[0]?.optimalWindowEnd ||
    null;

  const firstChartOffset = calculateChartOffset(firstDeparture, firstChartTime);

  const trainNameLower = train?.trainName?.toLowerCase() ?? "";
  const isVandeBharat = trainNameLower.includes("vande bharat");
  const isVandeBharatSleeper =
    isVandeBharat &&
    (trainNameLower.includes("sleeper") ||
      catalogTrainType === "Sleeper" ||
      train?.trainNumber?.startsWith("27"));
  const isShatabdi = trainNameLower.includes("shatabdi");
  const isRajdhani = trainNameLower.includes("rajdhani");
  const isGaribRath = trainNameLower.includes("garib rath");

  const categoryName = isVandeBharatSleeper
    ? "Vande Bharat Sleeper"
    : isVandeBharat
      ? "Vande Bharat Express"
      : isShatabdi
        ? "Shatabdi Express"
        : isRajdhani
          ? "Rajdhani Express"
          : isGaribRath
            ? "Garib Rath Express"
            : "Express Train";

  const categoryHub = isVandeBharat
    ? { name: "Vande Bharat Express", href: "/trains/vande-bharat" }
    : isShatabdi
      ? { name: "Shatabdi Express", href: "/trains/shatabdi" }
      : isRajdhani
        ? { name: "Rajdhani Express", href: "/trains/rajdhani" }
        : isGaribRath
          ? { name: "Garib Rath Express", href: "/trains/garib-rath" }
          : { name: "All Trains", href: "/chart-times" };

  const originSlug = getStationByCodeOrName(train?.originStation || "")?.slug;
  const destSlug = getStationByCodeOrName(
    train?.destinationStation || "",
  )?.slug;
  const routeSlug =
    originSlug && destSlug && isPublishedRoute(`${originSlug}-to-${destSlug}`)
      ? `${originSlug}-to-${destSlug}`
      : null;

  const classesList = useMemo(() => {
    let codes: string[] = [];
    if (catalogClasses && catalogClasses.length > 0) {
      codes = catalogClasses.map((c) =>
        c === "Sleeper"
          ? isVandeBharatSleeper
            ? ""
            : "SL"
          : c.trim().toUpperCase(),
      );
    } else if (isVandeBharatSleeper) {
      codes = ["1A", "2A", "3A"];
    } else if (isShatabdi || isVandeBharat) {
      codes = ["EC", "CC"];
    } else if (isRajdhani) {
      codes = ["1A", "2A", "3A"];
    } else if (isGaribRath) {
      codes = ["3A"];
    } else {
      codes = ["2A", "3A", "SL"];
    }

    const uniqueCodes = Array.from(new Set(codes.filter(Boolean))).filter(
      (c) => c !== "GN" && (!isVandeBharatSleeper || c !== "SL"),
    );

    return uniqueCodes.map((code) => ({
      code,
      name: CLASS_INFO[code]?.name || `${code} Class`,
      desc: CLASS_INFO[code]?.desc || "Reserved train accommodation.",
    }));
  }, [
    catalogClasses,
    isVandeBharatSleeper,
    isShatabdi,
    isVandeBharat,
    isRajdhani,
    isGaribRath,
  ]);

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${train?.trainName || "Train"} (${train?.trainNumber}) Timetable & Schedule`,
          text: `Check schedule, stops, Tatkal booking windows, and chart times for ${train?.trainName} (${train?.trainNumber}) on LastBerth.`,
          url,
        });
        return;
      } catch {
        // Fall back to clipboard
      }
    }
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!train) {
    return (
      <div className="shadow-xs space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <TrainIcon className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="text-lg font-bold text-slate-900">
          Train Details Unavailable
        </h2>
        <p className="mx-auto max-w-md text-sm text-slate-500">
          We could not load schedule details for this train. Please verify the
          train number or browse other routes.
        </p>
        <Link
          href="/trains/vande-bharat"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Browse All Trains
        </Link>
      </div>
    );
  }

  const primarySearchUrl = `/?from=${encodeURIComponent(originCode)}&to=${encodeURIComponent(destCode)}`;

  const faqs = [
    {
      q: `When is the reservation chart prepared for ${train.trainName}?`,
      a: firstChartTime
        ? `The first reservation chart for ${train.trainName} (${train.trainNumber}) is prepared at ${originStation} (${originCode}) around ${firstChartTime}${firstChartOffset ? ` (${firstChartOffset})` : ""}. The second and final chart is finalized 30 minutes before departure${secondChartTime ? ` (around ${secondChartTime})` : ""}, releasing remaining vacant berths for current booking (CURR_AVBL) at a 10% discount.`
        : `The first reservation chart is typically prepared 4 to 8 hours before departure from ${originStation} (${originCode}). The final chart is finalized 30 minutes prior to departure, releasing unoccupied berths under Current Availability.`,
    },
    {
      q: `When does Tatkal booking open for ${train.trainName} (${train.trainNumber})?`,
      a: `Tatkal booking opens daily on IRCTC one day prior to departure from originating station: 10:00 AM IST for AC classes (${classesList.map((c) => c.code).join(", ")}) and 11:00 AM IST for Non-AC classes.`,
    },
    {
      q: `What is the route and scheduled halts of ${train.trainName}?`,
      a: `${train.trainName} (${train.trainNumber}) operates from ${originStation} (${originCode}) to ${destStation} (${destCode}), covering ${totalDistanceKm ? `${totalDistanceKm} km` : "the route"} across ${stationList.length} scheduled stops in ${totalDuration || "scheduled travel time"}.`,
    },
    {
      q: `How do I check live GPS running status and platform arrivals?`,
      a: `Real-time GPS running status and platform arrival numbers are updated through official Indian Railways NTES channels: online at enquiry.indianrail.gov.in/mntes, via SMS by texting "SPOT ${train.trainNumber}" to 139, or by calling the 139 railway helpline.`,
    },
  ];

  return (
    <div className="space-y-5 pb-20 font-sans sm:space-y-6 sm:pb-8">
      {/* ── Breadcrumb & Share Action ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <nav
          className="flex items-center font-medium text-slate-500"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="transition-colors hover:text-emerald-600">
            Home
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <Link
            href={categoryHub.href}
            className="transition-colors hover:text-emerald-600"
          >
            {categoryHub.name}
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="max-w-[180px] truncate font-semibold text-slate-900 sm:max-w-xs">
            {train.trainName}
          </span>
        </nav>

        <button
          onClick={handleShare}
          type="button"
          aria-label="Share train timetable"
          className="shadow-2xs inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          {copiedLink ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-700">Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5 text-slate-500" />
              <span>Share</span>
            </>
          )}
        </button>
      </div>

      {/* ── 1. Compact Train Header & Route Summary Card ── */}
      <header className="shadow-xs space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              <Zap className="h-3.5 w-3.5 text-blue-600" />
              {categoryName}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {runsPerWeek === 7
                ? "Runs Daily"
                : runsPerWeek > 0
                  ? `Runs ${runsPerWeek} Days / Wk`
                  : "Scheduled Run"}
            </span>
          </div>

          <a
            href="https://enquiry.indianrail.gov.in/mntes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 transition-colors hover:text-blue-600"
          >
            <Radio className="h-3 w-3 text-emerald-600" />
            <span>Spot Live Train (NTES)</span>
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </a>
        </div>

        <div className="flex flex-wrap items-baseline gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            {train.trainName}
          </h1>
          <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-base font-bold text-slate-700 sm:text-lg">
            #{train.trainNumber}
          </span>
        </div>

        {/* Route Strip */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            {/* Origin */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Source
                </span>
                {firstDeparture && (
                  <span className="font-mono text-xs font-bold text-slate-800">
                    Departs {firstDeparture}
                  </span>
                )}
              </div>
              <p className="flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
                <span>{originStation}</span>
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">
                  {originCode}
                </span>
              </p>
            </div>

            {/* Travel Metrics */}
            <div className="flex items-center justify-around gap-2 border-y border-slate-200 py-2.5 sm:border-x sm:border-y-0 sm:px-4 sm:py-0">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Duration
                </p>
                <p className="font-mono text-sm font-bold text-slate-900">
                  {totalDuration || "—"}
                </p>
              </div>
              <div className="text-slate-300">➔</div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Distance
                </p>
                <p className="font-mono text-sm font-bold text-slate-900">
                  {totalDistanceKm ? `${totalDistanceKm} km` : "—"}
                </p>
              </div>
              <div className="text-slate-300">➔</div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Halts
                </p>
                <p className="font-mono text-sm font-bold text-slate-900">
                  {stationList.length} Stops
                </p>
              </div>
              {averageSpeedKmH && (
                <>
                  <div className="hidden text-slate-300 md:block">➔</div>
                  <div className="hidden text-center md:block">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Avg Speed
                    </p>
                    <p className="font-mono text-sm font-bold text-slate-900">
                      ~{averageSpeedKmH} km/h
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Destination */}
            <div className="space-y-0.5 sm:text-right">
              <div className="flex items-center gap-1.5 sm:justify-end">
                {lastArrival && (
                  <span className="font-mono text-xs font-bold text-slate-800">
                    Arrives {lastArrival}
                    {daysDiff > 0 ? ` (+${daysDiff}d)` : ""}
                  </span>
                )}
                <span className="rounded border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                  Destination
                </span>
              </div>
              <p className="flex items-center gap-2 text-base font-bold text-slate-900 sm:justify-end sm:text-lg">
                <span>{destStation}</span>
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">
                  {destCode}
                </span>
              </p>
            </div>
          </div>

          {routeSlug && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 text-xs">
              <span className="text-slate-500">
                Alternative trains on this corridor:
              </span>
              <Link
                href={`/routes/${routeSlug}`}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                <span>View all trains</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link
            href={primarySearchUrl}
            className="shadow-xs inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
          >
            <Ticket className="h-4 w-4" />
            <span>Find Confirmed Seats</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <Link
            href="/chart-vacancy"
            className="shadow-2xs inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Armchair className="h-4 w-4 text-emerald-600" />
            <span>Vacant Berth Map</span>
          </Link>

          {chartTimesSlug ? (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="shadow-2xs inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Clock className="h-4 w-4 text-amber-600" />
              <span>Chart Prep Times</span>
            </Link>
          ) : null}

          {foodMenuUrl && (
            <Link
              href={foodMenuUrl}
              className="shadow-2xs inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Utensils className="h-4 w-4 text-orange-600" />
              <span>Food Menu</span>
            </Link>
          )}
        </div>
      </header>

      {/* ── 2. Concrete Key Operational Facts (4 High-Density Tiles) ── */}
      <section
        aria-label="Operational Facts"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {/* Tile 1: 1st Chart Timing */}
        <div className="shadow-xs flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                1st Chart Prep
              </span>
              <Clock className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <p className="font-mono text-xl font-extrabold tracking-tight text-slate-900">
              {firstChartTime || "—"}
            </p>
            <p className="text-[11px] font-semibold text-emerald-700">
              {firstChartOffset || "~4h before dep"} • {originCode}
            </p>
          </div>
          <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-500">
            Waitlist status finalized &amp; initial berths allotted.
          </p>
        </div>

        {/* Tile 2: 2nd (Final) Chart */}
        <div className="shadow-xs flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                2nd (Final) Chart
              </span>
              <Zap className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <p className="font-mono text-xl font-extrabold tracking-tight text-slate-900">
              {secondChartTime || "—"}
            </p>
            <p className="text-[11px] font-semibold text-amber-700">
              ~30 mins before dep
            </p>
          </div>
          <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-500">
            Vacant berths released for current booking at 10% off.
          </p>
        </div>

        {/* Tile 3: Tatkal Window */}
        <div className="shadow-xs flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Tatkal Window
              </span>
              <Ticket className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <p className="font-mono text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
              10:00 AM{" "}
              <span className="text-xs font-normal text-slate-500">AC</span>
            </p>
            <p className="text-[11px] font-semibold text-blue-700">
              11:00 AM Non-AC • 1d prior
            </p>
          </div>
          <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-500">
            Opens daily on IRCTC one day before departure.
          </p>
        </div>

        {/* Tile 4: Operating Days */}
        <div className="shadow-xs flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Operating Days
              </span>
              <Calendar className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {dayFlags.map((d) => (
                <span
                  key={d.label}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    d.active
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-400 opacity-50"
                  }`}
                >
                  {d.label}
                </span>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-slate-700">
              {runsPerWeek === 7
                ? "Runs all 7 days"
                : runsPerWeek > 0
                  ? `${runsPerWeek} days a week`
                  : "Special schedule"}
            </p>
          </div>
          <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-500">
            Scheduled timetable running with signal priority.
          </p>
        </div>
      </section>

      {/* ── 3. Interactive Route & Timetable ── */}
      <section aria-labelledby="timetable-heading" className="space-y-3.5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2
              id="timetable-heading"
              className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl"
            >
              <span>{train.trainName} Timetable</span>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">
                {stationList.length} Stops
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Station arrival, departure, halt minutes, expected platform, and
              chart timings.
            </p>
          </div>

          <div className="inline-flex self-start rounded-xl border border-slate-200/80 bg-slate-100 p-1 sm:self-auto">
            <button
              onClick={() => setViewMode("table")}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                viewMode === "table"
                  ? "shadow-2xs bg-white text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                viewMode === "timeline"
                  ? "shadow-2xs bg-white text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Timeline</span>
            </button>
          </div>
        </div>

        {stationList.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
              placeholder="Search stations by name or code (e.g. Pune, PUNE, Kalyan, KYN)..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {stationQuery && (
              <button
                onClick={() => setStationQuery("")}
                type="button"
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {stationList.length === 0 ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <TrainIcon className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              Schedule details for {train.trainName} (#{train.trainNumber}) are
              being updated.
            </p>
            <p className="mx-auto max-w-sm text-xs text-slate-500">
              Check chart preparation rules or search for direct trains between{" "}
              {originStation} and {destStation}.
            </p>
            <div className="flex justify-center gap-3 pt-1">
              <Link
                href={primarySearchUrl}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Search Tickets
              </Link>
              {chartTimesSlug && (
                <Link
                  href={`/chart-times/${chartTimesSlug}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Chart Prep Times
                </Link>
              )}
            </div>
          </div>
        ) : filteredStations.length === 0 ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No stations match &ldquo;{stationQuery}&rdquo;
            </p>
            <button
              onClick={() => setStationQuery("")}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Clear search filter
            </button>
          </div>
        ) : viewMode === "table" ? (
          /* ── Table View ── */
          <div className="shadow-xs overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[620px] border-collapse text-left sm:min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="hidden w-10 px-3 py-3 text-center sm:table-cell">
                    #
                  </th>
                  <th className="px-3 py-3">Station</th>
                  <th className="px-2.5 py-3 text-center">Arr</th>
                  <th className="px-2.5 py-3 text-center">Dep</th>
                  <th className="px-2.5 py-3 text-center">Halt</th>
                  <th className="px-2.5 py-3 text-center">PF</th>
                  <th className="hidden px-2.5 py-3 text-center md:table-cell">
                    Dist
                  </th>
                  <th className="hidden px-2 py-3 text-center sm:table-cell">
                    Day
                  </th>
                  <th className="px-2.5 py-3 text-right">1st Chart</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredStations.map((station, idx) => {
                  const isOrigin = station.stationCode === originCode;
                  const isDestination = station.stationCode === destCode;
                  const chartInfo = stationChartTimes?.[station.stationCode];
                  const stationChartOne =
                    chartInfo?.chartOne ?? (isOrigin ? firstChartTime : null);
                  const haltMins = station.haltMinutes;
                  const hasLongHalt = haltMins && parseInt(haltMins, 10) >= 5;

                  return (
                    <tr
                      key={station.stationCode}
                      className="group transition-colors hover:bg-blue-50/40"
                    >
                      <td className="hidden px-3 py-2.5 text-center font-mono text-xs font-bold text-slate-400 group-hover:text-blue-600 sm:table-cell">
                        {idx + 1}
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600">
                          {station.stationName}
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                          <span className="py-0.2 rounded border border-slate-200 bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-700">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="py-0.2 rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-bold uppercase text-emerald-700">
                              Source
                            </span>
                          )}
                          {isDestination && (
                            <span className="py-0.2 rounded border border-rose-200 bg-rose-50 px-1 text-[10px] font-bold uppercase text-rose-700">
                              Dest
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-2.5 py-2.5 text-center font-mono text-xs font-semibold text-slate-800">
                        {isOrigin ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.arrivalTime || "—"
                        )}
                      </td>

                      <td className="px-2.5 py-2.5 text-center font-mono text-xs font-semibold text-slate-800">
                        {isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.departureTime || "—"
                        )}
                      </td>

                      <td className="px-2.5 py-2.5 text-center">
                        {isOrigin || isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : haltMins && haltMins !== "0m" ? (
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                              hasLongHalt
                                ? "border border-amber-200 bg-amber-50 text-amber-700"
                                : "text-blue-700"
                            }`}
                          >
                            {haltMins}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Pass</span>
                        )}
                      </td>

                      <td className="px-2.5 py-2.5 text-center font-mono text-xs font-semibold text-amber-700">
                        {station.expectedPlatformNo &&
                        station.expectedPlatformNo !== "0" &&
                        station.expectedPlatformNo !== "" ? (
                          <span>PF {station.expectedPlatformNo}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="hidden px-2.5 py-2.5 text-center font-mono text-xs text-slate-600 md:table-cell">
                        {station.distance != null
                          ? `${station.distance} km`
                          : "0 km"}
                      </td>

                      <td className="hidden px-2 py-2.5 text-center font-mono text-xs text-slate-600 sm:table-cell">
                        D{station.day ?? 1}
                      </td>

                      <td className="px-2.5 py-2.5 text-right font-mono text-xs font-semibold text-slate-800">
                        {stationChartOne || "—"}
                      </td>

                      <td className="px-3 py-2.5 text-right">
                        {!isDestination ? (
                          <Link
                            href={`/?from=${encodeURIComponent(station.stationCode)}&to=${encodeURIComponent(destCode)}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <span>Book</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Timeline View ── */
          <div className="shadow-xs rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="relative space-y-4 pl-6 before:absolute before:bottom-3 before:left-2.5 before:top-3 before:w-0.5 before:bg-slate-200 sm:pl-8 sm:before:left-3">
              {filteredStations.map((station, idx) => {
                const isOrigin = station.stationCode === originCode;
                const isDestination = station.stationCode === destCode;
                const chartInfo = stationChartTimes?.[station.stationCode];
                const stationChartOne =
                  chartInfo?.chartOne ?? (isOrigin ? firstChartTime : null);
                const haltMins = station.haltMinutes;

                return (
                  <div key={station.stationCode} className="group relative">
                    <div
                      className={`absolute -left-6 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold sm:-left-8 sm:h-6 sm:w-6 ${
                        isOrigin
                          ? "bg-emerald-600 text-white"
                          : isDestination
                            ? "bg-rose-600 text-white"
                            : "border border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {isOrigin ? (
                        <MapPin className="h-3 w-3" />
                      ) : isDestination ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-colors hover:border-blue-200 hover:bg-white">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 group-hover:text-blue-600">
                            {station.stationName}
                          </h3>
                          <span className="py-0.2 rounded border border-slate-200 bg-white px-1.5 font-mono text-xs font-bold text-slate-700">
                            {station.stationCode}
                          </span>
                          {station.expectedPlatformNo &&
                          station.expectedPlatformNo !== "0" &&
                          station.expectedPlatformNo !== "" ? (
                            <span className="py-0.2 rounded border border-amber-200 bg-amber-50 px-1.5 font-mono text-[11px] font-bold text-amber-700">
                              PF {station.expectedPlatformNo}
                            </span>
                          ) : null}
                          {isOrigin && (
                            <span className="py-0.2 rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-bold uppercase text-emerald-700">
                              Source
                            </span>
                          )}
                          {isDestination && (
                            <span className="py-0.2 rounded border border-rose-200 bg-rose-50 px-1 text-[10px] font-bold uppercase text-rose-700">
                              Destination
                            </span>
                          )}
                        </div>

                        {!isDestination && (
                          <Link
                            href={`/?from=${encodeURIComponent(station.stationCode)}&to=${encodeURIComponent(destCode)}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <span>Book to {destCode}</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
                        <span>
                          Arr:{" "}
                          <strong className="font-mono text-slate-900">
                            {isOrigin ? "Origin" : station.arrivalTime || "—"}
                          </strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>
                          Dep:{" "}
                          <strong className="font-mono text-slate-900">
                            {isDestination
                              ? "Terminus"
                              : station.departureTime || "—"}
                          </strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>
                          Halt:{" "}
                          <strong className="font-mono text-slate-900">
                            {isOrigin || isDestination
                              ? "—"
                              : haltMins || "Pass"}
                          </strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>
                          Day {station.day ?? 1} (
                          {station.distance != null
                            ? `${station.distance} km`
                            : "0 km"}
                          )
                        </span>
                        {stationChartOne && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>
                              Chart:{" "}
                              <strong className="font-mono text-slate-900">
                                {stationChartOne}
                              </strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── 4. Travel Classes & Facilities ── */}
      <section aria-labelledby="classes-heading" className="space-y-3">
        <h2
          id="classes-heading"
          className="text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl"
        >
          Travel Classes &amp; Onboard Amenities
        </h2>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {classesList.map((cls) => (
            <div
              key={cls.code}
              className="shadow-xs space-y-1 rounded-xl border border-slate-200 bg-white p-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-sm font-extrabold text-blue-700">
                  {cls.code}
                </span>
                <Armchair className="h-4 w-4 text-slate-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">{cls.name}</h3>
              <p className="text-xs leading-relaxed text-slate-500">
                {cls.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Utensils className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Catering &amp; Dining Available
              </p>
              <p className="text-xs text-slate-600">
                Fresh meals, refreshments, and packaged drinking water available
                onboard for this train.
              </p>
            </div>
          </div>
          {foodMenuUrl && (
            <Link
              href={foodMenuUrl}
              className="shadow-2xs inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-50"
            >
              <span>View Food Menu</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </section>

      {/* ── 5. Real-Time Tracking Channels ── */}
      <section
        aria-labelledby="live-status-heading"
        className="shadow-xs space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <div>
          <h2
            id="live-status-heading"
            className="flex items-center gap-2 text-base font-extrabold tracking-tight text-slate-950 sm:text-lg"
          >
            <Radio className="h-4 w-4 text-emerald-600" />
            <span>Official Live Tracking &amp; Railway Helpline</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Official Indian Railways channels for live GPS tracking, platform
            updates, and enquiries:
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <a
            href="https://enquiry.indianrail.gov.in/mntes"
            target="_blank"
            rel="noopener noreferrer"
            className="shadow-2xs group flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  NTES Web Portal
                </span>
                <ExternalLink className="h-3.5 w-3.5 transition-colors group-hover:text-emerald-600" />
              </div>
              <p className="mt-1 text-xs font-bold text-slate-900">
                enquiry.indianrail.gov.in
              </p>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Spot your train live on official portal.
            </p>
          </a>

          <div className="shadow-2xs flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  SMS 139 (Offline)
                </span>
                <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <p className="mt-1 font-mono text-xs font-bold text-slate-900">
                SPOT {train.trainNumber} to 139
              </p>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Instant reply with delay and current station.
            </p>
          </div>

          <div className="shadow-2xs flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Helpline / App
                </span>
                <PhoneCall className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <p className="mt-1 text-xs font-bold text-slate-900">
                Call 139 / IRCTC Rail Connect
              </p>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              IVR status &amp; platform information.
            </p>
          </div>
        </div>
      </section>

      {/* ── 6. Dynamic Frequently Asked Questions ── */}
      <section aria-labelledby="faq-heading" className="space-y-3">
        <h2
          id="faq-heading"
          className="text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl"
        >
          Frequently Asked Questions
        </h2>

        <div className="shadow-xs divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {faqs.map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={item.q} className="p-4 transition-colors">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="group flex w-full items-center justify-between gap-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="mt-2.5 border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 7. Mobile Sticky Bottom Quick-Action Bar ── */}
      <aside
        aria-label="Quick Actions"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md sm:hidden"
      >
        <div className="truncate">
          <p className="truncate text-xs font-bold text-slate-900">
            {train.trainName}
          </p>
          <p className="font-mono text-[10px] text-slate-500">
            #{train.trainNumber} • {originCode} ➔ {destCode}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/chart-vacancy"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Vacancy
          </Link>
          <Link
            href={primarySearchUrl}
            className="shadow-xs rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
          >
            Find Seats
          </Link>
        </div>
      </aside>
    </div>
  );
}
