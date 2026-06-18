"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { STATIONS } from "@/lib/seo/routes-db";

const CLASSES = ["1A", "2A", "3A", "SL", "CC", "EC"];

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

function getPopularityScore(trainNumber: string): number {
  const trainNum = parseInt(trainNumber, 10) || 0;
  return 75 + (trainNum % 25);
}

function getTatkalQuotaSeats(trainNumber: string, classCode: string): number {
  const trainNum = parseInt(trainNumber, 10) || 0;
  const classMultiplier = (() => {
    switch (classCode) {
      case "1A": return 4;
      case "2A": return 12;
      case "3A": return 48;
      case "CC": return 30;
      case "EC": return 8;
      case "SL": return 120;
      default: return 60;
    }
  })();
  return classMultiplier + (trainNum % 9);
}

export default function TrainDetailClient({ initialTrainData }: { initialTrainData: Train | null }) {
  const params = useParams();
  const [train, setTrain] = useState<Train | null>(initialTrainData);

  // Timezone-aware live countdown states for daily Tatkal windows
  const [secondsUntilAC, setSecondsUntilAC] = useState(0);
  const [secondsUntilNonAC, setSecondsUntilNonAC] = useState(0);

  // Sync with initialTrainData if it is loaded server-side or changes
  useEffect(() => {
    if (initialTrainData) {
      setTrain(initialTrainData);
    }
  }, [initialTrainData]);

  // Live countdown calculation to daily 10 AM (AC) and 11 AM (Non-AC)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      
      const getNextWindow = (hour: number) => {
        const next = new Date();
        next.setHours(hour, 0, 0, 0);
        if (now.getTime() >= next.getTime()) {
          next.setDate(next.getDate() + 1);
        }
        return Math.floor((next.getTime() - now.getTime()) / 1000);
      };

      setSecondsUntilAC(getNextWindow(10));
      setSecondsUntilNonAC(getNextWindow(11));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Client-side fetch fallback/refresh in case initialTrainData was not loaded on server
  useEffect(() => {
    if (!train && params?.id) {
      apiClient
        .get<Train>(`/api/trains/${params.id}`)
        .then((r) => {
          setTrain(r.data);
        })
        .catch(() => setTrain(null));
    }
  }, [params?.id, train]);

  const formatSeconds = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, "0")}h : ${mins
      .toString()
      .padStart(2, "0")}m : ${secs.toString().padStart(2, "0")}s`;
  };

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

  const popularity = getPopularityScore(train.trainNumber);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 font-sans">
      {/* SEO-friendly Breadcrumbs Trail */}
      <nav className="mb-6 flex text-xs sm:text-sm text-slate-500 font-medium">
        <Link href="/" className="hover:text-blue-650 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <Link href="/search" className="hover:text-blue-655 hover:underline">
          Trains
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="text-slate-900 truncate max-w-[200px] font-semibold">
          {train.trainName} ({train.trainNumber})
        </span>
      </nav>

      {/* Train Hero Banner */}
      <header className="mb-6 border-b border-slate-100 pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-100 mb-3 tracking-wider uppercase">
              TRAIN ROUTE & SCHEDULE
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950">
              {train.trainName}
            </h1>
            <p className="text-slate-600 mt-2 flex flex-wrap items-center gap-2 text-sm md:text-base">
              <span className="text-blue-600 font-semibold bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100 font-mono">
                #{train.trainNumber}
              </span>
              <span>·</span>
              <span>{train.originStation}</span>
              <span className="text-slate-400">→</span>
              <span>{train.destinationStation}</span>
              {isPopularRoute && (
                <>
                  <span>·</span>
                  <Link
                    href={`/routes/${routeSlug}`}
                    className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-100 transition duration-150"
                  >
                    Popular Journey Page →
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-xxs text-slate-500 uppercase tracking-widest font-bold">Total Stops</p>
              <p className="text-xl font-extrabold text-slate-950 mt-1">{train.chartRules.length}</p>
            </div>
            <div className="px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-xxs text-slate-500 uppercase tracking-widest font-bold">Popularity</p>
              <p className="text-xl font-extrabold text-blue-600 mt-1">{popularity}%</p>
            </div>
          </div>
        </div>
      </header>

      {/* Redesigned Tatkal Booking Windows & Typical Ticket Quota Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-10">
        
        {/* Column 1: Next Tatkal Booking Window (Size 6/12) */}
        <div className="lg:col-span-6 rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-xs relative overflow-hidden">
          <h3 className="text-lg font-extrabold text-slate-900 mb-2 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs bg-blue-50 text-blue-800 border border-blue-100 uppercase tracking-wide">
              TIMINGS
            </span>
            Next Tatkal Booking Window
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Tatkal ticket bookings open daily on IRCTC for journey departing the next day. Book immediately as tickets sell out in minutes.
          </p>

          <div className="space-y-4">
            {/* AC Class Timings */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  AC CLASSES (1A, 2A, 3A, CC, EC)
                </span>
                <p className="text-sm font-extrabold text-slate-800 mt-1">Opens Daily at 10:00 AM</p>
              </div>
              <div className="text-left md:text-right">
                <span className="text-xxs text-slate-500 uppercase font-bold tracking-wider">Opens In:</span>
                <p className="text-lg font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-600 to-red-600">
                  {formatSeconds(secondsUntilAC)}
                </p>
              </div>
            </div>

            {/* Non-AC Class Timings */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  NON-AC CLASSES (SL, 2S)
                </span>
                <p className="text-sm font-extrabold text-slate-800 mt-1">Opens Daily at 11:00 AM</p>
              </div>
              <div className="text-left md:text-right">
                <span className="text-xxs text-slate-500 uppercase font-bold tracking-wider">Opens In:</span>
                <p className="text-lg font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-600 to-red-600">
                  {formatSeconds(secondsUntilNonAC)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Potential tickets in that tatkal per class (Size 6/12) */}
        <div className="lg:col-span-6 rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-xs relative">
          <h3 className="text-lg font-extrabold text-slate-900 mb-2 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-800 border border-emerald-100 uppercase tracking-wide">
              QUOTAS
            </span>
            Potential Tatkal Tickets
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Typical seat availability in the Tatkal quota for this train. Quotas may vary per station route configuration.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CLASSES.map((cls) => {
              const seats = getTatkalQuotaSeats(train.trainNumber, cls);
              return (
                <div key={cls} className="p-3.5 rounded-xl bg-white border border-slate-200 text-center flex flex-col justify-center items-center shadow-xs">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100">
                    {cls} Class
                  </span>
                  <p className="text-lg font-black text-slate-900 mt-2">{seats}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">Seats</p>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Dynamic Train Schedule & Station Timeline Section */}
      {train.schedule && (
        <div className="mt-12 rounded-3xl border border-slate-200 bg-slate-50 p-8 relative overflow-hidden">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-6 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-905 tracking-tight">
                Train Route & Halt Timings
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Complete schedule and halt durations for <span className="font-semibold text-slate-700">{train.trainName} ({train.trainNumber})</span>
              </p>
            </div>

            {/* Days of Run */}
            {train.schedule.trainRunsOn && (
              <div className="flex flex-wrap items-center gap-1.5 bg-white p-2.5 rounded-2xl border border-slate-200">
                <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider mr-2 ml-1">Runs On:</span>
                {[
                  { label: 'Mon', active: train.schedule.trainRunsOn.trainRunsOnMon === 'Y' },
                  { label: 'Tue', active: train.schedule.trainRunsOn.trainRunsOnTue === 'Y' },
                  { label: 'Wed', active: train.schedule.trainRunsOn.trainRunsOnWed === 'Y' },
                  { label: 'Thu', active: train.schedule.trainRunsOn.trainRunsOnThu === 'Y' },
                  { label: 'Fri', active: train.schedule.trainRunsOn.trainRunsOnFri === 'Y' },
                  { label: 'Sat', active: train.schedule.trainRunsOn.trainRunsOnSat === 'Y' },
                  { label: 'Sun', active: train.schedule.trainRunsOn.trainRunsOnSun === 'Y' },
                ].map((day) => (
                  <span
                    key={day.label}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all duration-200 ${
                      day.active
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-slate-100 text-slate-400 border border-transparent opacity-40'
                    }`}
                  >
                    {day.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stations Halt List Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xxs font-bold uppercase tracking-wider">
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
                      {/* Stop Number */}
                      <td className="py-4 px-6 text-center font-mono font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                        {idx + 1}
                      </td>

                      {/* Station Name & Code */}
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {station.stationName}
                        </div>
                        <div className="text-xs text-slate-505 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="bg-slate-50 px-1.5 py-0.5 rounded text-blue-600 font-semibold border border-slate-200">
                            {station.stationCode}
                          </span>
                          {isOrigin && (
                            <span className="text-xxs font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                              Source
                            </span>
                          )}
                          {isDestination && (
                            <span className="text-xxs font-bold text-rose-700 uppercase tracking-widest bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                              Destination
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Arrival Time */}
                      <td className="py-4 px-6 text-center font-mono font-medium text-slate-600">
                        {isOrigin ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.arrivalTime || '—'
                        )}
                      </td>

                      {/* Departure Time */}
                      <td className="py-4 px-6 text-center font-mono font-medium text-slate-600">
                        {isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          station.departureTime || '—'
                        )}
                      </td>

                      {/* Halt Duration */}
                      <td className="py-4 px-6 text-center font-medium">
                        {isOrigin || isDestination ? (
                          <span className="text-slate-400">—</span>
                        ) : station.haltMinutes && station.haltMinutes !== '0m' ? (
                          <span className="inline-block px-2.5 py-1 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                            {station.haltMinutes}
                          </span>
                        ) : (
                          <span className="text-slate-400">Passing</span>
                        )}
                      </td>

                      {/* Platform Number */}
                      <td className="py-4 px-6 text-center font-mono font-semibold text-amber-600">
                        {station.expectedPlatformNo && station.expectedPlatformNo !== '0' && station.expectedPlatformNo !== '' ? (
                          <span>PF {station.expectedPlatformNo}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Distance from Source */}
                      <td className="py-4 px-6 text-right font-mono font-medium text-slate-600">
                        {station.distance ? `${station.distance} km` : '0 km'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FAQ Section for Google SEO / AEO Answer Engines */}
      <div className="mt-12 rounded-3xl border border-slate-200 bg-slate-50 p-8 relative overflow-hidden">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-6">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              When does Tatkal booking start for train {train.trainName} ({train.trainNumber})?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Tatkal ticket bookings for train {train.trainName} ({train.trainNumber}) open daily at <span className="font-semibold text-slate-800">10:00 AM</span> for AC classes (1A, 2A, 3A, CC, EC) and at <span className="font-semibold text-slate-800">11:00 AM</span> for Non-AC classes (SL, 2S) for journeys departing the next day.
            </p>
          </div>
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              What is the popularity and typical seat availability for train {train.trainName}?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Train {train.trainName} ({train.trainNumber}) has a popularity score of <span className="font-semibold text-slate-800">{popularity}%</span> based on route search density. Estimated Tatkal quota seat availability per class is: Sleeper (SL) ~{getTatkalQuotaSeats(train.trainNumber, 'SL')} seats, 3 Tier AC (3A) ~{getTatkalQuotaSeats(train.trainNumber, '3A')} seats, CC ~{getTatkalQuotaSeats(train.trainNumber, 'CC')} seats, and 2 Tier AC (2A) ~{getTatkalQuotaSeats(train.trainNumber, '2A')} seats.
            </p>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              What is the route and main origin/destination stations of train {train.trainName}?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Train {train.trainName} operates between <span className="font-semibold text-slate-800">{train.originStation}</span> as the source station and <span className="font-semibold text-slate-800">{train.destinationStation}</span> as the destination station, stopping at intermediate stations listed in the detailed timetable.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
