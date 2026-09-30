"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Train,
  RotateCcw,
  Filter,
  Clock,
  Utensils,
  Sparkles,
} from "lucide-react";
import {
  buildVandeBharatSearchRedirectUrl,
  type VandeBharatTrain,
} from "@/lib/vandeBharatTrains";

type Props = {
  trains: VandeBharatTrain[];
};

const CLASS_FILTERS = ["All", "CC", "EC", "Sleeper"] as const;

export function VandeBharatTrainsListClient({ trains }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState<string>("All");

  const filteredTrains = useMemo(() => {
    const q = query.trim().toLowerCase();

    return trains.filter((t) => {
      // Class filter check
      if (selectedClass === "Sleeper") {
        if (t.trainType !== "Sleeper") return false;
      } else if (selectedClass !== "All") {
        if (!t.classes || !t.classes.includes(selectedClass)) return false;
      }

      // Text query check
      if (!q) return true;
      return (
        t.trainNumber.toLowerCase().includes(q) ||
        t.trainName.toLowerCase().includes(q) ||
        t.originStation.name.toLowerCase().includes(q) ||
        t.originStation.code.toLowerCase().includes(q) ||
        t.destinationStation.name.toLowerCase().includes(q) ||
        t.destinationStation.code.toLowerCase().includes(q)
      );
    });
  }, [trains, query, selectedClass]);

  const handleCardNavigate = (train: VandeBharatTrain) => {
    router.push(buildVandeBharatSearchRedirectUrl(train));
  };

  const hasActiveFilters = query.trim().length > 0 || selectedClass !== "All";

  const resetFilters = () => {
    setQuery("");
    setSelectedClass("All");
  };

  return (
    <div className="space-y-6">
      {/* ── Search & Filter Controls ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Vande Bharat by train number, name, or city (e.g. 20171, Varanasi, Mumbai, Bengaluru)..."
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

        {/* Quick Class Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1 mr-1">
              <Filter className="h-3.5 w-3.5" />
              Coach:
            </span>
            {CLASS_FILTERS.map((cls) => {
              const active = selectedClass === cls;
              return (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    active
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                  }`}
                >
                  {cls === "Sleeper" ? "Sleeper (1A/2A/3A)" : cls === "CC" ? "Chair Car (CC)" : cls === "EC" ? "Executive (EC)" : "All Coaches"}
                </button>
              );
            })}
          </div>

          {/* Results Count & Reset */}
          <div className="flex items-center gap-3 text-xs text-slate-500 ml-auto">
            <span>
              Showing{" "}
              <strong className="font-semibold text-slate-800">
                {filteredTrains.length}
              </strong>{" "}
              of {trains.length} Vande Bharat trains
            </span>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Trains List ── */}
      {filteredTrains.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
          <Train className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-800">
            No Vande Bharat trains matched your search
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Try searching for another station name, city, or clearing your filters.
          </p>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Show All {trains.length} Trains
          </button>
        </div>
      ) : (
        <ul className="space-y-3.5 sm:space-y-4" role="list">
          {filteredTrains.map((train) => {
            const redirectUrl = buildVandeBharatSearchRedirectUrl(train);

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
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Link
                          href={train.trainDetailUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 hover:underline transition-colors truncate min-w-0"
                        >
                          {train.trainNumber} {train.trainName}
                        </Link>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {train.trainType === "Sleeper" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-700 border border-purple-200 whitespace-nowrap">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                            VB Sleeper
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200 whitespace-nowrap">
                            <Sparkles className="h-3 w-3 text-blue-600" />
                            Vande Bharat 160 km/h
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timing & Route Row (Departure -> Duration -> Arrival) */}
                    <div className="mt-2 flex items-center justify-between gap-2 sm:gap-6 text-slate-700">
                      {/* Departure */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                          {train.departureTime || "--:--"}
                        </span>
                        <span
                          className="mt-0.5 text-xs font-semibold text-slate-600 truncate"
                          title={`${train.originStation.code} - ${train.originStation.name}`}
                        >
                          <span className="font-bold text-slate-800">
                            {train.originStation.code}
                          </span>
                          <span className="text-slate-500 font-normal">
                            {" "}
                            - {train.originStation.name}
                          </span>
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
                        <span className="text-[10px] text-slate-400 font-medium">
                          {train.halts > 0 ? `${train.halts} stops` : "Non-stop"}
                        </span>
                      </div>

                      {/* Arrival */}
                      <div className="flex flex-col items-end text-right min-w-0 flex-1">
                        <span className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                          {train.arrivalTime || "--:--"}
                        </span>
                        <span
                          className="mt-0.5 text-xs font-semibold text-slate-600 truncate max-w-full"
                          title={`${train.destinationStation.code} - ${train.destinationStation.name}`}
                        >
                          <span className="font-bold text-slate-800">
                            {train.destinationStation.code}
                          </span>
                          <span className="text-slate-500 font-normal">
                            {" "}
                            - {train.destinationStation.name}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Classes & Details Links */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-500 text-[11px]">
                          Classes:
                        </span>
                        {train.classes.map((cls) => (
                          <span
                            key={cls}
                            className="rounded-sm bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-100"
                          >
                            {cls}
                          </span>
                        ))}
                        {train.distance && (
                          <span className="text-slate-400 text-[11px] ml-1">
                            • {train.distance}
                          </span>
                        )}
                      </div>

                      {/* Supplementary Links */}
                      <div className="flex items-center gap-3 text-xs">
                        <Link
                          href={train.chartTimesUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                        >
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>Chart Times</span>
                        </Link>

                        {train.foodMenuUrl && (
                          <Link
                            href={train.foodMenuUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                          >
                            <Utensils className="h-3 w-3 text-amber-500" />
                            <span>Food Menu</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: CTA Action Button */}
                  <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 gap-3">
                    <Link
                      href={redirectUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 min-h-[38px] touch-manipulation"
                    >
                      Book Confirm Tickets →
                    </Link>
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
