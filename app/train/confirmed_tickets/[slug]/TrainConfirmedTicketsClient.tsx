"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search, Train as TrainIcon, Calendar, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Zap } from "lucide-react";

export type CachedSeat = {
  date: string;
  travelClass: string;
  status: string; // e.g., "AVAILABLE-0042", "WL 12", "REGRET"
  updatedAt?: string;
};

export type TrainInfo = {
  trainNumber: string;
  trainName: string;
  originStation?: string;
  destinationStation?: string;
  schedule?: {
    stationList?: Array<{
      stationCode: string;
      stationName: string;
      arrivalTime: string;
      departureTime: string;
      haltTimeMinutes?: number;
      distanceKm?: number;
    }>;
  };
};

type Props = {
  trainInfo: TrainInfo;
  slug: string;
  cachedSeats: CachedSeat[];
  chartTimesSlug?: string | null;
};

export default function TrainConfirmedTicketsClient({
  trainInfo,
  slug,
  cachedSeats,
  chartTimesSlug,
}: Props) {
  const [selectedClass, setSelectedClass] = useState<string>("ALL");

  const classesAvailable = Array.from(
    new Set(cachedSeats.map((s) => s.travelClass))
  );

  const filteredSeats = cachedSeats.filter((s) =>
    selectedClass === "ALL" ? true : s.travelClass === selectedClass
  );

  const trainNumber = trainInfo.trainNumber;
  const trainName = trainInfo.trainName || `Train ${trainNumber}`;
  const origin = trainInfo.originStation || "Origin";
  const dest = trainInfo.destinationStation || "Destination";

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-300 border border-blue-400/30 mb-4">
            <Zap className="h-3.5 w-3.5 text-blue-400" /> Real-time Cached Seats & Smart Booking
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Confirmed Tickets for <span className="text-blue-400">{trainName} ({trainNumber})</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-300 font-normal leading-relaxed">
            Live availability status, post-charting vacant berths, and Smart Seats split-booking options for travel from <span className="font-semibold text-white">{origin}</span> to <span className="font-semibold text-white">{dest}</span>.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href={`/?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}`}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all active:scale-95"
            >
              <Search className="h-4 w-4" /> Search Smart Seats on Platform
            </Link>
            {chartTimesSlug && (
              <Link
                href={`/chart-times/${chartTimesSlug}`}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all"
              >
                View Chart Preparation Timing
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Cached Seats Table / Availability Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="h-6 w-6 text-blue-600" />
              Cached Seat Availability Matrix
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Latest cached seat status for {trainName} ({trainNumber}) across upcoming journey dates.
            </p>
          </div>

          {classesAvailable.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedClass("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedClass === "ALL"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Classes
              </button>
              {classesAvailable.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedClass === cls
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          )}
        </div>

        {filteredSeats.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">No Direct Cached Berths Found</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              Direct tickets may be sold out or in REGRET status. Use LastBerth Smart Seats to search for contiguous split-segments on this exact train.
            </p>
            <Link
              href={`/?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}`}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-all"
            >
              Find Smart Seats <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSeats.map((seat, idx) => {
              const isAvailable =
                seat.status.includes("AVAILABLE") || seat.status.includes("CURR_AVBL");
              const isRegret = seat.status.includes("REGRET");

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 transition-all ${
                    isAvailable
                      ? "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50"
                      : isRegret
                      ? "border-red-200 bg-red-50/30 hover:bg-red-50/50"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {seat.date}
                    </span>
                    <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs font-extrabold text-slate-800">
                      Class: {seat.travelClass}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div
                        className={`text-base font-black ${
                          isAvailable
                            ? "text-emerald-700"
                            : isRegret
                            ? "text-red-700"
                            : "text-amber-700"
                        }`}
                      >
                        {seat.status}
                      </div>
                      <span className="text-[10px] text-slate-600 font-medium">
                        Cached status
                      </span>
                    </div>

                    {isAvailable ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Available
                      </span>
                    ) : (
                      <Link
                        href={`/?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition-all"
                      >
                        Split Seat
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Educational & Platform Feature Content */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6 text-slate-800">
        <h2 className="text-2xl font-extrabold text-slate-900 border-b border-slate-100 pb-4">
          How to Guarantee a Confirmed Seat on {trainName} ({trainNumber})
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-5 space-y-2">
            <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              1. Smart Seats (Segment / Split Booking)
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              When direct origin-to-destination tickets on {trainName} show <code className="bg-white border px-1 rounded text-red-600 font-bold">REGRET</code>, IRCTC locks the route. LastBerth Smart Seats scans intermediate station pairs on this exact train to find contiguous confirmed berths. You travel on the same train without switching coaches!
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-5 space-y-2">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrainIcon className="h-5 w-5 text-slate-700" />
              2. Post-Chart Current Reservation (`CURR_AVBL`)
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              When 1st charts are finalized (4 hours before origin departure), unallotted quotas are released as <code className="bg-white border px-1 rounded text-emerald-700 font-bold">CURR_AVBL</code>. Check [Chart Vacancy](/chart-vacancy) right after chart preparation to book these confirmed seats directly on IRCTC.
            </p>
          </div>
        </div>

        {/* Schedule snippet */}
        {trainInfo.schedule?.stationList && trainInfo.schedule.stationList.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Major Intermediate Halts for Smart Seat Segments
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-900 font-bold">
                    <th className="p-2.5">Station</th>
                    <th className="p-2.5">Arrival</th>
                    <th className="p-2.5">Departure</th>
                    <th className="p-2.5">Halt</th>
                    <th className="p-2.5">Distance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trainInfo.schedule.stationList.slice(0, 10).map((st, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-900">
                        {st.stationName} ({st.stationCode})
                      </td>
                      <td className="p-2.5">{st.arrivalTime}</td>
                      <td className="p-2.5">{st.departureTime}</td>
                      <td className="p-2.5">{st.haltTimeMinutes ? `${st.haltTimeMinutes} m` : "--"}</td>
                      <td className="p-2.5">{st.distanceKm ? `${st.distanceKm} km` : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
