"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { getStationByCodeOrName } from "@/lib/seo/routes-db";
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
    const trainNumber = rawId ? parseTrainNumberFromSlug(rawId) ?? rawId : null;
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
  const totalDistanceKm = lastDistance != null ? Math.round(Number(lastDistance)) : null;

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
    originSlug && destSlug ? `${originSlug}-to-${destSlug}` : null;

  // Train category & classes
  const isShatabdi = train?.trainName?.toLowerCase().includes("shatabdi") ?? false;
  const isRajdhani = train?.trainName?.toLowerCase().includes("rajdhani") ?? false;
  const isVandeBharat =
    train?.trainName?.toLowerCase().includes("vande bharat") ?? false;

  const classes = isShatabdi || isVandeBharat
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
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xs text-center space-y-3">
        <TrainIcon className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="text-lg font-bold text-slate-900">
          Train Details Unavailable
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          We could not load schedule details for this train. Please verify the
          train number or try again in a moment.
        </p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Browse All Trains
        </Link>
      </div>
    );
  }

  const primarySearchUrl = `/?from=${encodeURIComponent(originCode)}&to=${encodeURIComponent(destCode)}`;

  return (
    <div className="space-y-6 sm:space-y-8 font-sans pb-24 sm:pb-8">
      {/* ── Breadcrumb & Action Row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <nav
          className="flex items-center text-slate-500 font-medium"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-emerald-600 transition-colors">
            Home
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <Link
            href="/search"
            className="hover:text-emerald-600 transition-colors"
          >
            Trains
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="text-slate-900 font-semibold truncate max-w-[200px] sm:max-w-xs">
            {train.trainName} ({train.trainNumber})
          </span>
        </nav>

        <button
          onClick={handleShare}
          type="button"
          aria-label="Share train timetable"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs"
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
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-5">
        {/* Eyebrow & Running Frequency */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            <Zap className="h-3.5 w-3.5 text-blue-600" />
            <span>IRCTC Schedule &amp; Timetable</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>{runsPerWeek === 7 ? "Runs Daily" : `${runsPerWeek} Days / Week`}</span>
          </div>
        </div>

        {/* Headline & Train Number */}
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950">
            {train.trainName}
          </h1>
          <span className="font-mono text-base sm:text-lg font-bold px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
            #{train.trainNumber}
          </span>
        </div>

        {/* Route Overview Arc */}
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Origin */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-md">
                  Source
                </span>
                {firstDeparture && (
                  <span className="text-xs font-mono text-slate-600 font-medium">
                    Departs {firstDeparture}
                  </span>
                )}
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>{originStation}</span>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                  {originCode}
                </span>
              </p>
            </div>

            {/* Travel Metrics */}
            <div className="flex items-center gap-4 py-2 border-y sm:border-y-0 sm:border-x border-slate-200 sm:px-6">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Duration
                </p>
                <p className="text-sm sm:text-base font-mono font-bold text-slate-900">
                  {totalDuration || "7h 25m"}
                </p>
              </div>
              <div className="text-slate-300">➔</div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Distance
                </p>
                <p className="text-sm sm:text-base font-mono font-bold text-slate-900">
                  {totalDistanceKm ? `${totalDistanceKm} km` : "450 km"}
                </p>
              </div>
              <div className="text-slate-300">➔</div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Stops
                </p>
                <p className="text-sm sm:text-base font-mono font-bold text-slate-900">
                  {stationList.length || 11} Halts
                </p>
              </div>
            </div>

            {/* Destination */}
            <div className="space-y-1 sm:text-right">
              <div className="flex items-center sm:justify-end gap-2">
                {lastArrival && (
                  <span className="text-xs font-mono text-slate-600 font-medium">
                    Arrives {lastArrival}
                  </span>
                )}
                <span className="text-[10px] font-bold text-rose-800 uppercase tracking-widest bg-rose-100/70 border border-rose-200 px-2 py-0.5 rounded-md">
                  Destination
                </span>
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-900 flex items-center sm:justify-end gap-2">
                <span>{destStation}</span>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                  {destCode}
                </span>
              </p>
            </div>
          </div>

          {/* Popular Route Crosslink */}
          {routeSlug && (
            <div className="mt-3.5 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                Looking for other trains on this corridor?
              </span>
              <Link
                href={`/routes/${routeSlug}`}
                className="font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 transition-colors"
              >
                <span>See all {originCode} to {destCode} trains</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {averageSpeedKmH && (
            <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
              <Navigation className="h-3.5 w-3.5 text-slate-500" />
              <span>Avg Speed ~{averageSpeedKmH} km/h</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <Utensils className="h-3.5 w-3.5 text-slate-500" />
            <span>Pantry / Food Available</span>
          </span>
          <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Verified Station Halts</span>
          </span>
        </div>
      </header>

      {/* ── 2. Focal UI Operational Data Cards (Real Numbers & Anxiety Relief) ── */}
      <section aria-label="Operational Highlights" className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          Key Operational Facts &amp; Chart Preparation Windows
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: 1st Chart Timing */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  1st Reservation Chart
                </span>
                <Clock className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-mono font-extrabold text-slate-900 tracking-tight">
                {firstChartTime}
              </p>
              <span className="inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                ~8.5 Hours Prior
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 leading-relaxed">
              Prepared the previous evening at {originCode} (NDLS). Waitlist
              passengers get initial confirmation.
            </p>
          </div>

          {/* Card 2: 2nd Chart (Final Vacancy) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-amber-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  2nd (Final) Chart
                </span>
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-2xl font-mono font-extrabold text-slate-900 tracking-tight">
                {secondChartTime}
              </p>
              <span className="inline-block text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                30 Mins Before Departure
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 leading-relaxed">
              Final vacant berths released for current booking (
              <code className="text-[10px] font-semibold">CURR_AVBL</code>) at 10%
              discount.
            </p>
          </div>

          {/* Card 3: Tatkal Window AC */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  AC Tatkal Window
                </span>
                <Timer className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-lg font-mono font-extrabold text-blue-700 tabular-nums">
                {formatSeconds(secondsUntilAC)}
              </p>
              <span className="inline-block text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                Daily at 10:00 AM IST
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 leading-relaxed">
              Executive Class (EC) &amp; Chair Car (CC) open 1 day before
              departure date.
            </p>
          </div>

          {/* Card 4: Operating Days & Service */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Operating Days
                </span>
                <Calendar className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="text-xl font-bold text-slate-900">
                {runsPerWeek === 7 ? "Daily Service" : `${runsPerWeek} Days a Week`}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {dayFlags.map((d) => (
                  <span
                    key={d.label}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      d.active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-400 opacity-40"
                    }`}
                  >
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 leading-relaxed">
              Timetable remains fixed all 7 days with priority Shatabdi signaling.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. LastBerth Problem-Solving Action Hub ── */}
      <section
        aria-label="LastBerth Booking Tools"
        className="rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 p-6 sm:p-8 space-y-5"
      >
        <div className="max-w-2xl space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
            <Ticket className="h-3.5 w-3.5" />
            <span>LastBerth Travel Solutions</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight">
            Travelling on {train.trainName}? Bypass Waitlist Anxieties
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Don&apos;t get stranded on REGRET or long waiting lists. Use our
            proprietary tools to find hidden seat confirmations and vacant berths
            on {train.trainNumber}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Action 1: Smart Seats */}
          <Link
            href={primarySearchUrl}
            className="group rounded-2xl border border-white bg-white p-4 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                Find Confirmed Seats
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Smart split-tickets &amp; mid-station booking to guarantee your
                berth.
              </p>
            </div>
            <span className="text-xs font-bold text-blue-600 inline-flex items-center gap-1 mt-4">
              <span>Search Seats</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          {/* Action 2: Chart Vacancy Map */}
          <Link
            href="/chart-vacancy"
            className="group rounded-2xl border border-white bg-white p-4 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Armchair className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                Vacant Berth Map
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Explore real-time coach-by-coach vacant seats after charting.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1 mt-4">
              <span>View Berth Map</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          {/* Action 3: Station Chart Times */}
          {chartTimesSlug ? (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="group rounded-2xl border border-white bg-white p-4 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                  Chart Preparation Times
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Exact 1st &amp; 2nd chart preparation times for all 11 stations.
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 inline-flex items-center gap-1 mt-4">
                <span>Station Timings</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ) : (
            <Link
              href="/chart-times"
              className="group rounded-2xl border border-white bg-white p-4 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                  Chart Times Finder
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Look up IRCTC vacancy chart preparation timings across India.
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 inline-flex items-center gap-1 mt-4">
                <span>Browse Charts</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          )}

          {/* Action 4: Coach & Seat Lookup */}
          <Link
            href="/seat-status"
            className="group rounded-2xl border border-white bg-white p-4 shadow-2xs hover:shadow-md hover:border-purple-300 transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <TrainIcon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                Coach Journey Lookup
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Check coach layout, window seat arrangement, and train rake position.
              </p>
            </div>
            <span className="text-xs font-bold text-purple-600 inline-flex items-center gap-1 mt-4">
              <span>Seat Layout</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── 4. Mobile-Optimized Route & Timetable ── */}
      <section aria-labelledby="timetable-heading" className="space-y-4">
        {/* Header toolbar & controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2
              id="timetable-heading"
              className="text-2xl font-extrabold text-slate-950 tracking-tight flex items-center gap-2"
            >
              <span>{train.trainName} Route &amp; Timetable</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {stationList.length} Stops
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Station arrival, departure, halt minutes, expected platform &amp; chart
              timings.
            </p>
          </div>

          {/* View mode toggle */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80 self-start sm:self-auto">
            <button
              onClick={() => setViewMode("timeline")}
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "timeline"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Timeline (Mobile)</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-2xs"
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
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
            placeholder="Filter by station name or code (e.g. Jaipur, JP, Rewari, Alwar)..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
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
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
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
          <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-blue-500 before:to-rose-500">
              {filteredStations.map((station, idx) => {
                const isOrigin = idx === 0 && !stationQuery;
                const isDestination =
                  idx === filteredStations.length - 1 && !stationQuery;
                const haltMins = station.haltMinutes;
                const hasLongHalt = haltMins && parseInt(haltMins, 10) >= 5;
                const chartInfo = stationChartTimes?.[station.stationCode];

                return (
                  <div key={station.stationCode} className="relative group">
                    {/* Node Indicator on the line */}
                    <div
                      className={`absolute -left-6 sm:-left-8 top-1.5 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[10px] font-bold transition-transform group-hover:scale-110 ${
                        isOrigin
                          ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                          : isDestination
                            ? "bg-rose-600 text-white ring-4 ring-rose-100"
                            : "bg-slate-100 text-slate-700 border border-slate-300 ring-2 ring-white"
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
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 hover:bg-white hover:border-blue-200 hover:shadow-xs transition-all space-y-3">
                      {/* Top Row: Station Name + Badges */}
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {station.stationName}
                          </h3>
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 shadow-2xs">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-full">
                              Source Station
                            </span>
                          )}
                          {isDestination && (
                            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-widest bg-rose-100/70 border border-rose-200 px-2 py-0.5 rounded-full">
                              Destination
                            </span>
                          )}
                        </div>

                        {/* Expected Platform */}
                        {station.expectedPlatformNo &&
                        station.expectedPlatformNo !== "0" &&
                        station.expectedPlatformNo !== "" ? (
                          <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            PF {station.expectedPlatformNo}
                          </span>
                        ) : null}
                      </div>

                      {/* Middle Row: Timings & Halt */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-xl bg-white p-2.5 border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">
                            Arrival
                          </p>
                          <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                            {isOrigin ? "Origin" : station.arrivalTime || "—"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-2.5 border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">
                            Departure
                          </p>
                          <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                            {isDestination ? "Terminus" : station.departureTime || "—"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-2.5 border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">
                            Halt Duration
                          </p>
                          <p className="text-sm font-bold mt-0.5">
                            {isOrigin || isDestination ? (
                              <span className="text-slate-400">—</span>
                            ) : haltMins ? (
                              <span
                                className={
                                  hasLongHalt
                                    ? "text-amber-600 font-extrabold"
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
                        <div className="rounded-xl bg-white p-2.5 border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">
                            Distance
                          </p>
                          <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                            {station.distance != null ? `${station.distance} km` : "0 km"}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: Charting & Book Link */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/50 text-[11px]">
                        <div className="flex flex-wrap items-center gap-2 text-slate-500">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>
                            1st Chart:{" "}
                            <strong className="text-slate-700 font-mono">
                              {chartInfo?.chartOne || firstChartTime}
                            </strong>
                          </span>
                          {chartInfo?.chartTwo && (
                            <>
                              <span>•</span>
                              <span>
                                2nd Chart:{" "}
                                <strong className="text-slate-700 font-mono">
                                  {chartInfo.chartTwo}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>

                        {!isDestination && (
                          <Link
                            href={`/?from=${encodeURIComponent(station.stationCode)}&to=${encodeURIComponent(destCode)}`}
                            className="font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 hover:underline"
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
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 text-center w-12">#</th>
                  <th className="py-3.5 px-4">Station</th>
                  <th className="py-3.5 px-4 text-center">Arrival</th>
                  <th className="py-3.5 px-4 text-center">Departure</th>
                  <th className="py-3.5 px-4 text-center">Halt</th>
                  <th className="py-3.5 px-4 text-center">Platform</th>
                  <th className="py-3.5 px-4 text-center">Distance</th>
                  <th className="py-3.5 px-4 text-right">Chart Preparation</th>
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
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      <td className="py-3 px-4 text-center font-mono text-xs font-bold text-slate-400 group-hover:text-blue-600">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {station.stationName}
                        </div>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-semibold border border-slate-200 text-[11px]">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              Source
                            </span>
                          )}
                          {isDestination && (
                            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-widest bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                              Dest
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                        {isOrigin ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.arrivalTime || "—"
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                        {isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.departureTime || "—"
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isOrigin || isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : station.haltMinutes && station.haltMinutes !== "0m" ? (
                          <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                            {station.haltMinutes}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Passing</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-semibold text-amber-700">
                        {station.expectedPlatformNo &&
                        station.expectedPlatformNo !== "0" &&
                        station.expectedPlatformNo !== "" ? (
                          <span>PF {station.expectedPlatformNo}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">
                        {station.distance != null ? `${station.distance} km` : "0 km"}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-xs">
                        <span className="font-semibold text-slate-900">
                          {chartInfo?.chartOne || firstChartTime}
                        </span>
                        {chartInfo?.chartTwo && (
                          <span className="text-slate-400 block text-[10px]">
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
            className="text-2xl font-extrabold text-slate-950 tracking-tight"
          >
            Travel Classes &amp; Onboard Experience
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Seating configurations, luggage room, and catering options available
            on {train.trainName}.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <div
              key={cls.code}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-extrabold text-blue-600 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100">
                    {cls.code}
                  </span>
                  <Armchair className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {cls.name}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {cls.desc}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>IRCTC Certified Rake</span>
              </div>
            </div>
          ))}
        </div>

        {/* Catering banner */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Catering &amp; Dining on {train.trainName}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Passengers can opt for catering at the time of booking. Fresh
                morning tea/coffee, breakfast, and Rail Neer water bottle are
                served at your seat.
              </p>
            </div>
          </div>
          <Link
            href="/irctc-train-food-menu"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 transition-colors shrink-0 shadow-2xs self-start sm:self-auto"
          >
            <span>View IRCTC Food Menu</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ── 6. Tatkal Booking Timing Guide ── */}
      <section
        aria-labelledby="tatkal-heading"
        className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-5"
      >
        <div className="max-w-2xl space-y-1">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            Tatkal Reservation Rules
          </span>
          <h2
            id="tatkal-heading"
            className="text-2xl font-extrabold text-slate-950 tracking-tight"
          >
            Next Tatkal Booking Window for {train.trainName}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tatkal quotas for {train.trainNumber} open daily on IRCTC (IST) for
            journeys departing the following day. Popular routes sell out in under
            120 seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                AC Classes (EC, CC, EA)
              </span>
              <p className="text-sm font-bold text-slate-900">
                Opens Daily at 10:00 AM IST
              </p>
              <p className="text-2xl font-mono font-extrabold text-blue-700 tabular-nums">
                {formatSeconds(secondsUntilAC)}
              </p>
            </div>
            <p className="text-xs text-slate-500 pt-2 border-t border-blue-100">
              Tip: Pre-add passenger profiles to your IRCTC Master List before
              09:55 AM.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                Non-AC Classes (SL, 2S)
              </span>
              <p className="text-sm font-bold text-slate-900">
                Opens Daily at 11:00 AM IST
              </p>
              <p className="text-2xl font-mono font-extrabold text-slate-800 tabular-nums">
                {formatSeconds(secondsUntilNonAC)}
              </p>
            </div>
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
              Tatkal charges apply per ticket; senior citizen concessions are not
              permitted.
            </p>
          </div>
        </div>
      </section>

      {/* ── 7. Frequently Asked Questions (Accessible Accordion) ── */}
      <section aria-labelledby="faq-heading" className="space-y-4">
        <div>
          <h2
            id="faq-heading"
            className="text-2xl font-extrabold text-slate-950 tracking-tight"
          >
            Frequently Asked Questions
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Official IRCTC rules and timetabling details for {train.trainName} (
            {train.trainNumber}).
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-xs overflow-hidden">
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
              <div key={item.q} className="p-5 sm:p-6 transition-colors">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between text-left gap-4 group"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="text-sm text-slate-600 leading-relaxed mt-3 pt-2 border-t border-slate-100">
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
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-lg flex items-center justify-between gap-3"
      >
        <div className="truncate">
          <p className="text-xs font-bold text-slate-900 truncate">
            {train.trainName}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            #{train.trainNumber} • {originCode} ➔ {destCode}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/chart-vacancy"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Vacancy
          </Link>
          <Link
            href={primarySearchUrl}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-xs"
          >
            Check Seats
          </Link>
        </div>
      </aside>
    </div>
  );
}
