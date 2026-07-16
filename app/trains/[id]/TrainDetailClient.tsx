"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { STATIONS } from "@/lib/seo/routes-db";
import { parseTrainNumberFromSlug } from "@/lib/chartTimesSlug";

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

/** Seconds until the next daily HH:00 in IST (Asia/Kolkata), regardless of the visitor's timezone. */
function secondsUntilISTHour(hour: number): number {
  const now = new Date();
  // Current time-of-day in IST (UTC+5:30, no DST)
  const istNow = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const target = new Date(istNow);
  target.setHours(hour, 0, 0, 0);
  if (istNow.getTime() >= target.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.floor((target.getTime() - istNow.getTime()) / 1000);
}

export type LocalTrainMeta = {
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
};

export default function TrainDetailClient({
  initialTrainData,
  chartTimesSlug = null,
  localTrain = null,
}: {
  initialTrainData: Train | null;
  chartTimesSlug?: string | null;
  localTrain?: LocalTrainMeta | null;
}) {
  const params = useParams();
  const [apiTrain, setApiTrain] = useState<Train | null>(initialTrainData);

  const [secondsUntilAC, setSecondsUntilAC] = useState(0);
  const [secondsUntilNonAC, setSecondsUntilNonAC] = useState(0);

  useEffect(() => {
    if (initialTrainData) {
      setApiTrain(initialTrainData);
    }
  }, [initialTrainData]);

  // Live countdown to the daily IST Tatkal windows: 10 AM (AC), 11 AM (Non-AC)
  useEffect(() => {
    const updateCountdown = () => {
      setSecondsUntilAC(secondsUntilISTHour(10));
      setSecondsUntilNonAC(secondsUntilISTHour(11));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Client-side fetch fallback in case initialTrainData was not loaded on the server.
  // The route param may be slugged (`12015-ajmer-shatabdi`) — extract the number.
  useEffect(() => {
    const rawId = typeof params?.id === "string" ? params.id : null;
    const trainNumber = rawId ? parseTrainNumberFromSlug(rawId) ?? rawId : null;
    if (!apiTrain && trainNumber) {
      apiClient
        .get<Train>(`/api/trains/${trainNumber}`)
        .then((r) => {
          setApiTrain(r.data);
        })
        .catch(() => setApiTrain(null));
    }
  }, [params?.id, apiTrain]);

  const formatSeconds = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, "0")}h : ${mins
      .toString()
      .padStart(2, "0")}m : ${secs.toString().padStart(2, "0")}s`;
  };

  // Prefer live API data; fall back to the committed local dataset (name,
  // origin, destination) so the page stays useful when the API is unreachable.
  const train: Train | null =
    apiTrain ??
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

  if (!train) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <p className="text-slate-600 font-medium">Train schedule details not available.</p>
      </div>
    );
  }

  // Find station slugs and check if this train runs on a popular route page
  const originSlug = STATIONS.find(
    (s) =>
      s.code === train.originStation ||
      s.name.toLowerCase().includes(train.originStation.toLowerCase()),
  )?.slug;
  const destSlug = STATIONS.find(
    (s) =>
      s.code === train.destinationStation ||
      s.name.toLowerCase().includes(train.destinationStation.toLowerCase()),
  )?.slug;
  const routeSlug = originSlug && destSlug ? `${originSlug}-to-${destSlug}` : null;
  const POPULAR_SLUGS = [
    "delhi-to-mumbai",
    "delhi-to-patna",
    "mumbai-to-bengaluru",
    "chennai-to-bengaluru",
    "kolkata-to-delhi",
    "bengaluru-to-chennai",
    "delhi-to-jammu",
    "mumbai-to-ahmedabad",
    "delhi-to-kolkata",
  ];
  const isPopularRoute = routeSlug && POPULAR_SLUGS.includes(routeSlug);

  // Real stats derived from the schedule data
  const stationList = train.schedule?.stationList ?? [];
  const totalStops = stationList.length || train.chartRules.length;
  const lastStation = stationList[stationList.length - 1];
  const totalDistanceKm = lastStation?.distance
    ? Math.round(Number(lastStation.distance))
    : null;
  const runsOn = train.schedule?.trainRunsOn;
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
    : null;
  const runsPerWeek = dayFlags ? dayFlags.filter((d) => d.active).length : null;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 font-sans">
      {/* Breadcrumbs */}
      <nav className="mb-6 flex text-xs sm:text-sm text-slate-500 font-medium">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <Link href="/search" className="hover:text-blue-600 hover:underline">
          Trains
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="text-slate-900 truncate max-w-[200px] font-semibold">
          {train.trainName} ({train.trainNumber})
        </span>
      </nav>

      {/* Header */}
      <header className="mb-8 border-b border-slate-100 pb-6">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950">
          {train.trainName}{" "}
          <span className="font-mono text-slate-400 text-2xl md:text-3xl align-middle">
            #{train.trainNumber}
          </span>
        </h1>
        <p className="text-slate-600 mt-2 flex flex-wrap items-center gap-2 text-sm md:text-base">
          <span>{train.originStation}</span>
          <span className="text-slate-400">→</span>
          <span>{train.destinationStation}</span>
          {isPopularRoute && (
            <>
              <span>·</span>
              <Link
                href={`/routes/${routeSlug}`}
                className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                See all trains on this route →
              </Link>
            </>
          )}
        </p>

        {/* Real, data-backed stats */}
        <div className="mt-5 flex flex-wrap gap-3">
          {totalStops > 0 ? (
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center min-w-[96px]">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Stops</p>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5">{totalStops}</p>
            </div>
          ) : null}
          {totalDistanceKm ? (
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center min-w-[96px]">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Distance</p>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5">{totalDistanceKm} km</p>
            </div>
          ) : null}
          {runsPerWeek ? (
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center min-w-[96px]">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Runs</p>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                {runsPerWeek === 7 ? "Daily" : `${runsPerWeek}×/week`}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      {/* Check availability — LastBerth tools for this train */}
      <div className="mb-8 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
        <h2 className="text-base font-bold text-slate-900">
          Travelling on {train.trainName}?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Check your waitlist odds, see vacant berths after the chart is prepared, and find
          seats that open up mid-journey.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Check PNR &amp; book — Smart Seats
          </Link>
          <Link
            href="/chart-vacancy"
            className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Vacant berth map — Chart Vacancy
          </Link>
          <Link
            href="/seat-status"
            className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Coach Journey Lookup
          </Link>
          {chartTimesSlug && (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Chart preparation times
            </Link>
          )}
        </div>
      </div>

      {/* Tatkal booking windows (official IRCTC timings, IST) */}
      <div className="mb-10 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-extrabold text-slate-900 mb-1">
          Next Tatkal Booking Window
        </h2>
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
          Tatkal booking opens daily on IRCTC (IST) for journeys departing the next day.
          Popular trains sell out within minutes of the window opening.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
              AC classes (1A, 2A, 3A, CC, EC)
            </span>
            <p className="text-sm font-bold text-slate-800">Opens daily at 10:00 AM IST</p>
            <p className="text-lg font-mono font-bold text-slate-900 tabular-nums">
              {formatSeconds(secondsUntilAC)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              Non-AC classes (SL, 2S)
            </span>
            <p className="text-sm font-bold text-slate-800">Opens daily at 11:00 AM IST</p>
            <p className="text-lg font-mono font-bold text-slate-900 tabular-nums">
              {formatSeconds(secondsUntilNonAC)}
            </p>
          </div>
        </div>
      </div>

      {/* Schedule & station timeline */}
      {!train.schedule && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-600">
            The live station-by-station timetable for {train.trainName} ({train.trainNumber}) is
            loading. If it doesn&apos;t appear, please refresh in a moment.
          </p>
        </div>
      )}
      {train.schedule && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 mb-5">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {train.trainName} ({train.trainNumber}) Route &amp; Timetable
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Every stop with arrival, departure, halt duration and expected platform.
              </p>
            </div>

            {dayFlags && (
              <div className="flex flex-wrap items-center gap-1.5 bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 ml-1">
                  Runs on:
                </span>
                {dayFlags.map((day) => (
                  <span
                    key={day.label}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold ${
                      day.active
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-slate-100 text-slate-400 border border-transparent opacity-40"
                    }`}
                  >
                    {day.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-6 text-center w-16">No.</th>
                  <th className="py-4 px-6">Station</th>
                  <th className="py-4 px-6 text-center">Arrival</th>
                  <th className="py-4 px-6 text-center">Departure</th>
                  <th className="py-4 px-6 text-center">Halt</th>
                  <th className="py-4 px-6 text-center">Platform</th>
                  <th className="py-4 px-6 text-right">Distance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {train.schedule.stationList.map((station, idx) => {
                  const isOrigin = idx === 0;
                  const isDestination = idx === train.schedule!.stationList.length - 1;

                  return (
                    <tr
                      key={station.stationCode}
                      className="hover:bg-slate-50/50 transition duration-150 group"
                    >
                      <td className="py-4 px-6 text-center font-mono font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                        {idx + 1}
                      </td>

                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {station.stationName}
                        </div>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="bg-slate-50 px-1.5 py-0.5 rounded text-blue-600 font-semibold border border-slate-200">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                              Source
                            </span>
                          )}
                          {isDestination && (
                            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-widest bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                              Destination
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium text-slate-600">
                        {isOrigin ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.arrivalTime || "—"
                        )}
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium text-slate-600">
                        {isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.departureTime || "—"
                        )}
                      </td>

                      <td className="py-4 px-6 text-center font-medium">
                        {isOrigin || isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : station.haltMinutes && station.haltMinutes !== "0m" ? (
                          <span className="inline-block px-2.5 py-1 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                            {station.haltMinutes}
                          </span>
                        ) : (
                          <span className="text-slate-400">Passing</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-semibold text-amber-600">
                        {station.expectedPlatformNo &&
                        station.expectedPlatformNo !== "0" &&
                        station.expectedPlatformNo !== "" ? (
                          <span>PF {station.expectedPlatformNo}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right font-mono font-medium text-slate-600">
                        {station.distance ? `${station.distance} km` : "0 km"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FAQ — real facts only, mirrors the FAQPage JSON-LD */}
      <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-6">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              When does Tatkal booking open for {train.trainName} ({train.trainNumber})?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Tatkal booking for {train.trainName} ({train.trainNumber}) opens one day before
              departure at <span className="font-semibold text-slate-800">10:00 AM IST</span> for
              AC classes (1A, 2A, 3A, CC, EC) and{" "}
              <span className="font-semibold text-slate-800">11:00 AM IST</span> for Non-AC
              classes (SL, 2S) on IRCTC.
            </p>
          </div>
          <div className={runsPerWeek ? "border-b border-slate-200 pb-4" : ""}>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              What is the route of {train.trainName} ({train.trainNumber})?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {train.trainName} ({train.trainNumber}) runs from{" "}
              <span className="font-semibold text-slate-800">{train.originStation}</span> to{" "}
              <span className="font-semibold text-slate-800">{train.destinationStation}</span>
              {totalStops ? <>, stopping at {totalStops} stations en route</> : null}. The full
              station-by-station timetable is listed above.
            </p>
          </div>
          {runsPerWeek ? (
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                On which days does {train.trainName} ({train.trainNumber}) run?
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {runsPerWeek === 7 ? (
                  <>
                    {train.trainName} ({train.trainNumber}) runs{" "}
                    <span className="font-semibold text-slate-800">daily</span>, all seven days
                    of the week.
                  </>
                ) : (
                  <>
                    {train.trainName} ({train.trainNumber}) runs on{" "}
                    <span className="font-semibold text-slate-800">
                      {dayFlags!
                        .filter((d) => d.active)
                        .map((d) => d.label)
                        .join(", ")}
                    </span>{" "}
                    ({runsPerWeek} days a week).
                  </>
                )}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
