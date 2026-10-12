"use client";
import { createFreeChartAlert } from "@/lib/chart-alert-payments";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { apiClient } from "@/lib/api";
import { trackAlertRequested } from "@/lib/analytics/track";
import { isValidEmail } from "@/lib/validation";
import { useContactFields } from "@/lib/contact";

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
  const { email, setEmail, mobile, setMobile, persistContact } =
    useContactFields();
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
    const berthTypes: (
      "Lower" | "Middle" | "Upper" | "Side Lower" | "Side Upper"
    )[] = [
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

  const handleRegisterAlert = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const em = email.trim() || undefined;
      const mob = mobile.trim() || undefined;

      if (!em) {
        setErrorMsg("Please enter an email address for alerts.");
        return;
      }
      if (!isValidEmail(em)) {
        setErrorMsg("Please enter a valid email address.");
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
          setErrorMsg(
            validated.errors?.[0]?.message ||
              "Validation failed. Ensure train operates on date.",
          );
          setSubmitting(false);
          return;
        }

        // Submit
        await createFreeChartAlert({
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

        setSuccessMsg(
          "Guardian Scraper Monitor successfully established! We will alert you immediately upon berth release.",
        );
        trackAlertRequested({
          success: true,
          source: "live_scraper_cockpit",
          trainNumber: trainNumber.trim(),
          trainName: trainName || undefined,
          fromCode: fromStationCode.trim().toUpperCase(),
          toCode: toStationCode.trim().toUpperCase(),
          journeyDate: journeyDate.trim(),
          classCode: selectedClass.trim().toUpperCase(),
          email: em || undefined,
          mobile: mob || undefined,
        });

        persistContact();
      } catch (err: unknown) {
        const e = err as {
          response?: { data?: { message?: string } };
          message?: string;
        };
        const errMsg =
          e.response?.data?.message || e.message || "Failed to set up monitor.";
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
          email: em || undefined,
          mobile: mob || undefined,
          error: errMsg,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      email,
      mobile,
      persistContact,
      selectedClass,
      trainNumber,
      trainName,
      fromStationCode,
      toStationCode,
      journeyDate,
      trainStartDate,
    ],
  );

  return (
    <div
      className={`relative mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl transition-all duration-300 ${inlineMode ? "" : "mx-auto max-w-2xl"}`}
    >
      {/* Synthwave neon mesh lines */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(147,51,234,0.15),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Header section */}
      <div className="relative flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-black text-purple-400 ring-1 ring-purple-400/20">
            <span className="h-2 w-2 animate-ping rounded-full bg-purple-500" />
            Synthwave Scraper Cockpit
          </span>
          <h2 className="mt-2 text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
            Live Monitoring Console
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Realtime session tracker scanning vacant charting quotas.
          </p>
        </div>

        {/* Countdown Ring */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-2.5">
          <svg className="h-10 w-10 rotate-[-90deg]" aria-hidden="true">
            <circle
              cx="20"
              cy="20"
              r="16"
              className="fill-none stroke-slate-800"
              strokeWidth="3"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              className="fill-none stroke-purple-500"
              strokeWidth="3"
              strokeDasharray="100"
              strokeDashoffset="30"
              strokeLinecap="round"
            />
          </svg>
          <div className="text-left">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Chart Preparation ETA
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-purple-400">
              {formatCountdown(countdown)}
            </span>
          </div>
        </div>
      </div>

      {/* Trigger & Terminal Section */}
      <div className="mt-6">
        {!scraperActive ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 px-4 py-8 text-center">
            <svg
              className="h-12 w-12 animate-pulse text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <h4 className="mt-4 text-sm font-extrabold uppercase tracking-wide">
              No Active Scraper Session
            </h4>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Trigger a live session to solve capthas and scan vacant berths on
              the train coach map.
            </p>
            <button
              type="button"
              onClick={() => setScraperActive(true)}
              className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(147,51,234,0.4)] transition-all hover:bg-purple-500 active:scale-95"
            >
              Initialize Neon Scraper
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-black/95 p-4 shadow-inner">
            <div className="mb-3 flex items-center justify-between border-b border-slate-900 pb-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                Playwright-Chromium @ LB-Scraper
              </span>
            </div>

            <div className="h-40 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-400">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="select-none text-slate-600">
                    {(idx + 1).toString().padStart(2, "0")}
                  </span>
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
        <div className="animate-in fade-in mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 duration-700">
          <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">
            Realtime 2D Coach Berth Layout
          </h4>

          <div className="flex flex-col items-center gap-6 md:flex-row">
            {/* The interactive Blueprint grid layout */}
            <div className="relative w-full flex-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="relative grid min-w-[480px] grid-cols-8 gap-2">
                {/* Pathway divider line */}
                <div className="pointer-events-none absolute left-0 right-0 top-[45%] h-1 border-t border-dashed border-slate-800/80" />

                {seats.map((seat) => {
                  const isVacant = seat.status === "vacant";
                  const isHovered = hoveredSeat?.number === seat.number;

                  return (
                    <div
                      key={seat.number}
                      className={`relative flex h-14 cursor-pointer select-none flex-col items-center justify-center rounded-lg border transition-all duration-300 ${
                        isVacant
                          ? isHovered
                            ? "scale-[1.02] border-purple-400 bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                            : "animate-pulse border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.1)] hover:bg-emerald-500/20 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                          : "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-40"
                      }`}
                      onMouseEnter={() => isVacant && setHoveredSeat(seat)}
                      onMouseLeave={() => setHoveredSeat(null)}
                    >
                      <span className="text-[10px] font-black text-slate-400">
                        {seat.number}
                      </span>
                      <span className="text-[8px] font-medium capitalize text-slate-500">
                        {seat.type.slice(0, 4)}
                      </span>
                      {isVacant && (
                        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hover status side panel */}
            <div className="flex h-28 w-full flex-col justify-center rounded-xl border border-slate-800 bg-slate-950 p-4 md:w-44">
              {hoveredSeat ? (
                <div>
                  <p className="text-xs font-black uppercase text-emerald-400">
                    Berth Vacant
                  </p>
                  <p className="mt-1 text-sm font-black">
                    Seat #{hoveredSeat.number}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {hoveredSeat.type}
                  </p>
                  <span className="mt-2 inline-block rounded border border-emerald-500/30 bg-emerald-950 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                    Book CNF Now!
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-500">
                    Hover a vacant berth (pulsing green) to inspect berth
                    details.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form / Alert subscription */}
      <div className="mt-6 border-t border-slate-900 pt-5">
        <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">
          Guardian Scraper Alert Setup
        </h4>
        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          Set up a continuous background scraper monitor. The system will
          dispatch Chromium bots automatically on each charting window and
          text/email you instantly the minute berths open up!
        </p>

        <form onSubmit={handleRegisterAlert} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="scraperEmail"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400"
              >
                Email Address *
              </label>
              <input
                type="email"
                id="scraperEmail"
                required
                placeholder="guardian@lastberth.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            {/* Mobile number field commented out - email is mandatory
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
            */}
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
              className="rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-purple-500/20 transition-all hover:scale-[1.02] hover:bg-purple-500 active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Establishing Monitor…" : "Register Alert Monitor"}
            </button>
          </div>
        </form>

        {errorMsg && (
          <p className="mt-3 animate-pulse text-xs font-bold text-rose-400">
            {errorMsg}
          </p>
        )}
        {successMsg && (
          <p className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs font-bold text-emerald-400">
            {successMsg}
          </p>
        )}
      </div>
    </div>
  );
}
