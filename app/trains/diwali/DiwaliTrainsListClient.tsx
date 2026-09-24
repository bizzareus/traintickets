"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Train,
  ArrowRight,
  Clock,
  Calendar,
  Layers,
  Sparkles,
  MapPin,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import type { DiwaliSpecialTrain } from "@/lib/diwaliTrains";

type Props = {
  trains: DiwaliSpecialTrain[];
};

export function DiwaliTrainsListClient({ trains }: Props) {
  const [query, setQuery] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [selectedClass, setSelectedClass] = useState<string>("ALL");

  const zones = useMemo(() => {
    const set = new Set<string>();
    trains.forEach((t) => {
      if (t.zone) set.add(t.zone);
    });
    return ["ALL", ...Array.from(set).sort()];
  }, [trains]);

  const classes = useMemo(() => {
    const set = new Set<string>();
    trains.forEach((t) => {
      t.classes?.forEach((c) => set.add(c));
    });
    return ["ALL", ...Array.from(set).sort()];
  }, [trains]);

  const filteredTrains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trains.filter((t) => {
      if (selectedZone !== "ALL" && t.zone !== selectedZone) {
        return false;
      }
      if (selectedClass !== "ALL" && !t.classes?.includes(selectedClass)) {
        return false;
      }
      if (!q) return true;

      return (
        t.trainNumber.toLowerCase().includes(q) ||
        t.trainName.toLowerCase().includes(q) ||
        t.fromStation.name.toLowerCase().includes(q) ||
        t.fromStation.code.toLowerCase().includes(q) ||
        t.toStation.name.toLowerCase().includes(q) ||
        t.toStation.code.toLowerCase().includes(q) ||
        t.zone.toLowerCase().includes(q)
      );
    });
  }, [trains, query, selectedZone, selectedClass]);

  const resetFilters = () => {
    setQuery("");
    setSelectedZone("ALL");
    setSelectedClass("ALL");
  };

  return (
    <div className="space-y-6">
      {/* ── Search & Filter Controls ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by train number, name, city (e.g. 05047, Patna, Gorakhpur, Banaras)..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Zone:</span>
            {zones.map((z) => (
              <button
                key={z}
                onClick={() => setSelectedZone(z)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedZone === z
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {z === "ALL" ? "All Zones" : z}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Class:</span>
            {classes.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedClass(c)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedClass === c
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c === "ALL" ? "All Classes" : c}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count & Reset */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            Showing <strong className="font-semibold text-slate-800">{filteredTrains.length}</strong> of {trains.length} festival special trains
          </span>
          {(query || selectedZone !== "ALL" || selectedClass !== "ALL") && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* ── Trains List ── */}
      {filteredTrains.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
          <Train className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-800">No special trains matched your search</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Try searching for a different station name, train number, or clearing your selected filters.
          </p>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Show All {trains.length} Trains
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrains.map((train) => {
            const bookingUrl = `/?from=${encodeURIComponent(train.fromStation.code)}&to=${encodeURIComponent(train.toStation.code)}&fromName=${encodeURIComponent(train.fromStation.name)}&toName=${encodeURIComponent(train.toStation.name)}`;
            const detailUrl = `/trains/${encodeURIComponent(train.trainNumber)}`;

            return (
              <article
                key={train.trainNumber}
                className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  {/* Left: Train details & Schedule */}
                  <div className="space-y-4 flex-1">
                    {/* Badges & Meta */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200/60 tracking-wider">
                        <Train className="h-3 w-3" />
                        #{train.trainNumber}
                      </span>
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/50">
                        {train.trainType}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {train.zone} Zone
                      </span>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/50">
                        Validity: {train.dateFrom} – {train.dateTo}
                      </span>
                    </div>

                    {/* Train Name */}
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {train.trainName}
                      </h2>
                    </div>

                    {/* Route Timings Visual */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-slate-50/80 p-3 sm:p-4 border border-slate-100">
                      {/* Origin */}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>Origin</span>
                        </div>
                        <div className="text-sm sm:text-base font-bold text-slate-900">
                          {train.fromStation.name}{" "}
                          <span className="text-xs font-semibold text-slate-500">
                            ({train.fromStation.code})
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-blue-600">
                          Dep: {train.departureTime}
                        </div>
                      </div>

                      {/* Middle: Duration & Halts */}
                      <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center gap-1 px-2 py-1 text-center border-y sm:border-y-0 sm:border-x border-slate-200/70">
                        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {train.duration}
                        </div>
                        <div className="hidden sm:flex items-center gap-1 w-20 text-slate-300">
                          <span className="h-px bg-slate-300 flex-1"></span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {train.halts} halts • {train.distance}
                        </div>
                      </div>

                      {/* Destination */}
                      <div className="space-y-0.5 sm:text-right">
                        <div className="flex items-center gap-1.5 sm:justify-end text-xs font-semibold text-slate-500">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>Destination</span>
                        </div>
                        <div className="text-sm sm:text-base font-bold text-slate-900">
                          {train.toStation.name}{" "}
                          <span className="text-xs font-semibold text-slate-500">
                            ({train.toStation.code})
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-emerald-600">
                          Arr: {train.arrivalTime}
                        </div>
                      </div>
                    </div>

                    {/* Days & Classes row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-500">Runs On:</span>
                        <div className="flex flex-wrap gap-1">
                          {train.runningDays?.length > 0 ? (
                            train.runningDays.map((d) => (
                              <span
                                key={d}
                                className="rounded-sm bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                              >
                                {d}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 italic">Special schedule</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-500">Classes:</span>
                        <div className="flex flex-wrap gap-1">
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
                  </div>

                  {/* Right: Primary Call to Action */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 lg:w-56 shrink-0 justify-center border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-5">
                    <Link
                      href={bookingUrl}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 hover:shadow-md transition-all active:scale-[0.98] text-center"
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
                      <span>Book Confirm Tickets</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>

                    <Link
                      href={detailUrl}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors text-center"
                    >
                      <span>Route & Timings</span>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
