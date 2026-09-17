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

function formatSeatDateLabel(rawDate: string): string {
  if (!rawDate) return "";
  const parts = rawDate.split("-").map(Number);
  if (parts.length !== 3) return rawDate;
  const [y, m, d] = parts;
  const target = new Date(y, m - 1, d, 12);

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const todayStr = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;

  const tomorrow = new Date(istNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;

  const dateFmt = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(target);

  if (rawDate === todayStr) return `Today • ${dateFmt}`;
  if (rawDate === tomorrowStr) return `Tomorrow • ${dateFmt}`;
  return dateFmt;
}

function getUpcomingDates(count = 7): string[] {
  const dates: string[] = [];
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);

  for (let i = 0; i < count; i++) {
    const d = new Date(istNow.getTime() + i * 24 * 60 * 60 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
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
    label: "Check Availability",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    cardBorder: "border-slate-200 hover:border-blue-300 bg-white",
    statusColor: "text-blue-700",
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

  const stations = useMemo(
    () => trainInfo.schedule?.stationList || [],
    [trainInfo.schedule?.stationList],
  );

  const [fromStation, setFromStation] = useState<string>(origin);
  const [toStation, setToStation] = useState<string>(dest);

  const handleFromChange = (code: string) => {
    setFromStation(code);
    const fromIdx = stations.findIndex((s) => s.stationCode === code);
    const toIdx = stations.findIndex((s) => s.stationCode === toStation);
    if (fromIdx >= 0 && toIdx <= fromIdx && fromIdx < stations.length - 1) {
      setToStation(dest !== code ? dest : stations[fromIdx + 1].stationCode);
    }
  };

  const classesAvailable = useMemo(() => {
    const fromSeats = cachedSeats.map((s) => s.travelClass);
    const fromTrain = trainInfo.availableClasses || [];
    const merged = Array.from(new Set([...fromSeats, ...fromTrain])).filter(
      Boolean,
    );
    return merged.length > 0 ? merged.sort() : ["3A", "2A", "1A"];
  }, [cachedSeats, trainInfo.availableClasses]);

  const upcomingDates = useMemo(() => {
    const defaultDates = getUpcomingDates(7);
    const seatDates = cachedSeats.map((s) => s.date).filter(Boolean);
    return Array.from(new Set([...defaultDates, ...seatDates])).sort();
  }, [cachedSeats]);

  const seatItems = useMemo(() => {
    const cachedMap = new Map<string, CachedSeat>();
    for (const s of cachedSeats) {
      cachedMap.set(`${s.date}#${s.travelClass}`, s);
    }

    const targetClasses =
      selectedClass === "ALL" ? classesAvailable : [selectedClass];

    const items: Array<CachedSeat & { isLiveCheck?: boolean }> = [];
    for (const date of upcomingDates) {
      for (const cls of targetClasses) {
        const key = `${date}#${cls}`;
        const cached = cachedMap.get(key);
        if (cached) {
          items.push(cached);
        } else {
          items.push({
            date,
            travelClass: cls,
            status: "Check Live Seats",
            isLiveCheck: true,
          });
        }
      }
    }
    return items;
  }, [cachedSeats, upcomingDates, classesAvailable, selectedClass]);

  const searchUrl = `/?from=${encodeURIComponent(fromStation)}&to=${encodeURIComponent(toStation)}`;

  const dateSearchUrl = (date: string) => {
    return `/?from=${encodeURIComponent(fromStation)}&to=${encodeURIComponent(toStation)}&date=${encodeURIComponent(date)}`;
  };

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

      {/* ── Main Hero Card & Seat Availability Matrix ── */}
      <header className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-6">
        <div>
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
            <span className="font-semibold text-slate-800">{fromStation}</span> to{" "}
            <span className="font-semibold text-slate-800">{toStation}</span>.
          </p>
        </div>

        {/* ── Route Station Selector ("Between the routes") ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Route:
            </span>
            {stations.length > 1 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <select
                  value={fromStation}
                  onChange={(e) => handleFromChange(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Select origin station"
                >
                  {stations.slice(0, -1).map((st) => (
                    <option key={st.stationCode} value={st.stationCode}>
                      {st.stationName} ({st.stationCode})
                    </option>
                  ))}
                </select>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <select
                  value={toStation}
                  onChange={(e) => setToStation(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Select destination station"
                >
                  {stations.slice(1).map((st) => (
                    <option key={st.stationCode} value={st.stationCode}>
                      {st.stationName} ({st.stationCode})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <span className="rounded bg-white px-2 py-0.5 border border-slate-200">
                  {origin}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="rounded bg-white px-2 py-0.5 border border-slate-200">
                  {dest}
                </span>
              </div>
            )}
          </div>

          {/* Class Filter Pills */}
          {classesAvailable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedClass("ALL")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  selectedClass === "ALL"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-200 border border-slate-200"
                }`}
              >
                All Classes
              </button>
              {classesAvailable.map((cls) => (
                <button
                  type="button"
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    selectedClass === cls
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white text-slate-700 hover:bg-slate-200 border border-slate-200"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Direct Seat Availability Matrix for Dates ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Seat Availability across Dates
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              {fromStation} → {toStation}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seatItems.map((seat, idx) => {
              const details = getStatusDetails(seat.status);
              const cardUrl = dateSearchUrl(seat.date);

              return (
                <div
                  key={`${seat.date}-${seat.travelClass}-${idx}`}
                  className={`rounded-xl border p-4 transition-all duration-150 ${details.cardBorder} shadow-2xs flex flex-col justify-between gap-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {formatSeatDateLabel(seat.date)}
                    </span>
                    <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                      Class {seat.travelClass}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div>
                      <div
                        className={`text-sm sm:text-base font-extrabold ${details.statusColor}`}
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
                        href={cardUrl}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition active:scale-[0.99]"
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
        </div>

        {/* ── Direct Action Buttons ── */}
        <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-slate-100">
          <Link
            href={searchUrl}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-[0.99]"
          >
            <Search className="h-4 w-4" />
            Search Smart Seats ({fromStation} → {toStation})
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
                          <button
                            type="button"
                            onClick={() => {
                              handleFromChange(st.stationCode);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Check seats from here
                            <ArrowRight className="h-3 w-3" />
                          </button>
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
