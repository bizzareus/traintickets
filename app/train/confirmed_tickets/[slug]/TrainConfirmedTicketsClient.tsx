"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Train,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MapPin,
} from "lucide-react";

export type CachedSeat = {
  date: string;
  travelClass: string;
  status: string; // e.g., "AVAILABLE-0042", "WL 12", "REGRET"
  fare?: number | null;
  updatedAt?: string;
};

export type TrainInfo = {
  trainNumber: string;
  trainName: string;
  originStation?: string;
  destinationStation?: string;
  availableClasses?: string[];
  departureTime?: string;
  arrivalTime?: string;
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
  faqEntries?: Array<{ q: string; a: string }>;
};

function formatSeatDate(rawDate: string): string {
  if (!rawDate) return "";
  const ymdMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch.map(Number);
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(y, m - 1, d, 12));
  }
  const dmyMatch = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch.map(Number);
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(y, m - 1, d, 12));
  }
  return rawDate;
}

function getStatusDetails(status: string) {
  const upper = status.toUpperCase();
  if (
    upper.includes("AVAILABLE") ||
    upper.includes("CURR_AVBL") ||
    upper.includes("AVL")
  ) {
    return {
      type: "available" as const,
      label: "Available",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      cardBorder: "border-emerald-200 hover:border-emerald-300 bg-white",
      statusColor: "text-emerald-700",
      isConfirmed: true,
    };
  }
  if (upper.includes("WL") || upper.includes("RAC")) {
    return {
      type: "waitlist" as const,
      label: upper.includes("RAC") ? "RAC" : "Waitlist",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      cardBorder: "border-amber-200 hover:border-amber-300 bg-white",
      statusColor: "text-amber-700",
      isConfirmed: false,
    };
  }
  if (
    upper.includes("REGRET") ||
    upper.includes("NOT AVAILABLE") ||
    upper.includes("TRAIN CANCELLED")
  ) {
    return {
      type: "regret" as const,
      label: "Regret / Sold Out",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      cardBorder: "border-slate-200 hover:border-slate-300 bg-white",
      statusColor: "text-rose-700",
      isConfirmed: false,
    };
  }
  return {
    type: "neutral" as const,
    label: "Status",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    cardBorder: "border-slate-200 hover:border-slate-300 bg-white",
    statusColor: "text-slate-800",
    isConfirmed: false,
  };
}

export default function TrainConfirmedTicketsClient({
  trainInfo,
  cachedSeats,
  chartTimesSlug,
  faqEntries = [],
}: Props) {
  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const trainNumber = trainInfo.trainNumber;
  const trainName = trainInfo.trainName || `Train ${trainNumber}`;
  const origin = trainInfo.originStation || "Origin";
  const dest = trainInfo.destinationStation || "Destination";

  const stations = trainInfo.schedule?.stationList || [];
  const firstStation = stations[0];
  const lastStation = stations[stations.length - 1];
  const totalHalts = stations.length;
  const totalDistance = lastStation?.distanceKm;
  const departureTime = trainInfo.departureTime || firstStation?.departureTime;
  const arrivalTime = trainInfo.arrivalTime || lastStation?.arrivalTime;

  const classesAvailable = useMemo(() => {
    const fromSeats = cachedSeats.map((s) => s.travelClass);
    const fromTrain = trainInfo.availableClasses || [];
    const merged = Array.from(new Set([...fromSeats, ...fromTrain])).filter(
      Boolean,
    );
    return merged.sort();
  }, [cachedSeats, trainInfo.availableClasses]);

  const filteredSeats = useMemo(() => {
    return cachedSeats.filter((s) =>
      selectedClass === "ALL" ? true : s.travelClass === selectedClass,
    );
  }, [cachedSeats, selectedClass]);

  const searchUrl = `/?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}`;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Breadcrumb ── */}
      <nav
        className="flex items-center text-xs sm:text-sm text-slate-500 font-medium"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="hover:text-blue-600 transition-colors">
          Home
        </Link>
        <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-slate-500">Confirmed Tickets</span>
        <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-slate-900 font-semibold truncate">
          {trainName} ({trainNumber})
        </span>
      </nav>

      {/* ── Main Hero Card ── */}
      <header className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-100 uppercase tracking-wider">
            <Zap className="h-3.5 w-3.5 text-blue-600" />
            Confirmed Ticket Finder
          </div>
          {chartTimesSlug && (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              <Clock className="h-3.5 w-3.5" />
              Chart Preparation Times →
            </Link>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
          Confirmed Tickets for {trainName}{" "}
          <span className="text-blue-600 font-bold">({trainNumber})</span>
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
          Live seat availability, post-charting vacant berths, and Smart Seats
          split-booking options for travel from{" "}
          <span className="font-semibold text-slate-800">{origin}</span> to{" "}
          <span className="font-semibold text-slate-800">{dest}</span>.
        </p>

        {/* Train & Route Summary Metrics */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Origin
            </span>
            <div className="mt-0.5 font-bold text-slate-900 text-sm sm:text-base truncate">
              {origin}
            </div>
            {departureTime && (
              <span className="text-xs text-slate-500">
                Departs {departureTime}
              </span>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Destination
            </span>
            <div className="mt-0.5 font-bold text-slate-900 text-sm sm:text-base truncate">
              {dest}
            </div>
            {arrivalTime && (
              <span className="text-xs text-slate-500">
                Arrives {arrivalTime}
              </span>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Halts
            </span>
            <div className="mt-0.5 font-bold text-slate-900 text-sm sm:text-base">
              {totalHalts > 0 ? `${totalHalts} stations` : "Direct route"}
            </div>
            <span className="text-xs text-slate-500">All scheduled stops</span>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Distance
            </span>
            <div className="mt-0.5 font-bold text-slate-900 text-sm sm:text-base">
              {totalDistance ? `${totalDistance} km` : "Full run"}
            </div>
            <span className="text-xs text-slate-500">Track distance</span>
          </div>
        </div>

        {/* Direct Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3 pt-5 border-t border-slate-100">
          <Link
            href={searchUrl}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-[0.99]"
          >
            <Search className="h-4 w-4" />
            Search Smart Seats on LastBerth
          </Link>
          <Link
            href="/chart-vacancy"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition active:scale-[0.99]"
          >
            <Train className="h-4 w-4 text-slate-500" />
            Check Chart Vacancy
          </Link>
          {chartTimesSlug && (
            <Link
              href={`/chart-times/${chartTimesSlug}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition active:scale-[0.99]"
            >
              <Clock className="h-4 w-4 text-slate-500" />
              Chart Timing
            </Link>
          )}
        </div>
      </header>

      {/* ── Seat Availability Section ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Seat Availability Matrix
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Live and cached availability for {trainName} ({trainNumber})
              between {origin} and {dest}.
            </p>
          </div>

          {/* Class filter pills */}
          {classesAvailable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedClass("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedClass === "ALL"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Classes
              </button>
              {classesAvailable.map((cls) => (
                <button
                  type="button"
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    selectedClass === cls
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Availability Cards or Empty State */}
        <div className="mt-5">
          {filteredSeats.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-6 sm:p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Direct Seats Often Enter Waitlist or Regret
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1.5 max-w-lg mx-auto leading-relaxed">
                Direct tickets on {trainName} frequently sell out fast.
                LastBerth searches contiguous intermediate segments on this
                exact train to find confirmed seats with no coach changes.
              </p>
              {classesAvailable.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">
                    Classes on this train:
                  </span>
                  {classesAvailable.map((c) => (
                    <span
                      key={c}
                      className="rounded bg-white border border-slate-200 px-2 py-0.5 font-bold text-slate-800"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-5">
                <Link
                  href={searchUrl}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-[0.99]"
                >
                  <Search className="h-4 w-4" />
                  Search Smart Seats for {origin} → {dest}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSeats.map((seat, idx) => {
                const details = getStatusDetails(seat.status);
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-4 transition-all duration-150 ${details.cardBorder} shadow-2xs`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        {formatSeatDate(seat.date)}
                      </span>
                      <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                        Class {seat.travelClass}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div>
                        <div
                          className={`text-base font-extrabold ${details.statusColor}`}
                        >
                          {seat.status}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {details.label}
                          {seat.fare != null && seat.fare > 0
                            ? ` • ₹${seat.fare.toLocaleString("en-IN")}`
                            : ""}
                        </span>
                      </div>

                      {details.isConfirmed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmed
                        </span>
                      ) : (
                        <Link
                          href={searchUrl}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                        >
                          Smart Seat
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Guaranteed Confirmation Guide Card ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            How to Guarantee a Confirmed Seat on {trainName} ({trainNumber})
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Two proven booking strategies when direct tickets are sold out or on
            Waitlist.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-5 space-y-2">
            <h3 className="text-base font-bold text-blue-950 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
              1. Smart Seats (Contiguous Split Booking)
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              When tickets from {origin} to {dest} show{" "}
              <span className="inline-block rounded bg-rose-100 px-1 py-0.5 font-bold text-rose-700 text-xs">
                REGRET
              </span>
              , Indian Railways locks the full route. LastBerth scans
              intermediate station pairs on this exact train to find contiguous
              confirmed berths so you travel on the same train without switching
              coaches.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-5 space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Train className="h-5 w-5 text-slate-700 shrink-0" />
              2. Post-Chart Current Reservation (`CURR_AVBL`)
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              When 1st reservation charts are prepared (typically 4 hours before
              departure), unallotted Tatkal and quota seats are released to the
              public as{" "}
              <span className="inline-block rounded bg-emerald-100 px-1 py-0.5 font-bold text-emerald-800 text-xs">
                CURR_AVBL
              </span>
              . Check{" "}
              <Link
                href="/chart-vacancy"
                className="font-semibold text-blue-600 hover:underline"
              >
                Chart Vacancy
              </Link>{" "}
              right after charting to book immediately on IRCTC.
            </p>
          </div>
        </div>
      </section>

      {/* ── Train Route Halts & Split Opportunities Table ── */}
      {stations.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                Scheduled Halts &amp; Split Booking Stations
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Intermediate stations on {trainName} ({trainNumber}) where split
                segments can be booked.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 self-start sm:self-auto">
              {stations.length} Stops Total
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-900 font-bold">
                  <th className="p-3">#</th>
                  <th className="p-3">Station</th>
                  <th className="p-3">Arrival</th>
                  <th className="p-3">Departure</th>
                  <th className="p-3">Halt</th>
                  <th className="p-3">Distance</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stations.map((st, i) => {
                  const isOrigin = i === 0;
                  const isDestination = i === stations.length - 1;
                  return (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-slate-400 font-medium">{i + 1}</td>
                      <td className="p-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{st.stationName}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                            {st.stationCode}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        {isOrigin ? "—" : st.arrivalTime || "—"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {isDestination ? "—" : st.departureTime || "—"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {st.haltTimeMinutes ? `${st.haltTimeMinutes} min` : "—"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {st.distanceKm != null ? `${st.distanceKm} km` : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {!isDestination && (
                          <Link
                            href={`/?from=${encodeURIComponent(st.stationCode)}&to=${encodeURIComponent(dest)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Search from here
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── FAQ Section ── */}
      {faqEntries.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Frequently Asked Questions
          </h2>
          <div className="divide-y divide-slate-100">
            {faqEntries.map((faq, i) => {
              const isOpen = openFaqIndex === i;
              return (
                <div key={i} className="py-3.5">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 text-left font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                  >
                    <span className="text-sm sm:text-base">{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-blue-600" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-2.5 text-xs sm:text-sm text-slate-600 leading-relaxed pr-6">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
