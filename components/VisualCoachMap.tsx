"use client";

import React, { useState, useMemo } from "react";

export type VacantBerth = {
  coach: string;
  berthNumber: number;
  berthType: string;
  fromStationCode: string;
  toStationCode: string;
  classCode: string;
};

type VisualCoachMapProps = {
  vacantBerths: VacantBerth[];
};

export function VisualCoachMap({ vacantBerths = [] }: VisualCoachMapProps) {
  // 1. Group vacant berths by coach
  const berthsByCoach = useMemo(() => {
    const map: Record<string, VacantBerth[]> = {};
    for (const b of vacantBerths) {
      if (!b.coach) continue;
      const c = b.coach.toUpperCase();
      if (!map[c]) map[c] = [];
      map[c].push(b);
    }
    return map;
  }, [vacantBerths]);

  const coaches = Object.keys(berthsByCoach).sort();
  const [selectedCoach, setSelectedCoach] = useState<string>("");

  React.useEffect(() => {
    if (coaches.length > 0 && (!selectedCoach || !coaches.includes(selectedCoach))) {
      setSelectedCoach(coaches[0]);
    }
  }, [coaches, selectedCoach]);

  const activeVacantBerths = useMemo(() => {
    return berthsByCoach[selectedCoach] || [];
  }, [berthsByCoach, selectedCoach]);

  // Create a map of berthNumber -> VacantBerth object for easy lookup
  const vacantBerthMap = useMemo(() => {
    const map = new Map<number, VacantBerth>();
    for (const b of activeVacantBerths) {
      map.set(b.berthNumber, b);
    }
    return map;
  }, [activeVacantBerths]);

  // Tooltip state
  const [hoveredBerth, setHoveredBerth] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  if (vacantBerths.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-500 font-medium">
          No vacant berth details available in the result payload.
        </p>
      </div>
    );
  }

  // 72 berths standard coach layout (9 bays of 8 berths)
  const totalBays = 9;

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left + 15,
      y: e.clientY - rect.top + 15,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Visual Coach Vacancy Map
          </h3>
          <p className="text-xs text-slate-500">
            Interactive layout of standard 72-berth coach. Hover over vacant seats (green) to view details.
          </p>
        </div>

        {/* Coach Selector */}
        {coaches.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Select Coach:</span>
            <div className="flex gap-1">
              {coaches.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCoach(c)}
                  className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                    selectedCoach === c
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SVG Coach Visualizer */}
      <div 
        className="relative overflow-x-auto pb-2 border border-slate-100 rounded-lg p-2 bg-slate-50"
        onMouseMove={handleMouseMove}
      >
        <div className="min-w-[840px] h-[220px] relative">
          <svg
            className="w-full h-full"
            viewBox="0 0 1000 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Coach Outline */}
            <rect
              x="5"
              y="20"
              width="990"
              height="200"
              rx="12"
              fill="#f1f5f9"
              stroke="#cbd5e1"
              strokeWidth="4"
            />

            {/* Aisle line */}
            <line
              x1="5"
              y1="130"
              x2="995"
              y2="130"
              stroke="#e2e8f0"
              strokeWidth="2"
              strokeDasharray="4 4"
            />

            {/* Windows and Doors (top/bottom) */}
            {Array.from({ length: 9 }).map((_, bayIdx) => {
              const bayX = 25 + bayIdx * 105;
              return (
                <g key={bayIdx}>
                  {/* Top Window */}
                  <rect
                    x={bayX + 15}
                    y="10"
                    width="70"
                    height="12"
                    rx="3"
                    fill="#38bdf8"
                    stroke="#0284c7"
                    strokeWidth="1.5"
                  />
                  {/* Bottom Window */}
                  <rect
                    x={bayX + 15}
                    y="218"
                    width="70"
                    height="12"
                    rx="3"
                    fill="#38bdf8"
                    stroke="#0284c7"
                    strokeWidth="1.5"
                  />
                  {/* Bay separator line */}
                  {bayIdx < 8 && (
                    <line
                      x1={bayX + 100}
                      y1="20"
                      x2={bayX + 100}
                      y2="220"
                      stroke="#e2e8f0"
                      strokeWidth="2"
                    />
                  )}
                </g>
              );
            })}

            {/* Render 9 bays */}
            {Array.from({ length: totalBays }).map((_, bayIdx) => {
              const bayX = 25 + bayIdx * 105;

              // Inside each bay, we have 8 seats:
              // Left column: 1 (LB), 2 (MB), 3 (UB)
              // Right column: 4 (LB), 5 (MB), 6 (UB)
              // Aisle gap (y: 120-140)
              // Side seats: 7 (SL), 8 (SU)
              const bayBerths = [
                { num: bayIdx * 8 + 1, type: "LB", x: bayX + 15, y: 35 },
                { num: bayIdx * 8 + 2, type: "MB", x: bayX + 45, y: 35 },
                { num: bayIdx * 8 + 3, type: "UB", x: bayX + 75, y: 35 },

                { num: bayIdx * 8 + 4, type: "LB", x: bayX + 15, y: 80 },
                { num: bayIdx * 8 + 5, type: "MB", x: bayX + 45, y: 80 },
                { num: bayIdx * 8 + 6, type: "UB", x: bayX + 75, y: 80 },

                { num: bayIdx * 8 + 7, type: "SL", x: bayX + 25, y: 155 },
                { num: bayIdx * 8 + 8, type: "SU", x: bayX + 65, y: 155 },
              ];

              return (
                <g key={bayIdx}>
                  {/* Bay Label */}
                  <text
                    x={bayX + 50}
                    y="210"
                    fill="#94a3b8"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    BAY {bayIdx + 1}
                  </text>

                  {bayBerths.map((seat) => {
                    const vacantDetails = vacantBerthMap.get(seat.num);
                    const isVacant = !!vacantDetails;

                    return (
                      <g
                        key={seat.num}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredBerth(seat.num)}
                        onMouseLeave={() => setHoveredBerth(null)}
                      >
                        {/* Seat Rectangle */}
                        <rect
                          x={seat.x}
                          y={seat.y}
                          width={seat.type === "SL" || seat.type === "SU" ? "35" : "25"}
                          height="35"
                          rx="6"
                          fill={isVacant ? "#dcfce7" : "#f8fafc"}
                          stroke={isVacant ? "#22c55e" : "#cbd5e1"}
                          strokeWidth={isVacant ? "2.5" : "1.5"}
                          className="transition-colors hover:filter hover:brightness-95"
                        />
                        {/* Berth Number Text */}
                        <text
                          x={seat.x + (seat.type === "SL" || seat.type === "SU" ? 17.5 : 12.5)}
                          y={seat.y + 16}
                          fill={isVacant ? "#15803d" : "#475569"}
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {seat.num}
                        </text>
                        {/* Berth Type Text */}
                        <text
                          x={seat.x + (seat.type === "SL" || seat.type === "SU" ? 17.5 : 12.5)}
                          y={seat.y + 28}
                          fill={isVacant ? "#166534" : "#94a3b8"}
                          fontSize="7"
                          fontWeight="semibold"
                          textAnchor="middle"
                        >
                          {seat.type}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* Floating Tooltip */}
          {hoveredBerth !== null && (
            <div
              style={{
                position: "absolute",
                left: tooltipPos.x,
                top: tooltipPos.y,
                pointerEvents: "none",
                zIndex: 50,
              }}
              className="rounded-lg border border-slate-200 bg-slate-950 p-3 shadow-md text-white max-w-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1">
                <span className="text-xs font-bold">
                  Berth {hoveredBerth}
                </span>
                <span className="rounded bg-slate-800 px-1 py-0.5 text-[9px] font-bold text-slate-400">
                  {vacantBerthMap.has(hoveredBerth) ? "VACANT" : "BOOKED"}
                </span>
              </div>
              {(() => {
                const details = vacantBerthMap.get(hoveredBerth);
                if (details) {
                  return (
                    <div className="text-[11px] space-y-0.5">
                      <p>
                        <span className="text-slate-400">Coach:</span>{" "}
                        <span className="font-semibold">{details.coach}</span>
                      </p>
                      <p>
                        <span className="text-slate-400">Type:</span>{" "}
                        <span className="font-semibold">{details.berthType}</span>
                      </p>
                      <p>
                        <span className="text-slate-400">Route:</span>{" "}
                        <span className="font-semibold text-green-400">
                          {details.fromStationCode} → {details.toStationCode}
                        </span>
                      </p>
                      <p>
                        <span className="text-slate-400">Class:</span>{" "}
                        <span className="font-semibold">{details.classCode}</span>
                      </p>
                    </div>
                  );
                }
                return (
                  <p className="text-[11px] text-slate-400">
                    No vacant path reported for this berth.
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Legend & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3 text-xs">
        <div className="flex items-center gap-4 text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-green-500 bg-green-50 inline-block" />
            <span>Vacant ({activeVacantBerths.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-slate-50 inline-block" />
            <span>Booked ({72 - activeVacantBerths.length})</span>
          </div>
        </div>

        <div className="text-slate-500 font-medium">
          Total vacant paths in Coach {selectedCoach || "—"}:{" "}
          <span className="font-bold text-slate-700">{activeVacantBerths.length}</span>
        </div>
      </div>

      {vacantBerths[0]?.classCode && !["3A", "SL", "3E"].includes(vacantBerths[0].classCode.toUpperCase()) && (
        <div className="text-right text-xs pt-1">
          <span className="text-slate-400 italic font-medium">
            * Note: Layout optimized for standard 3A/Sleeper coaches. Physical seat locations may vary for Class {vacantBerths[0].classCode}.
          </span>
        </div>
      )}
    </div>
  );
}
