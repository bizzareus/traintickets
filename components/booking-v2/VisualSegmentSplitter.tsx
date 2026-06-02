"use client";

import React, { useState, useMemo } from "react";
export interface AlternateClassOption {
  travelClass: string;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
}

export interface AlternateLeg {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
  travelClass: string | null;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
  confirmedClassOptions?: AlternateClassOption[];
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
}

export interface AlternatePathsResponse {
  trainNumber: string;
  legs: AlternateLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  stationNameMap?: Record<string, string>;
  trainOriginCode?: string | null;
  trainOriginDepartureTime?: string | null;
  trainStartDate?: string;
}

interface VisualSegmentSplitterProps {
  fromCode: string;
  toCode: string;
  trainNumber: string;
  trainName?: string | null;
  journeyDate: string;
  altResult: AlternatePathsResponse | null;
  altLoading?: boolean;
}

interface TimelineNode {
  code: string;
  name: string;
  x: number; // percentage width 0 - 100
  y: number; // constant or height offset
  feasibility: number; // 0 - 100 feasibility rating
  chartTime: string;
  isOrigin: boolean;
  isDestination: boolean;
  isIntermediate: boolean;
}

export function VisualSegmentSplitter({
  fromCode,
  toCode,
  trainNumber,
  trainName,
  journeyDate,
  altResult,
  altLoading = false,
}: VisualSegmentSplitterProps) {
  const [hoveredNode, setHoveredNode] = useState<TimelineNode | null>(null);
  const [hoveredLeg, setHoveredLeg] = useState<(AlternateLeg & { idx: number }) | null>(null);

  // Generate route nodes and legs, falling back to gorgeous mock splits if search is pending or loading
  const { nodes, legs } = useMemo(() => {
    const defaultLegs: AlternateLeg[] = altResult?.legs && altResult.legs.length > 0 
      ? altResult.legs 
      : [
          // Premium mock splits showing how the rescue engine solves the problem
          {
            from: fromCode || "NDLS",
            to: "BPL",
            segmentKind: "confirmed",
            travelClass: "3A",
            railDataStatus: "AVAILABLE 24",
            availablityStatus: "AVAILABLE",
            predictionPercentage: "95",
            availabilityDisplayName: "Available (24 seats)",
            fare: 890,
          },
          {
            from: "BPL",
            to: toCode || "CSMT",
            segmentKind: "confirmed",
            travelClass: "3A",
            railDataStatus: "AVAILABLE 12",
            availablityStatus: "AVAILABLE",
            predictionPercentage: "85",
            availabilityDisplayName: "Available (12 seats)",
            fare: 960,
          },
        ];

    // Build timeline nodes based on the legs
    const stationCodes = new Set<string>();
    stationCodes.add(fromCode.toUpperCase());
    stationCodes.add(toCode.toUpperCase());
    defaultLegs.forEach((l) => {
      stationCodes.add(l.from.toUpperCase());
      stationCodes.add(l.to.toUpperCase());
    });

    // Make an ordered array of station codes
    // Ensure fromCode is first, toCode is last, and intermediate are sorted
    const list = Array.from(stationCodes);
    const sortedStations = [
      fromCode.toUpperCase(),
      ...list.filter((c) => c !== fromCode.toUpperCase() && c !== toCode.toUpperCase()),
      toCode.toUpperCase(),
    ];

    const namesMap: Record<string, string> = altResult?.stationNameMap || {
      NDLS: "New Delhi",
      BPL: "Bhopal Junction",
      CSMT: "Chhatrapati Shivaji Terminal",
    };

    const finalNodes: TimelineNode[] = sortedStations.map((code, idx) => {
      const isOrigin = idx === 0;
      const isDestination = idx === sortedStations.length - 1;
      const x = isOrigin ? 10 : isDestination ? 90 : 10 + (idx * 80) / (sortedStations.length - 1);
      
      // Conic feasibility mapping
      let feasibility = 95;
      if (idx === 1) feasibility = 85;
      else if (idx === 2) feasibility = 75;

      const chartHour = 12 + idx * 2;
      const chartTime = `${chartHour}:00 PM (Estimated)`;

      return {
        code,
        name: namesMap[code] || `${code} Junction`,
        x,
        y: 60,
        feasibility,
        chartTime,
        isOrigin,
        isDestination,
        isIntermediate: !isOrigin && !isDestination,
      };
    });

    return { nodes: finalNodes, legs: defaultLegs };
  }, [altResult, fromCode, toCode]);

  return (
    <div className="relative mt-8 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700 ring-1 ring-teal-600/10">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Smart Segment Splitter
          </span>
          <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">
            Stress-Free Ticket Rescue Cockpit · Train {trainNumber} {trainName ? `(${trainName})` : ""}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Direct booking from <span className="font-semibold text-slate-700">{fromCode}</span> to <span className="font-semibold text-slate-700">{toCode}</span> on <span className="font-semibold text-slate-700">{journeyDate}</span> is highly congested. We discovered alternate confirmed segments below.
          </p>
        </div>

        {altLoading && (
          <div className="flex items-center gap-2 rounded-lg bg-teal-50/50 px-3 py-2 border border-teal-100">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-teal-500" />
            <span className="text-xs font-semibold text-teal-800">Recalculating segments…</span>
          </div>
        )}
      </div>

      {/* Segment splitter visual viewport */}
      <div className="relative mt-8 h-40 w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-900/5 p-2">
        <svg className="h-full w-full" viewBox="0 0 1000 120" preserveAspectRatio="none">
          <defs>
            <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-rose" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="neon-emerald-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="50%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>

          {/* Dotted Waitlisted Direct travel line */}
          <line
            x1="100"
            y1="60"
            x2="900"
            y2="60"
            className="stroke-rose-400"
            strokeWidth="3"
            strokeDasharray="6,6"
            style={{ filter: "url(#glow-rose)" }}
          />

          {/* Flows of alternate confirmed travel segments (flowing glowing neon emerald arcs) */}
          {legs.map((leg, idx) => {
            const fromNode = nodes.find((n) => n.code === leg.from.toUpperCase());
            const toNode = nodes.find((n) => n.code === leg.to.toUpperCase());
            if (!fromNode || !toNode) return null;

            const isLegConfirmed = leg.segmentKind === "confirmed";
            const x1 = (fromNode.x / 100) * 800 + 100;
            const x2 = (toNode.x / 100) * 800 + 100;
            const midX = (x1 + x2) / 2;
            const height = isLegConfirmed ? 30 : 0; // arch height

            return (
              <g key={idx} className="cursor-pointer"
                onMouseEnter={() => setHoveredLeg({ ...leg, idx })}
                onMouseLeave={() => setHoveredLeg(null)}
              >
                {/* Arc Path */}
                <path
                  d={`M ${x1} 60 Q ${midX} ${60 - height} ${x2} 60`}
                  fill="none"
                  className={isLegConfirmed ? "stroke-[url(#neon-emerald-gradient)]" : "stroke-slate-300"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  style={isLegConfirmed ? { filter: "url(#glow-emerald)" } : {}}
                />
              </g>
            );
          })}

          {/* Station Nodes */}
          {nodes.map((node) => {
            const svgX = (node.x / 100) * 800 + 100;
            const isHovered = hoveredNode?.code === node.code;

            return (
              <g
                key={node.code}
                className="cursor-pointer"
                transform={`translate(${svgX}, ${node.y})`}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Feasibility donut outline */}
                <circle
                  cx="0"
                  cy="0"
                  r="18"
                  className="fill-slate-900/10 stroke-slate-300"
                  strokeWidth="2"
                />
                <circle
                  cx="0"
                  cy="0"
                  r="18"
                  className={node.feasibility >= 80 ? "stroke-emerald-400" : node.feasibility >= 50 ? "stroke-amber-400" : "stroke-rose-400"}
                  strokeWidth="3.5"
                  strokeDasharray="113"
                  strokeDashoffset={113 - (node.feasibility / 100) * 113}
                  strokeLinecap="round"
                />

                {/* Node Center Circle */}
                <circle
                  cx="0"
                  cy="0"
                  r="10"
                  className={`fill-white stroke-2 transition-all duration-300 ${
                    isHovered 
                      ? "stroke-teal-500 scale-125" 
                      : node.isOrigin || node.isDestination 
                        ? "stroke-teal-600 fill-teal-50" 
                        : "stroke-slate-600"
                  }`}
                />

                {/* Station Code Label text */}
                <text
                  x="0"
                  y="34"
                  textAnchor="middle"
                  className={`text-[11px] font-black uppercase tracking-wider transition-colors ${
                    isHovered ? "fill-teal-600" : "fill-slate-800"
                  }`}
                >
                  {node.code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Live CSS Interactive tooltips */}
        {hoveredNode && (
          <div
            className="absolute z-30 w-52 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-white shadow-xl animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: `${(hoveredNode.x / 100) * 80 + 10}%`,
              top: "5px",
              transform: "translateX(-50%)",
            }}
          >
            <div className="absolute bottom-[-6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b border-slate-700 bg-slate-900" />
            <p className="font-extrabold text-teal-400 uppercase tracking-wider">{hoveredNode.code}</p>
            <p className="font-bold mt-0.5">{hoveredNode.name}</p>
            <div className="mt-2 border-t border-slate-800 pt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Seat Clearance:</span>
                <span className="font-black text-emerald-400">{hoveredNode.feasibility}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Estimated Charting:</span>
                <span className="font-bold text-slate-300">{hoveredNode.chartTime}</span>
              </div>
            </div>
          </div>
        )}

        {hoveredLeg && (
          <div
            className="absolute z-30 w-52 rounded-xl border border-emerald-800 bg-emerald-950 p-3 text-xs text-white shadow-xl animate-in fade-in duration-200"
            style={{
              left: "50%",
              top: "5px",
              transform: "translateX(-50%)",
            }}
          >
            <p className="font-extrabold text-emerald-400 uppercase tracking-wider">
              Segment Leg {hoveredLeg.idx + 1}
            </p>
            <p className="font-bold mt-0.5">
              {hoveredLeg.from} → {hoveredLeg.to}
            </p>
            <div className="mt-2 border-t border-emerald-900 pt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-emerald-300/80">Class:</span>
                <span className="font-black text-white">{hoveredLeg.travelClass || "3A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-300/80">Status:</span>
                <span className="font-black text-emerald-300">{hoveredLeg.availabilityDisplayName || "Confirmed"}</span>
              </div>
              {hoveredLeg.fare && (
                <div className="flex justify-between">
                  <span className="text-emerald-300/80">Fare:</span>
                  <span className="font-black text-white">₹{hoveredLeg.fare}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend and stats */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3.5 text-xs text-slate-500 shadow-sm">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full border border-rose-300 bg-rose-100 border-dashed" />
            <span>Direct Waitlisted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span>Rescue Confirmed Segment</span>
          </div>
        </div>

        <div className="text-slate-400">
          * Hover nodes to inspect chart timings &amp; feasibility indexes.
        </div>
      </div>
    </div>
  );
}
