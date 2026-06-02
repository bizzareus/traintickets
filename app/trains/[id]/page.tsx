"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";

const CLASSES = ["1A", "2A", "3A", "SL", "CC", "EC"];

type Train = {
  id: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
  chartRules: {
    stationCode: string;
    chartTimeLocal: string;
    sequenceNumber: number;
    predictionProbability: number;
    avgBerthsReleased: number;
    optimalWindowStart: string;
    optimalWindowEnd: string;
  }[];
};

function getSuccessColor(rate: number) {
  if (rate >= 75) {
    return {
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      fill: "#10b981",
      stroke: "stroke-emerald-400",
      hex: "#10b981",
      glow: "shadow-[0_0_15px_rgba(16,185,129,0.3)]",
    };
  }
  if (rate >= 40) {
    return {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      fill: "#f59e0b",
      stroke: "stroke-amber-400",
      hex: "#f59e0b",
      glow: "shadow-[0_0_15px_rgba(245,158,11,0.3)]",
    };
  }
  return {
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    fill: "#f43f5e",
    stroke: "stroke-rose-400",
    hex: "#f43f5e",
    glow: "shadow-[0_0_15px_rgba(244,63,94,0.3)]",
  };
}

function getClassMetrics(cCode: string) {
  switch (cCode) {
    case "1A": return { base: 2200, tatkal: 400, total: 620 };
    case "2A": return { base: 1500, tatkal: 400, total: 550 };
    case "3A": return { base: 1050, tatkal: 300, total: 405 };
    case "CC": return { base: 800, tatkal: 150, total: 230 };
    case "EC": return { base: 1800, tatkal: 400, total: 580 };
    default: return { base: 450, tatkal: 100, total: 145 }; // SL
  }
}

function TrainDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const journeyDate = searchParams.get("journeyDate") ?? "";

  const [train, setTrain] = useState<Train | null>(null);
  const [classCode, setClassCode] = useState("3A");
  const [stationCode, setStationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [journeyDateVal, setJourneyDateVal] = useState("");

  // Countdown timer: 3 hours, 45 minutes, 24 seconds (13524 seconds)
  const [secondsLeft, setSecondsLeft] = useState(13524);

  useEffect(() => {
    if (journeyDate) {
      setJourneyDateVal(journeyDate);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setJourneyDateVal(tomorrow.toISOString().split("T")[0]);
    }
  }, [journeyDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 14400));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    apiClient
      .get<Train>(`/api/trains/${params.id}`)
      .then((r) => {
        const data = r.data;
        setTrain(data);
        if (data?.chartRules?.[0]) {
          setStationCode(data.chartRules[0].stationCode);
        }
      })
      .catch(() => setTrain(null));
  }, [params.id]);

  async function handleGetAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!train || !journeyDateVal || !stationCode) return;
    setLoading(true);
    setError("");
    try {
      await apiClient.post("/api/monitoring-requests", {
        trainId: train.id,
        stationCode,
        journeyDate: journeyDateVal,
        classCode,
      });
      setSuccess(true);
      trackAnalyticsEvent({
        name: "monitoring_alert_requested",
        properties: { success: true, train_id_present: true },
      });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      setError(ax.response?.data?.message ?? ax.response?.data?.error ?? "Request failed");
      trackAnalyticsEvent({
        name: "monitoring_alert_requested",
        properties: { success: false, train_id_present: Boolean(train) },
      });
    } finally {
      setLoading(false);
    }
  }

  if (!train) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="text-center z-10">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-medium text-slate-300">Retrieving Live Route Analytics...</h2>
        </div>
      </div>
    );
  }

  // Active station stats calculations
  const selectedRule = train.chartRules.find((r) => r.stationCode === stationCode) || train.chartRules[0];
  const successRate = selectedRule?.predictionProbability ?? 75;
  const avgBerths = selectedRule?.avgBerthsReleased ?? 5.0;
  const winStart = selectedRule?.optimalWindowStart ?? "18:05";
  const winEnd = selectedRule?.optimalWindowEnd ?? "18:25";

  const successMeta = getSuccessColor(successRate);
  const metrics = getClassMetrics(classCode);

  // Countdown strings
  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const countdownStr = `${hours.toString().padStart(2, "0")}h : ${minutes
    .toString()
    .padStart(2, "0")}m : ${seconds.toString().padStart(2, "0")}s`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden font-sans">
      {/* Decorative Glowing Radial Blobs */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/15 via-slate-950 to-slate-950 pointer-events-none z-0" />
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none z-0" />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/40 border-b border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-200">
              <span className="text-white font-extrabold text-sm">L</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              LastBerth
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors duration-200 px-4 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 relative z-10">
        {/* Back Link */}
        <Link
          href="/search"
          className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors mb-8 group"
        >
          <span className="group-hover:-translate-x-1 transition-transform duration-200">←</span> Back to search
        </Link>

        {/* Train Hero Banner */}
        <div className="mb-10 p-8 rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-xl relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-3 tracking-wider">
                TRAIN ROUTE ANALYTICS
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
                {train.trainName}
              </h1>
              <p className="text-slate-400 mt-2 flex flex-wrap items-center gap-2 text-sm md:text-base">
                <span className="text-indigo-400 font-semibold bg-indigo-500/5 px-2.5 py-0.5 rounded border border-indigo-500/10">
                  #{train.trainNumber}
                </span>
                <span>·</span>
                <span>{train.originStation}</span>
                <span className="text-indigo-500">→</span>
                <span>{train.destinationStation}</span>
              </p>
            </div>
            <div className="flex gap-4">
              <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm text-center">
                <p className="text-xxs text-slate-500 uppercase tracking-widest font-bold">Total Legs</p>
                <p className="text-xl font-extrabold text-white mt-1">{train.chartRules.length}</p>
              </div>
              <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm text-center">
                <p className="text-xxs text-slate-500 uppercase tracking-widest font-bold">Reliability</p>
                <p className="text-xl font-extrabold text-emerald-400 mt-1">High-Fi</p>
              </div>
            </div>
          </div>
        </div>

        {/* Station Timeline Section */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-300 tracking-wide uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              Route Vacancy Heatmap
            </h2>
            <span className="text-xs text-slate-400 bg-slate-900/60 border border-white/5 px-3 py-1 rounded-full">
              Click nodes to analyze confirmation rate
            </span>
          </div>

          <div className="overflow-x-auto py-6 bg-slate-900/40 border border-white/5 backdrop-blur-xl rounded-3xl p-6 shadow-xl scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent">
            <div className="min-w-[900px] select-none">
              <svg width="100%" height="150" viewBox="0 0 1000 150" preserveAspectRatio="xMidYMid meet" className="mx-auto overflow-visible">
                {/* SVG Defs for glowing effects */}
                <defs>
                  <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-indigo" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Draw Route Connection Path */}
                {train.chartRules.map((rule, idx) => {
                  if (idx === train.chartRules.length - 1) return null;
                  const nextRule = train.chartRules[idx + 1];
                  const x1 = 50 + (idx * 900) / (train.chartRules.length - 1);
                  const x2 = 50 + ((idx + 1) * 900) / (train.chartRules.length - 1);
                  const successMetaNext = getSuccessColor(nextRule.predictionProbability);

                  return (
                    <g key={`path-${rule.stationCode}`}>
                      {/* Background inert path */}
                      <line
                        x1={x1}
                        y1={75}
                        x2={x2}
                        y2={75}
                        stroke="#1e293b"
                        strokeWidth="6"
                        strokeLinecap="round"
                      />
                      {/* Interactive success rate leg path */}
                      <line
                        x1={x1}
                        y1={75}
                        x2={x2}
                        y2={75}
                        stroke={successMetaNext.hex}
                        strokeWidth="4"
                        strokeLinecap="round"
                        className="transition-all duration-300 opacity-80 hover:opacity-100"
                      />
                    </g>
                  );
                })}

                {/* Draw Station Circle Nodes and Labels */}
                {train.chartRules.map((rule, idx) => {
                  const x = 50 + (idx * 900) / (train.chartRules.length - 1);
                  const rate = rule.predictionProbability;
                  const ruleColor = getSuccessColor(rate);
                  const isSelected = rule.stationCode === stationCode;

                  return (
                    <g
                      key={`node-${rule.stationCode}`}
                      className="cursor-pointer"
                      onClick={() => setStationCode(rule.stationCode)}
                    >
                      {/* Active Ring for selected station */}
                      {isSelected && (
                        <circle
                          cx={x}
                          cy={75}
                          r="20"
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2"
                          className="animate-ping opacity-40"
                        />
                      )}
                      {isSelected && (
                        <circle
                          cx={x}
                          cy={75}
                          r="16"
                          fill="rgba(99, 102, 241, 0.15)"
                          stroke="#818cf8"
                          strokeWidth="2"
                          filter="url(#glow-indigo)"
                        />
                      )}

                      {/* Main Node Circle */}
                      <circle
                        cx={x}
                        cy={75}
                        r="10"
                        fill={ruleColor.hex}
                        stroke="#020617"
                        strokeWidth="3.5"
                        className="hover:scale-125 transition-transform duration-200"
                      />

                      {/* Station Code Label (Top) */}
                      <text
                        x={x}
                        y={42}
                        className={`text-xs font-extrabold tracking-widest ${
                          isSelected ? "fill-indigo-400" : "fill-slate-300 hover:fill-white"
                        }`}
                        textAnchor="middle"
                      >
                        {rule.stationCode}
                      </text>

                      {/* Success Rate Percent Label (Bottom 1) */}
                      <text
                        x={x}
                        y={108}
                        className={`text-[10px] font-bold ${ruleColor.text}`}
                        textAnchor="middle"
                      >
                        {rate}%
                      </text>

                      {/* Chart Time Local Label (Bottom 2) */}
                      <text
                        x={x}
                        y={124}
                        className="text-[9px] fill-slate-500 font-semibold"
                        textAnchor="middle"
                      >
                        {rule.chartTimeLocal}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Dynamic Split Layout: Tatkal-Saver Card & Action Alert Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Column 1: Tatkal-Saver Card (Size 7/12) */}
          <div className="lg:col-span-7 rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-br-3xl pointer-events-none" />
            
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6 mb-6">
              <div>
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    LEG STACK
                  </span>
                  Tatkal-Saver Optimizer
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Confirmation forecast for journey starting at <span className="font-semibold text-slate-200">{stationCode}</span>
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-full bg-slate-800/40 border border-white/5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Active Analytics</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-8 justify-around mb-8">
              {/* Circular Gauge */}
              <div className="relative flex items-center justify-center">
                <svg className="w-36 h-36 transform -rotate-90 drop-shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                  {/* Gauge Background Trail */}
                  <circle
                    cx="72"
                    cy="72"
                    r="52"
                    className="stroke-slate-800/40"
                    strokeWidth="8.5"
                    fill="transparent"
                  />
                  {/* Gauge Colored Value Circle */}
                  <circle
                    cx="72"
                    cy="72"
                    r="52"
                    stroke={successMeta.hex}
                    strokeWidth="8.5"
                    fill="transparent"
                    strokeDasharray="326.72"
                    strokeDashoffset={326.72 - (326.72 * successRate) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                {/* Center Text */}
                <div className="absolute text-center">
                  <p className="text-3xl font-black text-white leading-none">{successRate}%</p>
                  <p className={`text-[10px] font-extrabold uppercase mt-1 ${successMeta.text}`}>
                    {successRate >= 75 ? "Excellent" : successRate >= 40 ? "Moderate" : "Low Chance"}
                  </p>
                </div>
              </div>

              {/* Countdown Clock Display */}
              <div className="text-center sm:text-left">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
                  DISCOUNT ALERT
                </span>
                <h4 className="text-sm font-extrabold text-slate-300 uppercase tracking-wider">
                  Current Booking Opens In:
                </h4>
                <div className="mt-2 text-2xl md:text-3xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 tracking-wider">
                  {countdownStr}
                </div>
                <p className="text-xxs text-slate-500 mt-1 max-w-[220px]">
                  Book within this window to lock in a 10% instant discount on base ticket fare.
                </p>
              </div>
            </div>

            {/* Metrics and Savings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Box 1: Hist Avg Berths */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Historical Release
                </span>
                <div className="text-2xl font-black text-white mt-1.5 flex items-baseline gap-1.5">
                  {avgBerths} <span className="text-xs font-semibold text-slate-400">berths/chart</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  Average berths released back to the general quota during final chart preparation.
                </p>
              </div>

              {/* Box 2: Optimal booking window */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Optimal Window
                </span>
                <div className="text-2xl font-black text-indigo-400 mt-1.5 flex items-baseline gap-1.5">
                  {winStart} - {winEnd}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  Statistically the most productive 20-minute interval for seat confirmations.
                </p>
              </div>

              {/* Box 3: Class specific Savings */}
              <div className="md:col-span-2 p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                    Optimization Savings ({classCode})
                  </span>
                  <div className="text-2xl font-extrabold text-white mt-1.5 flex items-baseline gap-2">
                    ₹{metrics.total} <span className="text-xs font-semibold text-emerald-400">Saved/Seat</span>
                  </div>
                </div>
                <div className="text-xxs text-slate-400 max-w-sm">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>10% Current Booking Saving:</span>
                    <span className="font-bold text-slate-200">₹{metrics.base * 0.1}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>Waived Tatkal Surcharge:</span>
                    <span className="font-bold text-slate-200">₹{metrics.tatkal}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Alert Configuration Form (Size 5/12) */}
          <div className="lg:col-span-5 rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-xl p-8 shadow-2xl relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-3xl pointer-events-none" />

            <h3 className="text-xl font-extrabold text-white mb-1.5">Setup Chart-Time Alert</h3>
            <p className="text-xs text-slate-400 mb-6">
              Get an instant ping when seats are released and the 10% discount window opens.
            </p>

            {success ? (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-6 text-center shadow-xl">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-400 font-bold text-xl">
                  ✓
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Monitoring Request Active</h4>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  We are now tracking train <span className="font-semibold text-white">#{train.trainNumber}</span> for station{" "}
                  <span className="font-semibold text-white">{stationCode}</span> ({classCode}). We will notify you instantly at chart time!
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block w-full py-3.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl border border-white/10 hover:border-white/15 transition-all text-xs"
                >
                  Go to Dashboard
                </Link>
              </div>
            ) : (
              <form onSubmit={handleGetAlert} className="space-y-6">
                {/* Station Selection Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Select Analysis Leg (Chart Station)
                  </label>
                  <div className="relative">
                    <select
                      value={stationCode}
                      onChange={(e) => setStationCode(e.target.value)}
                      className="w-full rounded-xl bg-slate-950/80 border border-white/10 px-4 py-3.5 text-slate-200 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition appearance-none cursor-pointer"
                    >
                      {train.chartRules.map((r) => (
                        <option key={r.stationCode} value={r.stationCode} className="bg-slate-950 text-slate-200">
                          {r.stationCode} Leg — Chart @ {r.chartTimeLocal}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      ▼
                    </div>
                  </div>
                </div>

                {/* Class Selection Buttons */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Class (Fare & Savings Optimizations)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CLASSES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setClassCode(c)}
                        className={`rounded-xl py-3 text-xs font-extrabold uppercase transition border duration-200 ${
                          classCode === c
                            ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                            : "bg-slate-950/40 text-slate-400 hover:text-white border-white/5 hover:bg-slate-950/60"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Journey Date Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Journey Date
                  </label>
                  <input
                    type="date"
                    value={journeyDateVal}
                    onChange={(e) => setJourneyDateVal(e.target.value)}
                    required
                    className="w-full rounded-xl bg-slate-950/80 border border-white/10 px-4 py-3.5 text-slate-200 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
                  />
                </div>

                {/* Simulated Channel Toggles for Aesthetics */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Delivery Channels
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-white">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="accent-indigo-500 rounded border-white/10 focus:ring-0 bg-slate-900"
                      />
                      WhatsApp Pings
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-white">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="accent-indigo-500 rounded border-white/10 focus:ring-0 bg-slate-900"
                      />
                      Web Push
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-xs text-rose-400">
                    ⚠️ {error}
                  </div>
                )}

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={loading || !journeyDateVal}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-extrabold tracking-wide py-4 text-sm shadow-[0_0_20px_rgba(99,102,241,0.25)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Activating Tracker...
                    </>
                  ) : (
                    "Activate Vacancy Tracker"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TrainDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="text-center z-10">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-medium text-slate-300">Retrieving Live Route Analytics...</h2>
          </div>
        </div>
      }
    >
      <TrainDetailContent />
    </Suspense>
  );
}

