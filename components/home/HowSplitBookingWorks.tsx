"use client";

import { useState } from "react";
import { Train, CheckCircle2, XCircle, ArrowRight, Sparkles, ShieldCheck, RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface HowSplitBookingWorksProps {
  className?: string;
}

export function HowSplitBookingWorks({
  className,
}: HowSplitBookingWorksProps) {
  const [activeTab, setActiveTab] = useState<"visual" | "why">("visual");

  return (
    <section
      aria-labelledby="split-booking-heading"
      className={cn(
        "mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:max-w-4xl",
        className,
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        {/* Header section */}
        <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/10">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              How LastBerth Works
            </span>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
              <button
                type="button"
                onClick={() => setActiveTab("visual")}
                className={cn(
                  "rounded-md px-3 py-1 transition-all",
                  activeTab === "visual"
                    ? "bg-white font-semibold text-slate-900 shadow-xs"
                    : "hover:text-slate-900",
                )}
              >
                Graphic Example
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("why")}
                className={cn(
                  "rounded-md px-3 py-1 transition-all",
                  activeTab === "why"
                    ? "bg-white font-semibold text-slate-900 shadow-xs"
                    : "hover:text-slate-900",
                )}
              >
                Why It Works
              </button>
            </div>
          </div>

          <h2
            id="split-booking-heading"
            className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
          >
            Direct Ticket Waitlisted? How We Find You Confirmed Seats
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            Indian Railways divides train berths across intermediate station quotas.
            When direct tickets are sold out, empty seats are almost always available
            across intermediate legs of the <span className="font-semibold text-slate-800">exact same train</span>.
          </p>
        </div>

        {/* Tab 1: Visual graphic comparison */}
        {activeTab === "visual" ? (
          <div className="p-5 sm:p-7 space-y-6">
            {/* Example Train Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-2 font-medium">
                <Train className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>
                  Real Route Example:{" "}
                  <strong className="font-semibold text-slate-900">
                    Delhi to Ajmer (Train 12015 Ajmer Shatabdi)
                  </strong>
                </span>
              </div>
              <span className="inline-flex items-center rounded-md bg-blue-100/60 px-2 py-0.5 font-semibold text-blue-800 text-[11px]">
                Same Train · No Train Switch
              </span>
            </div>

            {/* Comparison Cards: Direct vs LastBerth */}
            <div className="grid gap-5 md:grid-cols-2">
              {/* Card A: Traditional direct search */}
              <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                      Standard Direct Booking
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                      <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                      Waitlisted
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <div>
                      <div className="text-xs font-bold text-slate-400">FROM</div>
                      <div className="text-base font-bold text-slate-900">Delhi</div>
                      <div className="text-xs text-slate-500">NDLS</div>
                    </div>
                    <div className="flex-1 px-3">
                      <div className="relative flex items-center justify-center">
                        <div className="w-full border-t-2 border-dashed border-rose-300" />
                        <span className="absolute bg-rose-50 px-2 text-[10px] font-bold text-rose-600">
                          WL 45
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-400">TO</div>
                      <div className="text-base font-bold text-slate-900">Ajmer</div>
                      <div className="text-xs text-slate-500">AII</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-white/80 p-3 text-xs text-rose-900/90 border border-rose-100">
                    <p className="font-semibold text-rose-900">Direct booking result:</p>
                    <p className="mt-0.5 text-slate-600">
                      Waiting List (WL 45). High chance of non-confirmation. E-tickets get
                      auto-cancelled if waitlisted at chart preparation.
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-rose-200/60 pt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  Direct quota exhausted across standard booking apps
                </div>
              </div>

              {/* Card B: LastBerth Split Discovery */}
              <div className="flex flex-col justify-between rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 sm:p-5 relative ring-1 ring-emerald-500/10">
                <div className="absolute -top-3 right-4 rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-xs">
                  LastBerth Solution
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      3-Ticket Quota Split
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      100% Confirmed
                    </span>
                  </div>

                  <div className="mt-3 text-xs text-slate-600">
                    We discover <strong className="font-semibold text-slate-900">3 contiguous confirmed tickets</strong> on the same train:
                  </div>

                  {/* 3 tickets visual list */}
                  <div className="mt-3 space-y-2">
                    {/* Leg 1 */}
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-2.5 shadow-2xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <span>Delhi (NDLS)</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          <span>Jaipur (JP)</span>
                        </div>
                        <div className="text-[11px] text-slate-500">Ticket 1 of 3</div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100/80 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        AVAILABLE 3
                      </span>
                    </div>

                    {/* Leg 2 */}
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-2.5 shadow-2xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <span>Jaipur (JP)</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          <span>Kishangarh (KSG)</span>
                        </div>
                        <div className="text-[11px] text-slate-500">Ticket 2 of 3</div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100/80 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        AVAILABLE 8
                      </span>
                    </div>

                    {/* Leg 3 */}
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-2.5 shadow-2xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <span>Kishangarh (KSG)</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          <span>Ajmer (AII)</span>
                        </div>
                        <div className="text-[11px] text-slate-500">Ticket 3 of 3</div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100/80 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        AVAILABLE 14
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-emerald-200/60 pt-3 text-[11px] font-medium text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>You stay on board the whole way from Delhi to Ajmer with confirmed seats!</span>
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* Tab 2: Why it works explainer */
          <div className="p-5 sm:p-7 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">
                  100% Legal IRCTC Booking
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Booking consecutive legs for the same passenger on the same train
                  is completely permitted under official Indian Railways ticketing guidelines.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">
                  Same Train, Same Journey
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  You board your train at your origin and alight at your destination.
                  You never change trains or wait on platforms between legs.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">
                  Instant Algorithmic Scan
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  LastBerth scans dozens of station combinations along the train's route
                  in seconds to assemble contiguous confirmed segments automatically.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="font-semibold text-blue-900">
                    Why does direct quota sell out while split quotas have seats?
                  </strong>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    Indian Railways allocates specific quotas (General Quota, Remote Location Quota, Pooled Quota)
                    to different station pairs along a route. High-demand city pairs like Delhi → Ajmer
                    often exhaust their General Quota weeks in advance. However, station quotas like
                    Delhi → Jaipur, Jaipur → Kishangarh, or Kishangarh → Ajmer often retain unsold seats
                    on that identical departure date!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
