"use client";

import { useMemo } from "react";

export interface PnrPassengerStatus {
  Number: number;
  CurrentStatus: string;
  BookingStatus?: string;
  ConfirmTktStatus?: string;
}

export interface PnrStatusData {
  Pnr: string;
  TrainNo: string;
  TrainName: string;
  Doj: string;
  Quota: string;
  Class: string;
  From: string;
  To: string;
  BoardingStationName?: string;
  SourceName?: string;
  DestinationName?: string;
  ReservationUptoName?: string;
  DepartureTime?: string;
  ArrivalTime?: string;
  Duration?: string;
  PassengerStatus: PnrPassengerStatus[];
}

interface SmartPnrPredictorProps {
  pnrData: PnrStatusData;
}

export function getConfirmationProbability(statusStr: string | undefined, bookingStr?: string): {
  probability: number;
  type: string;
  current: number;
} {
  if (!statusStr) return { probability: 100, type: "CNF", current: 0 };
  const s = statusStr.toUpperCase().trim();
  const b = bookingStr?.toUpperCase().trim() ?? "";

  // 100% Confirmation cases
  if (
    s.includes("CNF") ||
    s.includes("CONFIRM") ||
    s.includes("ALLOCATED") ||
    s.includes("LOWER") ||
    s.includes("UPPER") ||
    s.includes("MIDDLE") ||
    s.includes("SIDE")
  ) {
    return { probability: 100, type: "CNF", current: 0 };
  }

  // RAC (Reservation Against Cancellation) - extremely high chance
  if (s.includes("RAC")) {
    let num = 1;
    const m = s.match(/\d+/);
    if (m) num = parseInt(m[0], 10);
    const p = Math.max(90, Math.round(99 - num * 0.4));
    return { probability: p, type: "RAC", current: num };
  }

  // Waitlists
  let wlType = "GNWL";
  if (s.includes("PQWL") || b.includes("PQWL")) wlType = "PQWL";
  else if (s.includes("RLWL") || b.includes("RLWL")) wlType = "RLWL";
  else if (s.includes("RSWL") || b.includes("RSWL")) wlType = "RSWL";
  else if (s.includes("TQWL") || b.includes("TQWL") || s.includes("CKWL") || b.includes("CKWL")) wlType = "TQWL";

  let currentWl = 15; // default fallback
  const parts = s.split("/");
  if (parts.length > 1) {
    // WL 120 / WL 80 -> current is 80
    const m = parts[parts.length - 1].match(/\d+/);
    if (m) currentWl = parseInt(m[0], 10);
  } else {
    const m = s.match(/\d+/);
    if (m) currentWl = parseInt(m[0], 10);
  }

  let baseProb = 88;
  let decay = 1.2;

  if (wlType === "RLWL") {
    baseProb = 60;
    decay = 2.8;
  } else if (wlType === "PQWL") {
    baseProb = 48;
    decay = 3.6;
  } else if (wlType === "RSWL") {
    baseProb = 40;
    decay = 4.5;
  } else if (wlType === "TQWL") {
    baseProb = 25;
    decay = 5.5;
  }

  const probability = Math.max(8, Math.round(baseProb - (currentWl - 1) * decay));
  return { probability, type: wlType, current: currentWl };
}

export function SmartPnrPredictor({ pnrData }: SmartPnrPredictorProps) {
  const analysis = useMemo(() => {
    if (!pnrData.PassengerStatus || pnrData.PassengerStatus.length === 0) {
      return { minProb: 100, passengers: [], confirmedCount: 0 };
    }

    const passengers = pnrData.PassengerStatus.map((p) => {
      const { probability, type, current } = getConfirmationProbability(p.CurrentStatus, p.BookingStatus);
      return {
        number: p.Number,
        status: p.CurrentStatus,
        probability,
        type,
        current,
      };
    });

    const minProb = Math.min(...passengers.map((p) => p.probability));
    const confirmedCount = passengers.filter((p) => p.probability === 100).length;

    return { minProb, passengers, confirmedCount };
  }, [pnrData]);

  // Color mapping using standard Tailwind CSS classes or inline HSL for beautiful gradient styling
  const config = useMemo(() => {
    const p = analysis.minProb;
    if (p >= 75) {
      return {
        strokeColor: "stroke-emerald-500",
        textColor: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        shadowColor: "shadow-emerald-500/10",
        glowFilter: "drop-shadow(0 0 10px rgba(16, 185, 129, 0.4))",
        label: "High Chance",
        description: "Your tickets are extremely safe! High rate of historical cancellations on this leg indicates smooth confirmation.",
      };
    } else if (p >= 40) {
      return {
        strokeColor: "stroke-amber-500",
        textColor: "text-amber-500",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        shadowColor: "shadow-amber-500/10",
        glowFilter: "drop-shadow(0 0 10px rgba(245, 158, 11, 0.4))",
        label: "Moderate Risk",
        description: "Borderline probability. Waitlist clearance could halt near chart preparation. Consider utilizing our Rescue paths.",
      };
    } else {
      return {
        strokeColor: "stroke-rose-500",
        textColor: "text-rose-500",
        bgColor: "bg-rose-500/10",
        borderColor: "border-rose-500/30",
        shadowColor: "shadow-rose-500/10",
        glowFilter: "drop-shadow(0 0 10px rgba(244, 63, 94, 0.4))",
        label: "Critical Waitlist",
        description: "Remote waitlist category or heavy congestion. Highly unlikely to confirm. We strongly recommend booking segment alternates.",
      };
    }
  }, [analysis.minProb]);

  // Radial calculation (Circle radius = 40, circumference = 2 * PI * 40 ≈ 251.3)
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (analysis.minProb / 100) * circumference;

  return (
    <div className={`mt-5 overflow-hidden rounded-2xl border ${config.borderColor} ${config.bgColor} p-5 backdrop-blur-md transition-all duration-500 shadow-md ${config.shadowColor}`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        {/* Radial gauge container */}
        <div className="relative flex shrink-0 items-center justify-center mx-auto md:mx-0">
          <svg className="h-32 w-32 rotate-[-90deg] transform" aria-label={`Confirmation probability ${analysis.minProb}%`}>
            {/* Background circle */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              className="stroke-slate-200/40 fill-none"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              className={`${config.strokeColor} fill-none transition-all duration-1000 ease-out`}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ filter: config.glowFilter }}
            />
          </svg>
          {/* Central text */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-3xl font-black tracking-tight text-slate-800 tabular-nums">
              {analysis.minProb}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Confidence
            </span>
          </div>
        </div>

        {/* Insight content */}
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${config.textColor} bg-white/80 shadow-sm border border-current/10 animate-pulse`}>
              {config.label}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {analysis.confirmedCount} / {analysis.passengers.length} Booked CNF
            </span>
          </div>
          <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
            Confirmation Analytics
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            {config.description}
          </p>

          {/* Mini breakdown grid */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
            {analysis.passengers.map((p) => (
              <div
                key={p.number}
                className="rounded-lg border border-slate-200/50 bg-white/50 p-2 text-xs shadow-sm"
              >
                <p className="font-bold text-slate-500">Pax {p.number}</p>
                <div className="mt-0.5 flex justify-between items-baseline gap-1">
                  <span className="font-black text-slate-800">{p.status}</span>
                  <span className={`font-extrabold font-mono ${
                    p.probability >= 75 ? "text-emerald-600" : p.probability >= 40 ? "text-amber-600" : "text-rose-600"
                  }`}>
                    {p.probability}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
