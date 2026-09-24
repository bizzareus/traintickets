"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Train, RotateCcw } from "lucide-react";
import { apiClient } from "@/lib/api";
import {
  buildDiwaliSearchRedirectUrl,
  type DiwaliSpecialTrain,
  DEFAULT_DIWALI_SEARCH_DATE,
} from "@/lib/diwaliTrains";

interface TrainAvailabilityItem {
  trainNumber: string;
  totalAvailableSeats: number;
  availableClasses: string[];
  lowestFare: number | null;
  dates: Record<
    string,
    {
      totalSeats: number;
      classes: Record<string, { status: string; count: number; fare?: number | null }>;
    }
  >;
}

type AvailabilityMap = Record<string, TrainAvailabilityItem>;

type Props = {
  trains: DiwaliSpecialTrain[];
};

export function DiwaliTrainsListClient({ trains }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [availabilityMap, setAvailabilityMap] = useState<AvailabilityMap>({});

  // Fetch precomputed availability summary from the global train availability cache
  useEffect(() => {
    let active = true;
    apiClient
      .get<{ success?: boolean; data?: AvailabilityMap }>(
        "/api/booking-v2/trains/availability-summary",
        { params: { category: "diwali" } },
      )
      .then((res) => {
        if (active && res.data?.data) {
          setAvailabilityMap(res.data.data);
        }
      })
      .catch(() => {
        // Fallback gracefully if backend is offline or warming
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredTrains = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trains;

    return trains.filter((t) => {
      return (
        t.trainNumber.toLowerCase().includes(q) ||
        t.trainName.toLowerCase().includes(q) ||
        t.fromStation.name.toLowerCase().includes(q) ||
        t.fromStation.code.toLowerCase().includes(q) ||
        t.toStation.name.toLowerCase().includes(q) ||
        t.toStation.code.toLowerCase().includes(q)
      );
    });
  }, [trains, query]);

  const handleCardNavigate = (train: DiwaliSpecialTrain) => {
    const targetUrl = buildDiwaliSearchRedirectUrl(train, DEFAULT_DIWALI_SEARCH_DATE);
    router.push(targetUrl);
  };

  return (
    <div className="space-y-6">
      {/* ── Search Input ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by train number, name, or station (e.g. 05047, Patna, Gorakhpur, Banaras)..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-16 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results Count & Reset */}
        <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
          <span>
            Showing <strong className="font-semibold text-slate-800">{filteredTrains.length}</strong> of{" "}
            {trains.length} festival special trains
          </span>
          {query && (
            <button
              onClick={() => setQuery("")}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Reset search
            </button>
          )}
        </div>
      </div>

      {/* ── Trains List (Exact UI/UX Pattern from Search) ── */}
      {filteredTrains.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
          <Train className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-800">No special trains matched your search</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Try searching for another station name or clearing your search term.
          </p>
          <button
            onClick={() => setQuery("")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Show All {trains.length} Trains
          </button>
        </div>
      ) : (
        <ul className="space-y-3.5 sm:space-y-4" role="list">
          {filteredTrains.map((train) => {
            const avail = availabilityMap[train.trainNumber];
            const availableCount = avail?.totalAvailableSeats ?? 0;
            const isDirectAvailable = availableCount > 0;
            const redirectUrl = buildDiwaliSearchRedirectUrl(train, DEFAULT_DIWALI_SEARCH_DATE);
            const detailUrl = `/trains/${encodeURIComponent(train.trainNumber)}`;

            return (
              <li
                key={train.trainNumber}
                onClick={() => handleCardNavigate(train)}
                className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 sm:p-5 transition-all duration-200 hover:border-slate-300 hover:shadow-xs focus-within:ring-2 focus-within:ring-blue-500/20"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-5">
                  {/* Left Section: Train Info, Timings, Route Stations */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 pb-2">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate min-w-0 flex-1">
                        {train.trainNumber} {train.trainName}
                      </h2>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          href={detailUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors shrink-0"
                        >
                          <span className="hidden sm:inline">Train </span>Schedule
                        </Link>

                        {isDirectAvailable && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
                            Direct Available
                          </span>
                        )}

                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/50">
                          {train.trainType}
                        </span>
                      </div>
                    </div>

                    {/* Timing & Route Row (Skyscanner Style: Departure -> Duration -> Arrival) */}
                    <div className="mt-2 flex items-center justify-between gap-2 sm:gap-6 text-slate-700">
                      {/* Departure */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                          {train.departureTime}
                        </span>
                        <span
                          className="mt-0.5 text-xs font-semibold text-slate-600 truncate"
                          title={`${train.fromStation.code} - ${train.fromStation.name}`}
                        >
                          <span className="font-bold text-slate-800">{train.fromStation.code}</span>
                          <span className="text-slate-500 font-normal"> - {train.fromStation.name}</span>
                        </span>
                      </div>

                      {/* Duration Visual Divider */}
                      <div className="flex flex-col items-center px-1 shrink-0">
                        <span className="text-[11px] sm:text-xs text-slate-400 font-medium">
                          {train.duration}
                        </span>
                        <div className="relative flex items-center justify-center w-16 sm:w-28 my-1">
                          <div className="h-0.5 w-full bg-slate-200" />
                          <span className="absolute text-[10px] text-slate-400 bg-white px-1">
                            Direct
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {train.halts} halts • {train.distance}
                        </span>
                      </div>

                      {/* Arrival */}
                      <div className="flex flex-col items-end text-right min-w-0 flex-1">
                        <span className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                          {train.arrivalTime}
                        </span>
                        <span
                          className="mt-0.5 text-xs font-semibold text-slate-600 truncate max-w-full"
                          title={`${train.toStation.code} - ${train.toStation.name}`}
                        >
                          <span className="font-bold text-slate-800">{train.toStation.code}</span>
                          <span className="text-slate-500 font-normal"> - {train.toStation.name}</span>
                        </span>
                      </div>
                    </div>

                    {/* Days & Classes Row */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-500 text-[11px]">Runs On:</span>
                        {train.runningDays?.length > 0 ? (
                          train.runningDays.map((d) => (
                            <span
                              key={d}
                              className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                            >
                              {d}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Special schedule</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-500 text-[11px]">Classes:</span>
                        {train.classes?.length > 0 ? (
                          train.classes.map((cls) => (
                            <span
                              key={cls}
                              className="rounded-sm bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-100"
                            >
                              {cls}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            Unreserved (GS)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Price / Available Tickets Count & Action Button */}
                  <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 gap-3">
                    {isDirectAvailable ? (
                      <>
                        <div className="text-left md:text-right min-w-0">
                          <p className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                            🎉 {availableCount} Tickets Available
                          </p>
                          <p className="text-xs font-semibold text-emerald-600 truncate">
                            {avail.availableClasses?.join(", ") || "Direct"} Available
                          </p>
                          {avail.lowestFare != null && (
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                              From ₹{avail.lowestFare}
                            </p>
                          )}
                        </div>

                        <Link
                          href={redirectUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 min-h-[38px] touch-manipulation"
                        >
                          Book Confirm Tickets →
                        </Link>
                      </>
                    ) : (
                      <>
                        <div className="text-left md:text-right min-w-0">
                          <p className="text-sm sm:text-base font-bold text-slate-800 leading-tight">
                            Diwali Special Rake
                          </p>
                          <p className="text-xs font-medium text-blue-600">
                            Check 5th Nov Seats
                          </p>
                        </div>

                        <Link
                          href={redirectUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 min-h-[38px] touch-manipulation"
                        >
                          Book Confirm Tickets →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
