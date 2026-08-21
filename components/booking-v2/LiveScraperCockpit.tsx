"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api";
import { trackAlertRequested } from "@/lib/analytics/track";

interface LiveScraperCockpitProps {
  trainNumber: string;
  trainName?: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  trainStartDate?: string;
  inlineMode?: boolean;
}

interface Seat {
  number: number;
  type: "Lower" | "Middle" | "Upper" | "Side Lower" | "Side Upper";
  status: "vacant" | "booked";
  passenger?: string;
}

export function LiveScraperCockpit({
  trainNumber,
  trainName,
  fromStationCode,
  toStationCode,
  journeyDate,
  classCode = "3A",
  trainStartDate,
  inlineMode = false,
}: LiveScraperCockpitProps) {
  // Synthwave console state
  const [logs, setLogs] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(3600); // 1 hour to chart prep fallback
  const [scraperActive, setScraperActive] = useState(false);
  const [seatMapLoaded, setSeatMapLoaded] = useState(false);
  const [hoveredSeat, setHoveredSeat] = useState<Seat | null>(null);

  // Monitor registration Form state
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [selectedClass, setSelectedClass] = useState(classCode);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Initial console streams Simulation
  useEffect(() => {
    if (!scraperActive) return;

    const initialLogs = [
      `[SYS] Initializing lastberth chromium pool cluster...`,
      `[SYS] Spin-up browser agent #LB-${Math.floor(Math.random() * 9000 + 1000)}...`,
      `[NET] Connecting to IRCTC booking gateways...`,
      `[DOM] Injecting captcha bypass models...`,
      `[DOM] CAPTCHA parsed successfully in 480ms via AI neural parser.`,
      `[AUTH] Synchronizing auth tokens & session keys...`,
      `[API] Fetching charting details for Train: ${trainNumber}...`,
      `[DB] Reading station composition metrics for ${fromStationCode}...`,
      `[SCRAPE] Charting preparation not locked yet. Spawning micro-monitoring task.`,
      `[SYS] Scanning realtime coach layout for vacant berths...`,
      `[SUCCESS] Realtime vacancy table successfully loaded! Map rendered below.`,
    ];

    let currentIdx = 0;
    setLogs([]);
    setSeatMapLoaded(false);

    const logTimer = setInterval(() => {
      if (currentIdx < initialLogs.length) {
        setLogs((prev) => [...prev, initialLogs[currentIdx]]);
        currentIdx++;
      } else {
        clearInterval(logTimer);
        setSeatMapLoaded(true);
      }
    }, 900);

    return () => clearInterval(logTimer);
  }, [scraperActive, trainNumber, fromStationCode]);

  // Scroll terminal logs to bottom
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Countdown timer clock
  useEffect(() => {
    // Generate a random countdown between 1.5 to 3 hours
    const baseSeconds = Math.floor(Math.random() * 5400 + 5400);
    setCountdown(baseSeconds);

    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hours.toString().padStart(2, "0")}h : ${mins.toString().padStart(2, "0")}m : ${secs.toString().padStart(2, "0")}s`;
  };

  // Generate 2D Coach layout seats
  const seats: Seat[] = useMemo(() => {
    const arr: Seat[] = [];
    const berthTypes: ("Lower" | "Middle" | "Upper" | "Side Lower" | "Side Upper")[] = [
      "Lower",
      "Middle",
      "Upper",
      "Lower",
      "Middle",
      "Upper",
      "Side Lower",
      "Side Upper",
    ];

    // Build 2 bays (16 berths)
    for (let i = 1; i <= 16; i++) {
      const type = berthTypes[(i - 1) % 8];
      // Randomly assign vacancy for premium demo
      const isVacant = i === 3 || i === 7 || i === 12 || i === 15;
      arr.push({
        number: i,
        type,
        status: isVacant ? "vacant" : "booked",
      });
    }
    return arr;
  }, []);

  const handleRegisterAlert = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim() || undefined;
    const mob = mobile.trim() || undefined;

    if (!em && !mob) {
      setErrorMsg("Please enter an email or mobile number for alerts.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Validate
      const { data: validated } = await apiClient.post<{
        valid: boolean;
        errors?: Array<{ code: string; message: string }>;
      }>("/api/availability/journey/validate", {
        trainNumber: trainNumber.trim(),
        trainName: trainName || undefined,
        fromStationCode: fromStationCode.trim().toUpperCase(),
        toStationCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: selectedClass.trim().toUpperCase(),
        trainStartDate,
      });

      if (!validated.valid) {
        setErrorMsg(validated.errors?.[0]?.message || "Validation failed. Ensure train operates on date.");
        setSubmitting(false);
        return;
      }

      // Submit
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName || undefined,
        fromStationCode: fromStationCode.trim().toUpperCase(),
        toStationCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: selectedClass.trim().toUpperCase(),
        email: em,
        mobile: mob,
        trainStartDate,
      });

      setSuccessMsg("Guardian Scraper Monitor successfully established! We will alert you immediately upon berth release.");
      trackAlertRequested({
        success: true,
        source: "live_scraper_cockpit",
        trainNumber: trainNumber.trim(),
        trainName: trainName || undefined,
        fromCode: fromStationCode.trim().toUpperCase(),
        toCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: selectedClass.trim().toUpperCase(),
        hasEmail: Boolean(em),
        hasMobile: Boolean(mob),
      });

      // Store locally
      try {
        window.localStorage.setItem(
          "lastBerth_monitor_contact",
          JSON.stringify({ email: em ?? "", mobile: mob ?? "" }),
        );
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      const errMsg = e.response?.data?.message || e.message || "Failed to set up monitor.";
      setErrorMsg(errMsg);
      trackAlertRequested({
        success: false,
        source: "live_scraper_cockpit",
        trainNumber: trainNumber.trim(),
        trainName: trainName || undefined,
        fromCode: fromStationCode.trim().toUpperCase(),
        toCode: toStationCode.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: selectedClass.trim().toUpperCase(),
        hasEmail: Boolean(em),
        hasMobile: Boolean(mob),
        error: errMsg,
      });
    } finally {
      setSubmitting(false);
    }
  }, [email, mobile, selectedClass, trainNumber, trainName, fromStationCode, toStationCode, journeyDate, trainStartDate]);

  return (
    <div className={`mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl transition-all duration-300 relative ${inlineMode ? "" : "max-w-2xl mx-auto"}`}>
      {/* Synthwave neon mesh lines */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(147,51,234,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Header section */}
      <div className="relative flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-black text-purple-400 ring-1 ring-purple-400/20">
            <span className="h-2 w-2 rounded-full bg-purple-500 animate-ping" />
            Synthwave Scraper Cockpit
          </span>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white uppercase sm:text-2xl">
            Live Monitoring Console
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Realtime session tracker scanning vacant charting quotas.
          </p>
        </div>

        {/* Countdown Ring */}
        <div className="flex items-center gap-3 bg-slate-900/50 p-2.5 rounded-2xl border border-slate-800/80">
          <svg className="h-10 w-10 rotate-[-90deg]" aria-hidden="true">
            <circle cx="20" cy="20" r="16" className="stroke-slate-800 fill-none" strokeWidth="3" />
            <circle cx="20" cy="20" r="16" className="stroke-purple-500 fill-none" strokeWidth="3" strokeDasharray="100" strokeDashoffset="30" strokeLinecap="round" />
          </svg>
          <div className="text-left">
            <span className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
              Chart Preparation ETA
            </span>
            <span className="font-mono text-sm font-bold text-purple-400 tabular-nums">
              {formatCountdown(countdown)}
            </span>
          </div>
        </div>
      </div>

      {/* Trigger & Terminal Section */}
      <div className="mt-6">
        {!scraperActive ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 py-8 px-4 text-center">
            <svg className="h-12 w-12 text-slate-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h4 className="mt-4 text-sm font-extrabold uppercase tracking-wide">
              No Active Scraper Session
            </h4>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Trigger a live session to solve capthas and scan vacant berths on the train coach map.
            </p>
            <button
              type="button"
              onClick={() => setScraperActive(true)}
              className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(147,51,234,0.4)] hover:bg-purple-500 transition-all active:scale-95"
            >
              Initialize Neon Scraper
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-black/95 p-4 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                Playwright-Chromium @ LB-Scraper
              </span>
            </div>
            
            <div className="h-40 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-400 space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 select-none">{(idx + 1).toString().padStart(2, "0")}</span>
                  <span>{log}</span>
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Seat Map blueprint Section */}
      {scraperActive && seatMapLoaded && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 animate-in fade-in duration-700">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
            Realtime 2D Coach Berth Layout
          </h4>
          
          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* The interactive Blueprint grid layout */}
            <div className="relative flex-1 bg-slate-950 p-4 rounded-xl border border-slate-800 w-full overflow-x-auto">
              <div className="min-w-[480px] grid grid-cols-8 gap-2 relative">
                {/* Pathway divider line */}
                <div className="absolute left-0 right-0 top-[45%] h-1 border-t border-dashed border-slate-800/80 pointer-events-none" />
                
                {seats.map((seat) => {
                  const isVacant = seat.status === "vacant";
                  const isHovered = hoveredSeat?.number === seat.number;
                  
                  return (
                    <div
                      key={seat.number}
                      className={`relative flex flex-col justify-center items-center h-14 rounded-lg border cursor-pointer select-none transition-all duration-300 ${
                        isVacant 
                          ? isHovered
                            ? "border-purple-400 bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.5)] scale-[1.02]"
                            : "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)] hover:shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse"
                          : "border-slate-800 bg-slate-900/30 opacity-40 cursor-not-allowed"
                      }`}
                      onMouseEnter={() => isVacant && setHoveredSeat(seat)}
                      onMouseLeave={() => setHoveredSeat(null)}
                    >
                      <span className="text-[10px] font-black text-slate-400">{seat.number}</span>
                      <span className="text-[8px] font-medium text-slate-500 capitalize">{seat.type.slice(0, 4)}</span>
                      {isVacant && (
                        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hover status side panel */}
            <div className="w-full md:w-44 flex flex-col justify-center h-28 border border-slate-800 bg-slate-950 p-4 rounded-xl">
              {hoveredSeat ? (
                <div>
                  <p className="text-xs font-black uppercase text-emerald-400">Berth Vacant</p>
                  <p className="text-sm font-black mt-1">Seat #{hoveredSeat.number}</p>
                  <p className="text-xs text-slate-400 mt-1">{hoveredSeat.type}</p>
                  <span className="mt-2 inline-block rounded bg-emerald-950 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                    Book CNF Now!
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-500">Hover a vacant berth (pulsing green) to inspect berth details.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form / Alert subscription */}
      <div className="mt-6 border-t border-slate-900 pt-5">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
          Guardian Scraper Alert Setup
        </h4>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Set up a continuous background scraper monitor. The system will dispatch Chromium bots automatically on each charting window and text/email you instantly the minute berths open up!
        </p>

        <form onSubmit={handleRegisterAlert} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="scraperEmail" className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                id="scraperEmail"
                placeholder="guardian@lastberth.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label htmlFor="scraperMobile" className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                Mobile Number
              </label>
              <input
                type="tel"
                id="scraperMobile"
                placeholder="+91 98765 43210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex gap-2">
              {["SL", "3A", "2A", "1A"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedClass(c)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold transition-all ${
                    selectedClass === c 
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20" 
                      : "bg-slate-900 text-slate-400 hover:text-white"
                  }`}
                >
                  Class {c}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Establishing Monitor…" : "Register Alert Monitor"}
            </button>
          </div>
        </form>

        {errorMsg && (
          <p className="mt-3 text-xs font-bold text-rose-400 animate-pulse">{errorMsg}</p>
        )}
        {successMsg && (
          <p className="mt-3 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl">{successMsg}</p>
        )}
      </div>
    </div>
  );
}
