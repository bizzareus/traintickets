"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Train, RotateCcw, Filter, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import {
  buildSpecialTrainSearchRedirectUrl,
  type SpecialTrain,
  type FestivalKey,
} from "@/lib/specialTrains";

interface TrainAvailabilityItem {
  trainNumber: string;
  totalAvailableSeats: number;
  availableClasses: string[];
  lowestFare: number | null;
  dates: Record<
    string,
    {
      totalSeats: number;
      classes: Record<
        string,
        { status: string; count: number; fare?: number | null }
      >;
    }
  >;
}

type AvailabilityMap = Record<string, TrainAvailabilityItem>;

type Props = {
  trains: SpecialTrain[];
  festivalKey?: FestivalKey;
  festivalTitle?: string;
};

const CLASS_OPTIONS = ["All", "SL", "3A", "3E", "2A", "1A"] as const;

export function SpecialTrainsListClient({
  trains,
  festivalKey,
  festivalTitle = "Festival Special",
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState<string>("All");
  const [availabilityMap, setAvailabilityMap] = useState<AvailabilityMap>({});

  // Fetch precomputed availability summary from the global train availability cache
  useEffect(() => {
    let active = true;
    const category = festivalKey || "all";
    apiClient
      .get<{ success?: boolean; data?: AvailabilityMap }>(
        "/api/booking-v2/trains/availability-summary",
        { params: { category } },
      )
      .then((res) => {
        if (active && res.data?.data) {
          setAvailabilityMap(res.data.data);
        }
      })
      .catch(() => {
        // Fallback gracefully if backend is warming or offline
      });

    return () => {
      active = false;
    };
  }, [festivalKey]);

  const filteredTrains = useMemo(() => {
    const q = query.trim().toLowerCase();

    return trains.filter((t) => {
      // Class filter check
      if (selectedClass !== "All") {
        const matchesClass = t.classes && t.classes.includes(selectedClass);
        if (!matchesClass) return false;
      }

      // Text query check
      if (!q) return true;
      return (
        t.trainNumber.toLowerCase().includes(q) ||
        t.trainName.toLowerCase().includes(q) ||
        t.fromStation.name.toLowerCase().includes(q) ||
        t.fromStation.code.toLowerCase().includes(q) ||
        t.toStation.name.toLowerCase().includes(q) ||
        t.toStation.code.toLowerCase().includes(q)
      );
    });
  }, [trains, query, selectedClass]);

  const handleCardNavigate = (train: SpecialTrain) => {
    router.push(buildSpecialTrainSearchRedirectUrl(train, festivalKey));
  };

  const hasActiveFilters = query.trim().length > 0 || selectedClass !== "All";

  const resetFilters = () => {
    setQuery("");
    setSelectedClass("All");
  };

  return (
    <div className="space-y-6">
      {/* ── Search & Class Filters Bar ── */}
      <div className="shadow-xs space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${festivalTitle} trains by number, name, or station (e.g. Patna, Darbhanga, Gorakhpur)...`}
            className="focus:outline-hidden w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-16 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 sm:text-base"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick Class Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              Class:
            </span>
            {CLASS_OPTIONS.map((cls) => {
              const active = selectedClass === cls;
              return (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    active
                      ? "shadow-xs bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                  }`}
                >
                  {cls}
                </button>
              );
            })}
          </div>

          {/* Results Count & Reset Action */}
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span>
              Showing{" "}
              <strong className="font-semibold text-slate-800">
                {filteredTrains.length}
              </strong>{" "}
              of {trains.length} trains
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
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Train className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-800">
            No special trains matched your search
          </h3>
          <p className="mx-auto max-w-md text-sm text-slate-500">
            Try adjusting your search criteria, switching class filters, or
            clearing the filter.
          </p>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
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
            const redirectUrl = buildSpecialTrainSearchRedirectUrl(
              train,
              festivalKey,
            );

            return (
              <li
                key={train.trainNumber}
                onClick={() => handleCardNavigate(train)}
                className="hover:shadow-xs group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/20 hover:border-slate-300 sm:p-5"
              >
                <div className="flex flex-col justify-between gap-4 sm:gap-5 md:flex-row md:items-center">
                  {/* Left Section: Train Info, Timings, Route Stations */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 pb-2">
                      <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 transition-colors group-hover:text-blue-600 sm:text-lg">
                        {train.trainNumber} {train.trainName}
                      </h2>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {isDirectAvailable && (
                          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Direct Available
                          </span>
                        )}

                        <span className="rounded-md border border-amber-200/50 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {train.trainType}
                        </span>

                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {train.zone}
                        </span>
                      </div>
                    </div>

                    {/* Timing & Route Row (Departure -> Duration -> Arrival) */}
                    <div className="mt-2 flex items-center justify-between gap-2 text-slate-700 sm:gap-6">
                      {/* Departure */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-base font-bold leading-tight text-slate-900 sm:text-xl">
                          {train.departureTime}
                        </span>
                        <span
                          className="mt-0.5 truncate text-xs font-semibold text-slate-600"
                          title={`${train.fromStation.code} - ${train.fromStation.name}`}
                        >
                          <span className="font-bold text-slate-800">
                            {train.fromStation.code}
                          </span>
                          <span className="font-normal text-slate-500">
                            {" "}
                            - {train.fromStation.name}
                          </span>
                        </span>
                      </div>

                      {/* Duration Visual Divider */}
                      <div className="flex shrink-0 flex-col items-center px-1">
                        <span className="text-[11px] font-medium text-slate-400 sm:text-xs">
                          {train.duration}
                        </span>
                        <div className="relative my-1 flex w-16 items-center justify-center sm:w-28">
                          <div className="h-0.5 w-full bg-slate-200" />
                          <span className="absolute bg-white px-1 text-[10px] text-slate-400">
                            Direct
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">
                          {train.halts} halts
                        </span>
                      </div>

                      {/* Arrival */}
                      <div className="flex min-w-0 flex-1 flex-col items-end text-right">
                        <span className="text-base font-bold leading-tight text-slate-900 sm:text-xl">
                          {train.arrivalTime}
                        </span>
                        <span
                          className="mt-0.5 max-w-full truncate text-xs font-semibold text-slate-600"
                          title={`${train.toStation.code} - ${train.toStation.name}`}
                        >
                          <span className="font-bold text-slate-800">
                            {train.toStation.code}
                          </span>
                          <span className="font-normal text-slate-500">
                            {" "}
                            - {train.toStation.name}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Days & Classes Row */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-500">
                          Runs On:
                        </span>
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
                          <span className="text-[11px] italic text-slate-400">
                            Daily / Special schedule
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-500">
                          Classes:
                        </span>
                        {train.classes?.length > 0 ? (
                          train.classes.map((cls) => (
                            <span
                              key={cls}
                              className="rounded-sm border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700"
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
                  <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
                    {isDirectAvailable ? (
                      <>
                        <div className="min-w-0 text-left md:text-right">
                          <p className="text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                            🎉 {availableCount} Tickets Available
                          </p>
                          <p className="truncate text-xs font-semibold text-emerald-600">
                            {avail.availableClasses?.join(", ") || "Direct"}{" "}
                            Available
                          </p>
                          {avail.lowestFare != null && (
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                              From ₹{avail.lowestFare}
                            </p>
                          )}
                        </div>

                        <Link
                          href={redirectUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="shadow-xs inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 sm:px-4 sm:text-sm"
                        >
                          Book Confirm Tickets →
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href={redirectUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="shadow-xs inline-flex min-h-[38px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 sm:px-4 sm:text-sm"
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
