"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  Mail,
  Phone,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { trackTatkalAlertRequested } from "@/lib/analytics/track";
import { isValidIndianMobile, isValidEmail } from "@/lib/validation";
import {
  calculateTatkalWindow,
  formatReadableDateIST,
  formatYmdIST,
  getISTNow,
  type ClassCategory,
} from "@/lib/tatkalPlanner";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

export default function TatkalPlannerClient() {
  const [journeyDate, setJourneyDate] = useState("");
  const [classCategory, setClassCategory] = useState<ClassCategory>("AC");
  const [originOffsetDays, setOriginOffsetDays] = useState(0);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [mobileInput, setMobileInput] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    const now = getISTNow();
    setJourneyDate(formatYmdIST(new Date(now.getTime() + 24 * 3600000)));
  }, []);

  const windowResult = useMemo(
    () => journeyDate ? calculateTatkalWindow(journeyDate, classCategory, originOffsetDays) : null,
    [journeyDate, classCategory, originOffsetDays],
  );

  const countdown = useMemo(() => {
    if (!windowResult) return { text: "--:--:--", live: false, past: false };
    const target = new Date(windowResult.tatkalOpeningTimeIST).getTime();
    const nowDate = getISTNow();
    const now = nowDate.getTime() - nowDate.getTimezoneOffset() * 60000;
    const difference = target - now;
    if (difference <= 0 && difference >= -3600000) return { text: "OPEN NOW", live: true, past: false };
    if (difference < -3600000) return { text: "WINDOW CLOSED", live: false, past: true };
    const totalSeconds = Math.floor(difference / 1000);
    return {
      text: `${String(Math.floor(totalSeconds / 3600)).padStart(2, "0")} : ${String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0")} : ${String(totalSeconds % 60).padStart(2, "0")}`,
      live: false,
      past: false,
    };
  }, [windowResult]);

  const handleSubscribeAlert = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!windowResult) return;
    const email = emailInput.trim();
    const mobile = mobileInput.trim();
    if (!email && !mobile) {
      setSubscribeError("Enter an email address or WhatsApp number.");
      return;
    }
    if (email && !isValidEmail(email)) {
      setSubscribeError("Please enter a valid email address.");
      return;
    }
    if (mobile && !isValidIndianMobile(mobile)) {
      setSubscribeError(
        "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).",
      );
      return;
    }
    setSubscribing(true);
    setSubscribeError(null);
    try {
      await apiClient.post("/api/availability/tatkal-alert", {
        email: email || undefined,
        mobile: mobile || undefined,
        category: classCategory,
        journeyDate,
        tatkalDate: windowResult.tatkalBookingDateStr,
        tatkalTime: windowResult.tatkalOpeningTimeFormatted,
        originOffsetDays,
      });
      setSubscribeSuccess(true);
      trackTatkalAlertRequested({ success: true, category: classCategory, source: "tatkal_planner_inline", journeyDate, tatkalDate: windowResult.tatkalBookingDateStr, tatkalTime: windowResult.tatkalOpeningTimeFormatted, email: email || undefined, mobile: mobile || undefined, originOffsetDays });
    } catch (error: unknown) {
      const response = error as { response?: { data?: { message?: string } } };
      const message = response.response?.data?.message || "Could not set the reminder. Please try again.";
      setSubscribeError(message);
      trackTatkalAlertRequested({ success: false, category: classCategory, source: "tatkal_planner_inline", journeyDate, tatkalDate: windowResult.tatkalBookingDateStr, tatkalTime: windowResult.tatkalOpeningTimeFormatted, email: email || undefined, mobile: mobile || undefined, originOffsetDays, error: message });
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="space-y-5">
      {windowResult && <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><BellRing className="h-5 w-5" /></div><div><h3 className="font-bold text-slate-900">Want a reminder?</h3><p className="mt-1 text-sm text-slate-600">Get a free reminder 15 minutes before opening.</p></div></div>{!showAlertForm && !subscribeSuccess && <button type="button" onClick={() => setShowAlertForm(true)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">Set a free reminder</button>}</div>{subscribeSuccess ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Reminder set successfully.</div> : showAlertForm && <form onSubmit={handleSubscribeAlert} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="sr-only" htmlFor="alert-email">Email address</label><div className="relative"><input id="alert-email" type="email" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} placeholder="Email address" className={`${fieldClassName} mt-0 pr-10`} /><Mail className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-400" /></div><label className="sr-only" htmlFor="alert-mobile">WhatsApp number</label><div className="relative"><input id="alert-mobile" type="tel" value={mobileInput} onChange={(event) => setMobileInput(event.target.value)} placeholder="WhatsApp number" className={`${fieldClassName} mt-0 pr-10`} /><Phone className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-400" /></div><button type="submit" disabled={subscribing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{subscribing ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving</> : "Save reminder"}</button>{subscribeError && <p className="text-xs font-medium text-rose-600 sm:col-span-3">{subscribeError}</p>}</form>}</section>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-7 max-w-2xl"><h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">When does your Tatkal booking open?</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Enter your journey date. We’ll show the exact booking date and time for you.</p></div>
        <div className="grid gap-5 md:grid-cols-3">
          <div><label htmlFor="journey-date" className="text-sm font-bold text-slate-900">Your journey date</label><div className="relative"><input id="journey-date" type="date" value={journeyDate} onChange={(event) => setJourneyDate(event.target.value)} className={`${fieldClassName} pr-11`} /><CalendarDays className="pointer-events-none absolute right-4 top-5 h-4 w-4 text-slate-400" /></div><p className="mt-1.5 text-xs text-slate-500">The day you board the train.</p></div>
          <div><span className="text-sm font-bold text-slate-900">Your train class</span><div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Train class">{(["AC", "NON_AC"] as const).map((category) => <button key={category} type="button" onClick={() => setClassCategory(category)} className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${classCategory === category ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>{category === "AC" ? "AC" : "Sleeper / 2S"}<span className={`mt-1 block text-xs font-medium ${classCategory === category ? "text-blue-100" : "text-slate-500"}`}>{category === "AC" ? "Opens at 10 AM" : "Opens at 11 AM"}</span></button>)}</div></div>
          <div><label htmlFor="origin-offset" className="text-sm font-bold text-slate-900">Does the train start earlier?</label><select id="origin-offset" value={originOffsetDays} onChange={(event) => setOriginOffsetDays(Number(event.target.value))} className={fieldClassName}><option value={0}>No — starts on journey date</option><option value={1}>Yes — starts 1 day earlier</option><option value={2}>Yes — starts 2 days earlier</option></select><p className="mt-1.5 flex items-start gap-1 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Check the train’s starting station, not just your boarding station.</p></div>
        </div>

        {windowResult && <div className="mt-8 overflow-hidden rounded-2xl bg-slate-900 text-white"><div className="p-5 sm:p-7"><p className="text-sm font-semibold text-blue-300">Your Tatkal booking opens</p><div className="mt-2 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="text-3xl font-black tracking-tight sm:text-4xl">{formatReadableDateIST(windowResult.tatkalBookingDateStr)}</p><p className="mt-1 text-lg font-bold text-white">at {windowResult.tatkalOpeningTimeFormatted}</p></div><div className="rounded-xl bg-white/10 px-4 py-3 sm:min-w-44 sm:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{countdown.live || countdown.past ? "Status" : "Time left"}</p><p className={`mt-1 font-mono text-xl font-black ${countdown.live ? "text-emerald-300" : "text-amber-300"}`}>{countdown.text}</p></div></div><div className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-xs text-slate-300 sm:grid-cols-2"><p><Clock3 className="mr-1 inline h-3.5 w-3.5 text-amber-300" /> Be ready by <strong className="text-white">{windowResult.recommendedLoginTime}</strong></p><p><Info className="mr-1 inline h-3.5 w-3.5 text-blue-300" /> Train starts on <strong className="text-white">{formatReadableDateIST(windowResult.originDepartureDateStr)}</strong></p></div></div><div className={`px-5 py-3 text-sm font-bold ${countdown.live ? "bg-emerald-500 text-white" : countdown.past ? "bg-slate-800 text-slate-300" : "bg-blue-700 text-white"}`}>{countdown.live ? "Booking is open now — book on IRCTC." : countdown.past ? "This booking window has closed." : "Keep your passenger details ready before opening time."}</div></div>}
      </section>

    </div>
  );
}
