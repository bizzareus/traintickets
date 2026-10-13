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
  ShieldCheck,
  Zap,
  ChevronDown,
  Search,
  Share2,
  Ticket,
  Coffee,
  CheckCircle2,
  Timer,
  Sparkles,
  Check,
  Utensils,
  Armchair,
  List,
  Table as TableIcon,
  Navigation,
  X,
  ExternalLink,
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

/** Seconds until the next daily HH:00 in IST (Asia/Kolkata), regardless of visitor's timezone. */
function secondsUntilISTHour(hour: number): number {
  const now = new Date();
  const istNow = new Date(
    now.getTime() + (330 + now.getTimezoneOffset()) * 60_000,
  );
  const target = new Date(istNow);
  target.setHours(hour, 0, 0, 0);
  if (istNow.getTime() >= target.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.max(0, Math.floor((target.getTime() - istNow.getTime()) / 1000));
}

function formatSeconds(totalSecs: number) {
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return `${hrs.toString().padStart(2, "0")}h : ${mins
    .toString()
    .padStart(2, "0")}m : ${secs.toString().padStart(2, "0")}s`;
}

function calculateTotalDuration(
  firstDep?: string,
  lastArr?: string,
  daysDiff = 0,
): string | null {
  if (!firstDep || !lastArr) return null;
  const [dh, dm] = firstDep.split(":").map(Number);
  const [ah, am] = lastArr.split(":").map(Number);
  if (isNaN(dh) || isNaN(dm) || isNaN(ah) || isNaN(am)) return null;
  let totalMinutes = ah * 60 + am - (dh * 60 + dm) + daysDiff * 24 * 60;
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim();
}

export default function TrainDetailClient({
  initialTrainData,
  chartTimesSlug = null,
  localTrain = null,
  stationChartTimes = null,
}: {
  initialTrainData: Train | null;
  chartTimesSlug?: string | null;
  localTrain?: LocalTrainMeta | null;
  stationChartTimes?: StationChartMap | null;
}) {
  const params = useParams();
  const [clientTrain, setClientTrain] = useState<Train | null>(null);

  const [secondsUntilAC, setSecondsUntilAC] = useState(0);
  const [secondsUntilNonAC, setSecondsUntilNonAC] = useState(0);

  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [stationQuery, setStationQuery] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Live countdown to daily IST Tatkal windows: 10 AM (AC), 11 AM (Non-AC)
  useEffect(() => {
    const updateCountdown = () => {
      setSecondsUntilAC(secondsUntilISTHour(10));
      setSecondsUntilNonAC(secondsUntilISTHour(11));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Client-side fetch fallback if initialTrainData was not loaded on server
  useEffect(() => {
    const rawId = typeof params?.id === "string" ? params.id : null;
    const trainNumber = rawId
      ? (parseTrainNumberFromSlug(rawId) ?? rawId)
      : null;
    if (!initialTrainData && !clientTrain && trainNumber) {
      apiClient
        .get<Train>(`/api/trains/${trainNumber}`)
        .then((r) => setClientTrain(r.data))
        .catch(() => setClientTrain(null));
    }
  }, [params?.id, initialTrainData, clientTrain]);

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
    if (!stationQuery.trim()) return stationList;
    const q = stationQuery.toLowerCase().trim();
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
  const totalDuration = calculateTotalDuration(
    firstDeparture,
    lastArrival,
    daysDiff,
  );

  const lastDistance = stationList[stationList.length - 1]?.distance;
  const totalDistanceKm =
    lastDistance != null ? Math.round(Number(lastDistance)) : null;

  // Average speed
  const averageSpeedKmH = useMemo(() => {
    if (!totalDistanceKm || !firstDeparture || !lastArrival) return null;
    const [dh, dm] = firstDeparture.split(":").map(Number);
    const [ah, am] = lastArrival.split(":").map(Number);
    if (isNaN(dh) || isNaN(dm) || isNaN(ah) || isNaN(am)) return null;
    let mins = ah * 60 + am - (dh * 60 + dm) + daysDiff * 24 * 60;
    if (mins <= 0) mins += 24 * 60;
    const hrs = mins / 60;
    return hrs > 0 ? Math.round(totalDistanceKm / hrs) : null;
  }, [totalDistanceKm, firstDeparture, lastArrival, daysDiff]);

  // Running days
  const runsOn = train?.schedule?.trainRunsOn;
  const dayFlags = runsOn
    ? [
        { label: "Mon", active: runsOn.trainRunsOnMon === "Y" },
        { label: "Tue", active: runsOn.trainRunsOnTue === "Y" },
        { label: "Wed", active: runsOn.trainRunsOnWed === "Y" },
        { label: "Thu", active: runsOn.trainRunsOnThu === "Y" },
        { label: "Fri", active: runsOn.trainRunsOnFri === "Y" },
        { label: "Sat", active: runsOn.trainRunsOnSat === "Y" },
        { label: "Sun", active: runsOn.trainRunsOnSun === "Y" },
      ]
    : [
        { label: "Mon", active: true },
        { label: "Tue", active: true },
        { label: "Wed", active: true },
        { label: "Thu", active: true },
        { label: "Fri", active: true },
        { label: "Sat", active: true },
        { label: "Sun", active: true },
      ];
  const runsPerWeek = dayFlags.filter((d) => d.active).length;

  // Origin chart time
  const originChartTimes = stationChartTimes?.[originCode];
  const firstChartTime =
    originChartTimes?.chartOne ||
    train?.chartRules?.[0]?.chartTimeLocal ||
    "21:26";
  const secondChartTime = originChartTimes?.chartTwo || "05:55";

  // Check if route has dedicated route page
  const originSlug = getStationByCodeOrName(train?.originStation || "")?.slug;
  const destSlug = getStationByCodeOrName(
    train?.destinationStation || "",
  )?.slug;
  const routeSlug =
    originSlug && destSlug && isPublishedRoute(`${originSlug}-to-${destSlug}`)
      ? `${originSlug}-to-${destSlug}`
      : null;

  // Train category & classes
  const isShatabdi =
    train?.trainName?.toLowerCase().includes("shatabdi") ?? false;
  const isRajdhani =
    train?.trainName?.toLowerCase().includes("rajdhani") ?? false;
  const isVandeBharat =
    train?.trainName?.toLowerCase().includes("vande bharat") ?? false;

  const classes =
    isShatabdi || isVandeBharat
      ? [
          {
            code: "EC",
            name: "Executive Chair Car",
            desc: "2x2 luxury seating, spacious legroom, priority meals included",
          },
          {
            code: "CC",
            name: "AC Chair Car",
            desc: "3x2 ergonomic seating, folding tray table, power points",
          },
          {
            code: "EA",
            name: isVandeBharat ? "Executive Anubhuti" : "Anubhuti Coach",
            desc: "Aircraft-style luxury recline, footrest, LCD screen on select rakes",
          },
        ]
      : isRajdhani
        ? [
            {
              code: "1A",
              name: "First AC",
              desc: "Private lockable coupe/cabin, luxury bedding, complimentary meals",
            },
            {
              code: "2A",
              name: "Second AC",
              desc: "2-tier curtained berths, reading lamps, hot meals served",
            },
            {
              code: "3A",
              name: "Third AC",
              desc: "3-tier air-conditioned berths with linen and power sockets",
            },
          ]
        : [
            {
              code: "CC",
              name: "AC Chair Car",
              desc: "Comfortable air-conditioned intercity seating",
            },
            {
              code: "2S",
              name: "Second Seating",
              desc: "Reserved non-AC chair car seating for budget travel",
            },
          ];

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${train?.trainName || "Train"} (${train?.trainNumber}) Timetable & Chart Times`,
          text: `Check timetable, stops, Tatkal booking windows and chart preparation times for ${train?.trainName} (${train?.trainNumber}) on LastBerth.`,
          url,
        });
        return;
      } catch {
        // Fall back to clipboard copy
      }
    }
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!train) {
    return (
      <div className="shadow-xs space-y-3 rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <TrainIcon className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="text-lg font-bold text-slate-900">
          Train Details Unavailable
        </h2>
        <p className="mx-auto max-w-md text-sm text-slate-500">
          We could not load schedule details for this train. Please verify the
          train number or try again in a moment.
        </p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Browse All Trains
        </Link>
      </div>
    );
  }

  const primarySearchUrl = `/?from=${encodeURIComponent(originCode)}&to=${encodeURIComponent(destCode)}`;

  return (
    <div className="space-y-6 pb-24 font-sans sm:space-y-8 sm:pb-8">
      {/* ── Breadcrumb & Action Row ── */}
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
            href="/search"
            className="transition-colors hover:text-emerald-600"
          >
            Trains
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="max-w-[200px] truncate font-semibold text-slate-900 sm:max-w-xs">
            {train.trainName} ({train.trainNumber})
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
              <span>Share Timetable</span>
            </>
          )}
        </button>
      </div>

      {/* ── 1. Clean, Straightforward Header Card ── */}
      <header className="shadow-xs space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        {/* Eyebrow & Running Frequency */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            <Zap className="h-3.5 w-3.5 text-blue-600" />
            <span>IRCTC Schedule &amp; Timetable</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>
              {runsPerWeek === 7 ? "Runs Daily" : `${runsPerWeek} Days / Week`}
            </span>
          </div>
        </div>

        {/* Headline & Train Number */}
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl md:text-4xl">
            {train.trainName}
          </h1>
          <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-base font-bold text-slate-700 sm:text-lg">
            #{train.trainNumber}
          </span>
        </div>

        {/* Route Overview Arc */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            {/* Origin */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-emerald-200 bg-emerald-100/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-800">
                  Source
                </span>
                {firstDeparture && (
                  <span className="font-mono text-xs font-medium text-slate-600">
                    Departs {firstDeparture}
                  </span>
                )}
              </div>
              <p className="flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
                <span>{originStation}</span>
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700">
                  {originCode}
                </span>
              </p>
            </div>

            {/* Travel Metrics */}
            <div className="flex items-center gap-4 border-y border-slate-200 py-2 sm:border-x sm:border-y-0 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Duration
                </p>
                <p className="font-mono text-sm font-bold text-slate-900 sm:text-base">
                  {totalDuration || "7h 25m"}
                </p>
              </div>
              <div className="text-slate-300">➔</div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Distance
                </p>
                <p className="font-mono text-sm font-bold text-slate-900 sm:text-base">
                  {totalDistanceKm ? `${totalDistanceKm} km` : "450 km"}
                </p>
              </div>
              <div className="text-slate-300">➔</div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Stops
                </p>
                <p className="font-mono text-sm font-bold text-slate-900 sm:text-base">
                  {stationList.length || 11} Halts
                </p>
              </div>
            </div>

            {/* Destination */}
            <div className="space-y-1 sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
                {lastArrival && (
                  <span className="font-mono text-xs font-medium text-slate-600">
                    Arrives {lastArrival}
                  </span>
                )}
                <span className="rounded-md border border-rose-200 bg-rose-100/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-800">
                  Destination
                </span>
              </div>
              <p className="flex items-center gap-2 text-base font-bold text-slate-900 sm:justify-end sm:text-lg">
                <span>{destStation}</span>
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700">
                  {destCode}
                </span>
              </p>
            </div>
          </div>

          {/* Popular Route Crosslink */}
          {routeSlug && (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs">
              <span className="text-slate-600">
                Looking for other trains on this corridor?
              </span>
              <Link
                href={`/routes/${routeSlug}`}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                <span>See trains on this corridor</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {averageSpeedKmH && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
              <Navigation className="h-3.5 w-3.5 text-slate-500" />
              <span>Avg Speed ~{averageSpeedKmH} km/h</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
            <Utensils className="h-3.5 w-3.5 text-slate-500" />
            <span>Pantry / Food Available</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Verified Station Halts</span>
          </span>
        </div>
      </header>

      {/* ── 2. Focal UI Operational Data Cards (Real Numbers & Anxiety Relief) ── */}
      <section aria-label="Operational Highlights" className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          Key Operational Facts &amp; Chart Preparation Windows
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: 1st Chart Timing */}
          <div className="shadow-xs flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-300">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  1st Reservation Chart
                </span>
                <Clock className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="font-mono text-2xl font-extrabold tracking-tight text-slate-900">
                {firstChartTime}
              </p>
              <span className="inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                ~8.5 Hours Prior
              </span>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Prepared the previous evening at {originCode} (NDLS). Waitlist
              passengers get initial confirmation.
            </p>
          </div>

          {/* Card 2: 2nd Chart (Final Vacancy) */}
          <div className="shadow-xs flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-amber-300">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  2nd (Final) Chart
                </span>
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <p className="font-mono text-2xl font-extrabold tracking-tight text-slate-900">
                {secondChartTime}
              </p>
              <span className="inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                30 Mins Before Departure
              </span>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Final vacant berths released for current booking (
              <code className="text-[10px] font-semibold">CURR_AVBL</code>) at
              10% discount.
            </p>
          </div>

          {/* Card 3: Tatkal Window AC */}
          <div className="shadow-xs flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  AC Tatkal Window
                </span>
                <Timer className="h-4 w-4 text-blue-600" />
              </div>
              <p className="font-mono text-lg font-extrabold tabular-nums text-blue-700">
                {formatSeconds(secondsUntilAC)}
              </p>
              <span className="inline-block rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                Daily at 10:00 AM IST
              </span>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Executive Class (EC) &amp; Chair Car (CC) open 1 day before
              departure date.
            </p>
          </div>

          {/* Card 4: Operating Days & Service */}
          <div className="shadow-xs flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-indigo-300">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Operating Days
                </span>
                <Calendar className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="text-xl font-bold text-slate-900">
                {runsPerWeek === 7
                  ? "Daily Service"
                  : `${runsPerWeek} Days a Week`}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {dayFlags.map((d) => (
                  <span
                    key={d.label}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      d.active
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-400 opacity-40"
                    }`}
                  >
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Timetable remains fixed all 7 days with priority Shatabdi
              signaling.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. LastBerth Problem-Solving Action Hub ── */}
      <section
        aria-label="LastBerth Booking Tools"
        className="space-y-5 rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 p-6 sm:p-8"
      >
        <div className="max-w-2xl space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            <Ticket className="h-3.5 w-3.5" />
            <span>LastBerth Travel Solutions</span>
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
            Travelling on {train.trainName}? Bypass Waitlist Anxieties
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Don&apos;t get stranded on REGRET or long waiting lists. Use our
            proprietary tools to find hidden seat confirmations and vacant
            berths on {train.trainNumber}.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Action 1: Smart Seats */}
          <Link
            href={primarySearchUrl}
            className="shadow-2xs group flex flex-col justify-between rounded-2xl border border-white bg-white p-4 transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div className="space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-transform group-hover:scale-105">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                Find Confirmed Seats
              </h3>
              <p className="text-xs leading-relaxed text-slate-500">
                Smart split-tickets &amp; mid-station booking to guarantee your
                berth.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
              <span>Search Seats</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          {/* Action 2: Chart Vacancy Map */}
          <Link
            href="/chart-vacancy"
            className="shadow-2xs group flex flex-col justify-between rounded-2xl border border-white bg-white p-4 transition-all hover:border-emerald-300 hover:shadow-md"
          >
            <div className="space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-105">
                <Armchair className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-emerald-600">
                Vacant Berth Map
              </h3>
              <p className="text-xs leading-relaxed text-slate-500">
                Explore real-time coach-by-coach vacant seats after charting.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
              <span>View Berth Map</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          {/* Action 3: Station Chart Times */}
          {chartTimesSlug ? (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="shadow-2xs group flex flex-col justify-between rounded-2xl border border-white bg-white p-4 transition-all hover:border-amber-300 hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-transform group-hover:scale-105">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-amber-600">
                  Chart Preparation Times
                </h3>
                <p className="text-xs leading-relaxed text-slate-500">
                  Exact 1st &amp; 2nd chart preparation times for all 11
                  stations.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                <span>Station Timings</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : (
            <Link
              href="/chart-times"
              className="shadow-2xs group flex flex-col justify-between rounded-2xl border border-white bg-white p-4 transition-all hover:border-amber-300 hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-transform group-hover:scale-105">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-amber-600">
                  Chart Times Finder
                </h3>
                <p className="text-xs leading-relaxed text-slate-500">
                  Look up IRCTC vacancy chart preparation timings across India.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                <span>Browse Charts</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          )}

          {/* Action 4: Coach & Seat Lookup */}
          <Link
            href="/seat-status"
            className="shadow-2xs group flex flex-col justify-between rounded-2xl border border-white bg-white p-4 transition-all hover:border-purple-300 hover:shadow-md"
          >
            <div className="space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-transform group-hover:scale-105">
                <TrainIcon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-purple-600">
                Coach Journey Lookup
              </h3>
              <p className="text-xs leading-relaxed text-slate-500">
                Check coach layout, window seat arrangement, and train rake
                position.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-purple-600">
              <span>Seat Layout</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── 4. Mobile-Optimized Route & Timetable ── */}
      <section aria-labelledby="timetable-heading" className="space-y-4">
        {/* Header toolbar & controls */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2
              id="timetable-heading"
              className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-950"
            >
              <span>{train.trainName} Route &amp; Timetable</span>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">
                {stationList.length} Stops
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Station arrival, departure, halt minutes, expected platform &amp;
              chart timings.
            </p>
          </div>

          {/* View mode toggle */}
          <div className="inline-flex self-start rounded-xl border border-slate-200/80 bg-slate-100 p-1 sm:self-auto">
            <button
              onClick={() => setViewMode("timeline")}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === "timeline"
                  ? "shadow-2xs bg-white text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Timeline (Mobile)</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === "table"
                  ? "shadow-2xs bg-white text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table View</span>
            </button>
          </div>
        </div>

        {/* Station Filter / Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
            placeholder="Filter by station name or code (e.g. Jaipur, JP, Rewari, Alwar)..."
            className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          {stationQuery && (
            <button
              onClick={() => setStationQuery("")}
              type="button"
              aria-label="Clear station filter"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {filteredStations.length === 0 ? (
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
        ) : viewMode === "timeline" ? (
          /* ── 4A. Vertical Stop Timeline (Mobile-First Masterpiece) ── */
          <div className="shadow-xs rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
            <div className="relative space-y-6 pl-6 before:absolute before:bottom-4 before:left-3 before:top-4 before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-blue-500 before:to-rose-500 sm:pl-8 sm:before:left-4">
              {filteredStations.map((station, idx) => {
                const isOrigin = idx === 0 && !stationQuery;
                const isDestination =
                  idx === filteredStations.length - 1 && !stationQuery;
                const haltMins = station.haltMinutes;
                const hasLongHalt = haltMins && parseInt(haltMins, 10) >= 5;
                const chartInfo = stationChartTimes?.[station.stationCode];

                return (
                  <div key={station.stationCode} className="group relative">
                    {/* Node Indicator on the line */}
                    <div
                      className={`absolute -left-6 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-transform group-hover:scale-110 sm:-left-8 sm:h-7 sm:w-7 ${
                        isOrigin
                          ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                          : isDestination
                            ? "bg-rose-600 text-white ring-4 ring-rose-100"
                            : "border border-slate-300 bg-slate-100 text-slate-700 ring-2 ring-white"
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

                    {/* Station Content Card */}
                    <div className="hover:shadow-xs space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 transition-all hover:border-blue-200 hover:bg-white">
                      {/* Top Row: Station Name + Badges */}
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-extrabold text-slate-900 transition-colors group-hover:text-blue-600">
                            {station.stationName}
                          </h3>
                          <span className="shadow-2xs rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-100/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                              Source Station
                            </span>
                          )}
                          {isDestination && (
                            <span className="rounded-full border border-rose-200 bg-rose-100/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-700">
                              Destination
                            </span>
                          )}
                        </div>

                        {/* Expected Platform */}
                        {station.expectedPlatformNo &&
                        station.expectedPlatformNo !== "0" &&
                        station.expectedPlatformNo !== "" ? (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-700">
                            PF {station.expectedPlatformNo}
                          </span>
                        ) : null}
                      </div>

                      {/* Middle Row: Timings & Halt */}
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">
                            Arrival
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                            {isOrigin ? "Origin" : station.arrivalTime || "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">
                            Departure
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                            {isDestination
                              ? "Terminus"
                              : station.departureTime || "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">
                            Halt Duration
                          </p>
                          <p className="mt-0.5 text-sm font-bold">
                            {isOrigin || isDestination ? (
                              <span className="text-slate-400">—</span>
                            ) : haltMins ? (
                              <span
                                className={
                                  hasLongHalt
                                    ? "font-extrabold text-amber-600"
                                    : "text-blue-700"
                                }
                              >
                                {haltMins}
                              </span>
                            ) : (
                              <span className="text-slate-400">Passing</span>
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">
                            Distance
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                            {station.distance != null
                              ? `${station.distance} km`
                              : "0 km"}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: Charting & Book Link */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/50 pt-2 text-[11px]">
                        <div className="flex flex-wrap items-center gap-2 text-slate-500">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>
                            1st Chart:{" "}
                            <strong className="font-mono text-slate-700">
                              {chartInfo?.chartOne || firstChartTime}
                            </strong>
                          </span>
                          {chartInfo?.chartTwo && (
                            <>
                              <span>•</span>
                              <span>
                                2nd Chart:{" "}
                                <strong className="font-mono text-slate-700">
                                  {chartInfo.chartTwo}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>

                        {!isDestination && (
                          <Link
                            href={`/?from=${encodeURIComponent(station.stationCode)}&to=${encodeURIComponent(destCode)}`}
                            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <span>Book from {station.stationCode}</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── 4B. Full Responsive Spreadsheet Table ── */
          <div className="shadow-xs overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="w-12 px-4 py-3.5 text-center">#</th>
                  <th className="px-4 py-3.5">Station</th>
                  <th className="px-4 py-3.5 text-center">Arrival</th>
                  <th className="px-4 py-3.5 text-center">Departure</th>
                  <th className="px-4 py-3.5 text-center">Halt</th>
                  <th className="px-4 py-3.5 text-center">Platform</th>
                  <th className="px-4 py-3.5 text-center">Distance</th>
                  <th className="px-4 py-3.5 text-right">Chart Preparation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredStations.map((station, idx) => {
                  const isOrigin = idx === 0 && !stationQuery;
                  const isDestination =
                    idx === filteredStations.length - 1 && !stationQuery;
                  const chartInfo = stationChartTimes?.[station.stationCode];

                  return (
                    <tr
                      key={station.stationCode}
                      className="group transition-colors hover:bg-blue-50/40"
                    >
                      <td className="px-4 py-3 text-center font-mono text-xs font-bold text-slate-400 group-hover:text-blue-600">
                        {idx + 1}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                          {station.stationName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-slate-500">
                          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                              Source
                            </span>
                          )}
                          {isDestination && (
                            <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-700">
                              Dest
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-medium text-slate-700">
                        {isOrigin ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.arrivalTime || "—"
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-medium text-slate-700">
                        {isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.departureTime || "—"
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {isOrigin || isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : station.haltMinutes &&
                          station.haltMinutes !== "0m" ? (
                          <span className="inline-block rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                            {station.haltMinutes}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Passing
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-semibold text-amber-700">
                        {station.expectedPlatformNo &&
                        station.expectedPlatformNo !== "0" &&
                        station.expectedPlatformNo !== "" ? (
                          <span>PF {station.expectedPlatformNo}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">
                        {station.distance != null
                          ? `${station.distance} km`
                          : "0 km"}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs">
                        <span className="font-semibold text-slate-900">
                          {chartInfo?.chartOne || firstChartTime}
                        </span>
                        {chartInfo?.chartTwo && (
                          <span className="block text-[10px] text-slate-400">
                            2nd: {chartInfo.chartTwo}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 5. Travel Classes & Onboard Facilities ── */}
      <section aria-labelledby="classes-heading" className="space-y-4">
        <div>
          <h2
            id="classes-heading"
            className="text-2xl font-extrabold tracking-tight text-slate-950"
          >
            Travel Classes &amp; Onboard Experience
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Seating configurations, luggage room, and catering options available
            on {train.trainName}.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {classes.map((cls) => (
            <div
              key={cls.code}
              className="shadow-xs flex flex-col justify-between space-y-3 rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-lg font-extrabold text-blue-600">
                    {cls.code}
                  </span>
                  <Armchair className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {cls.name}
                </h3>
                <p className="text-xs leading-relaxed text-slate-500">
                  {cls.desc}
                </p>
              </div>

              <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>IRCTC Certified Rake</span>
              </div>
            </div>
          ))}
        </div>

        {/* Catering banner */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Catering &amp; Dining on {train.trainName}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                Passengers can opt for catering at the time of booking. Fresh
                morning tea/coffee, breakfast, and Rail Neer water bottle are
                served at your seat.
              </p>
            </div>
          </div>
          <Link
            href="/irctc-train-food-menu"
            className="shadow-2xs inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-50 sm:self-auto"
          >
            <span>View IRCTC Food Menu</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ── 6. Tatkal Booking Timing Guide ── */}
      <section
        aria-labelledby="tatkal-heading"
        className="shadow-xs space-y-5 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
      >
        <div className="max-w-2xl space-y-1">
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-600">
            Tatkal Reservation Rules
          </span>
          <h2
            id="tatkal-heading"
            className="text-2xl font-extrabold tracking-tight text-slate-950"
          >
            Next Tatkal Booking Window for {train.trainName}
          </h2>
          <p className="text-xs leading-relaxed text-slate-500">
            Tatkal quotas for {train.trainNumber} open daily on IRCTC (IST) for
            journeys departing the following day. Popular routes sell out in
            under 120 seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                AC Classes (EC, CC, EA)
              </span>
              <p className="text-sm font-bold text-slate-900">
                Opens Daily at 10:00 AM IST
              </p>
              <p className="font-mono text-2xl font-extrabold tabular-nums text-blue-700">
                {formatSeconds(secondsUntilAC)}
              </p>
            </div>
            <p className="border-t border-blue-100 pt-2 text-xs text-slate-500">
              Tip: Pre-add passenger profiles to your IRCTC Master List before
              09:55 AM.
            </p>
          </div>

          <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Non-AC Classes (SL, 2S)
              </span>
              <p className="text-sm font-bold text-slate-900">
                Opens Daily at 11:00 AM IST
              </p>
              <p className="font-mono text-2xl font-extrabold tabular-nums text-slate-800">
                {formatSeconds(secondsUntilNonAC)}
              </p>
            </div>
            <p className="border-t border-slate-200 pt-2 text-xs text-slate-500">
              Tatkal charges apply per ticket; senior citizen concessions are
              not permitted.
            </p>
          </div>
        </div>
      </section>

      {/* ── 7. Frequently Asked Questions (Accessible Accordion) ── */}
      <section aria-labelledby="faq-heading" className="space-y-4">
        <div>
          <h2
            id="faq-heading"
            className="text-2xl font-extrabold tracking-tight text-slate-950"
          >
            Frequently Asked Questions
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Official IRCTC rules and timetabling details for {train.trainName} (
            {train.trainNumber}).
          </p>
        </div>

        <div className="shadow-xs divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {[
            {
              q: `When does Tatkal booking open for ${train.trainName} (${train.trainNumber})?`,
              a: `Tatkal booking for ${train.trainName} (${train.trainNumber}) opens one day before the train's departure from its originating station at 10:00 AM IST for AC classes (EC, CC, 1A, 2A, 3A) and 11:00 AM IST for Non-AC classes on the official IRCTC portal.`,
            },
            {
              q: `When is the reservation chart prepared for ${train.trainName} (${train.trainNumber})?`,
              a: `The first reservation chart is prepared approximately 8 to 4 hours before scheduled departure (at ${firstChartTime} for the morning departure from ${originStation}). The second and final chart is finalized 30 minutes before departure (around ${secondChartTime}), releasing all vacant berths for current booking (CURR_AVBL).`,
            },
            {
              q: `What is the route and intermediate halts of ${train.trainName}?`,
              a: `${train.trainName} (${train.trainNumber}) runs from ${originStation} (${originCode}) to ${destStation} (${destCode}), covering ${totalDistanceKm || 450} km with ${stationList.length || 11} scheduled stops including Gurgaon, Rewari, Alwar, and Jaipur.`,
            },
            {
              q: `On which days of the week does ${train.trainName} (${train.trainNumber}) operate?`,
              a:
                runsPerWeek === 7
                  ? `${train.trainName} (${train.trainNumber}) runs daily, all seven days of the week.`
                  : `${train.trainName} (${train.trainNumber}) operates on ${dayFlags
                      .filter((d) => d.active)
                      .map((d) => d.label)
                      .join(", ")} (${runsPerWeek} days weekly).`,
            },
            {
              q: `Can I book confirmed tickets on ${train.trainName} after chart preparation?`,
              a: `Yes! Once the final chart is finalized 30 minutes before departure, IRCTC releases all remaining unoccupied berths under Current Availability (CURR_AVBL). You can book these directly at a 10% discount on base fare via LastBerth or IRCTC until departure.`,
            },
            {
              q: `Is meal catering included in ${train.trainName} (${train.trainNumber})?`,
              a: `Catering is optional on Shatabdi Express. If selected at booking, morning tea/coffee, snacks, and fresh breakfast are served directly to your seat by IRCTC onboard staff.`,
            },
          ].map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={item.q} className="p-5 transition-colors sm:p-6">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="group flex w-full items-center justify-between gap-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="mt-3 border-t border-slate-100 pt-2 text-sm leading-relaxed text-slate-600">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 8. Mobile Sticky Bottom Quick-Action Bar (sm:hidden) ── */}
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
            Check Seats
          </Link>
        </div>
      </aside>
    </div>
  );
}
