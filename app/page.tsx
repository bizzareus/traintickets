"use client";

import { useState, useEffect, Fragment } from "react";
import Lottie from "lottie-react";
import { apiClient } from "@/lib/api";

type Station = { code: string; name: string };
type TrainOption = { number: string; label: string };

function TrainIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-1.607-1.274-2.905-2.846-2.905A2.846 2.846 0 008.25 4.77v.958m0 0v.041a2.25 2.25 0 01-.659 1.591L5 10.25m14 0l2.659-2.591A2.25 2.25 0 0021.75 5.77v-.041m-13.5 0v.041a2.25 2.25 0 01-.659 1.591L5 10.25"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronUpDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
      />
    </svg>
  );
}

type VacantBerthItem = {
  coachName: string;
  cabinCoupe: string | null;
  cabinCoupeNo: string;
  berthCode: string;
  berthNumber: number;
  from: string;
  to: string;
  splitNo: number;
};

type ChartPreparationDetails = {
  firstChartCreationTime?: string;
  chartingStationCode?: string;
  chartingStationName?: string;
  journeyDate?: string;
};

type LongestPathAvailable = {
  fromStationCode?: string;
  fromStationName?: string;
  toStationCode?: string;
  toStationName?: string;
  available?: boolean;
  availabilityByClass?: Record<string, string>;
};

type Service2Composition = {
  trainNo?: string;
  trainName?: string;
  from?: string;
  to?: string;
};

type Leg = {
  fromCode: string;
  toCode: string;
  hasTicket: boolean;
  planItem?: { instruction?: string; approx_price?: number };
};

type CheckResult = {
  status: string;
  resultPayload?: {
    vbd?: VacantBerthItem[];
    error?: string | null;
    summary?: string;
    composition?: Service2Composition;
    openAiSummary?: string | null;
    openAiBookingPlan?: { instruction?: string; approx_price?: number }[];
    openAiStructuredSeats?: Array<{
      coach?: string;
      berth?: string;
      class?: string;
      seat?: string;
      from?: string;
      to?: string;
    }>;
    openAiTotalPrice?: number;
    trainSchedule?: {
      stationList?: {
        stationCode?: string;
        stationName?: string;
        arrivalTime?: string;
        departureTime?: string;
      }[];
    } | null;
    chartStatus?:
      | { kind: "not_prepared_yet"; message: string }
      | { kind: "chart_error"; error: string };
    attempts?: { time?: string; action?: string; result?: string }[];
    bookings?: { from?: string; to?: string; status?: string }[];
    fullJourneyConfirmed?: boolean;
    chartPreparationDetails?: ChartPreparationDetails;
    fullRouteStations?: {
      stationCode?: string;
      stationName?: string;
      sequenceOrder?: number;
    }[];
    longestPathAvailable?: LongestPathAvailable;
    [k: string]: unknown;
  };
};

/** Format date as YYYY-MM-DD in local timezone (toISOString is UTC and can shift the date). */
function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateOptions() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toLabel = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return [
    {
      value: toYmdLocal(yesterday),
      label: `Yesterday (${toLabel(yesterday)})`,
    },
    { value: toYmdLocal(today), label: `Today (${toLabel(today)})` },
    { value: toYmdLocal(tomorrow), label: `Tomorrow (${toLabel(tomorrow)})` },
  ];
}

export default function HomePage() {
  const dateOptions = getDateOptions();
  const defaultDate = dateOptions[1].value; // today
  const [trainInput, setTrainInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [journeyDate, setJourneyDate] = useState(defaultDate);
  const [stations, setStations] = useState<Station[]>([]);
  const [trainOptions, setTrainOptions] = useState<TrainOption[]>([]);
  const [trainsLoading, setTrainsLoading] = useState(true);
  const [scheduleStations, setScheduleStations] = useState<Station[] | null>(
    null,
  );
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monitoringLeg, setMonitoringLeg] = useState<{
    fromCode: string;
    toCode: string;
  } | null>(null);
  const [monitorStations, setMonitorStations] = useState<
    Array<{
      stationCode: string;
      stationName: string;
      chartOneTime: string;
      chartTwoTime: string | null;
      chartTwoDayOffset: number;
    }>
  >([]);
  const [monitorSelected, setMonitorSelected] = useState<Set<string>>(
    new Set(),
  );
  const [monitorSubmitting, setMonitorSubmitting] = useState(false);
  const [monitorSuccess, setMonitorSuccess] = useState<string | null>(null);
  const [monitorJourneyResponse, setMonitorJourneyResponse] = useState<{
    journeyRequestId: string;
    tasks: { stationCode: string; chartAt: string; status: string }[];
  } | null>(null);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorEmail, setMonitorEmail] = useState("");
  const [monitorMobile, setMonitorMobile] = useState("");
  const [metroAnimData, setMetroAnimData] = useState<object | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    apiClient
      .get<Station[]>("/api/stations")
      .then((r) => setStations(Array.isArray(r.data) ? r.data : []))
      .catch(() => setStations([]));
  }, []);

  useEffect(() => {
    apiClient
      .get<TrainOption[]>("/api/irctc/trains")
      .then((r) => setTrainOptions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTrainOptions([]))
      .finally(() => setTrainsLoading(false));
  }, []);

  const trainNumber = trainInput.includes(" - ")
    ? trainInput.split(" - ")[0].trim()
    : trainInput.trim();
  const trainSelected = trainInput.includes(" - ");

  useEffect(() => {
    setFrom("");
    setTo("");
  }, [trainNumber]);

  useEffect(() => {
    if (!trainSelected || !trainNumber) {
      setScheduleStations(null);
      setScheduleError(null);
      return;
    }
    setScheduleLoading(true);
    setScheduleStations(null);
    setScheduleError(null);
    apiClient
      .get<{ stationList?: { stationCode?: string; stationName?: string }[] }>(
        `/api/irctc/schedule/${encodeURIComponent(trainNumber)}`,
      )
      .then((r) => {
        const list = r.data?.stationList;
        if (Array.isArray(list) && list.length > 0) {
          const stations = list
            .map((s) => ({
              code: String(s.stationCode ?? "").trim(),
              name: String(s.stationName ?? "").trim(),
            }))
            .filter((s) => s.code);
          setScheduleStations(stations);
          setScheduleError(null);
          if (stations.length > 0) {
            setFrom(`${stations[0].code} - ${stations[0].name}`);
            setTo("");
          }
        } else {
          setScheduleStations([]);
        }
      })
      .catch(
        (err: {
          response?: { data?: { message?: string; error?: string } };
        }) => {
          const data = err.response?.data;
          const msg =
            data?.message ??
            data?.error ??
            "Failed to load schedule. Please try again.";
          setScheduleError(msg);
          setScheduleStations(null);
        },
      )
      .finally(() => setScheduleLoading(false));
  }, [trainNumber, trainSelected]);

  // When user opens Monitor for a gap leg, fetch stations for that leg
  useEffect(() => {
    if (!monitoringLeg || !trainNumber) return;
    setMonitorStations([]);
    setMonitorSelected(new Set());
    setMonitorSuccess(null);
    setMonitorError(null);
    setMonitorEmail("");
    setMonitorMobile("");
    apiClient
      .get<{
        stations: Array<{
          stationCode: string;
          stationName: string;
          chartOneTime: string;
          chartTwoTime: string | null;
          chartTwoDayOffset: number;
        }>;
      }>("/api/availability/journey/stations", {
        params: {
          trainNumber,
          fromStationCode: monitoringLeg.fromCode,
          toStationCode: monitoringLeg.toCode,
        },
      })
      .then((r) => {
        const list = r.data?.stations ?? [];
        setMonitorStations(list);
        setMonitorSelected(new Set(list.map((s) => s.stationCode)));
      })
      .catch(() => {
        setMonitorStations([]);
        setMonitorError("Failed to load stations.");
      });
  }, [monitoringLeg, trainNumber]);

  // Load Metro Rail Lottie when check is loading (dynamic import, cached after first load)
  useEffect(() => {
    if (loading && !metroAnimData) {
      import("./Metro Rail.json")
        .then((m: { default: object }) => setMetroAnimData(m.default))
        .catch(() => setMetroAnimData(null));
    }
  }, [loading, metroAnimData]);

  // Re-init Flowbite after mount and when dropdowns appear (avoids hydration mismatch from Popper.js)
  useEffect(() => {
    if (!mounted) return;
    import("flowbite").then((fb) => {
      if (typeof fb.initFlowbite === "function") fb.initFlowbite();
    });
  }, [mounted, scheduleError, scheduleStations]);

  const fromCode = from.includes(" - ")
    ? from.split(" - ")[0].trim()
    : from.trim();
  const toCode = to.includes(" - ") ? to.split(" - ")[0].trim() : to.trim();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (scheduleError) return;
    if (!trainNumber.trim() || !fromCode || !journeyDate) {
      setError("Please enter train number, from station and date.");
      return;
    }
    setError(null);
    setCheckResult(null);
    setLoading(true);
    try {
      const { data } = await apiClient.post("/api/service2/check", {
        trainNumber: trainNumber.trim(),
        stationCode: fromCode,
        journeyDate: journeyDate.trim(),
        classCode: "3A",
        destinationStation: toCode || undefined,
      });
      setCheckResult({
        status: data.status ?? "success",
        resultPayload: {
          serviceSource: "service2",
          composition: data.composition,
          chartPreparationDetails: data.chartPreparationDetails,
          vacantBerth: data.vacantBerth,
          openAiSummary: data.openAiSummary,
          openAiStructuredSeats: data.openAiStructuredSeats ?? [],
          openAiBookingPlan: data.openAiBookingPlan ?? [],
          openAiTotalPrice: data.openAiTotalPrice,
          trainSchedule: data.trainSchedule ?? undefined,
          chartStatus: data.chartStatus ?? undefined,
          vbd: data.vacantBerth?.vbd ?? [],
          error: data.vacantBerth?.error ?? null,
        },
      });
      if (data.vacantBerth?.error) setError(String(data.vacantBerth.error));
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      setError(
        ax.response?.data?.message ??
          ax.response?.data?.error ??
          "Request failed. Is the API running?",
      );
    } finally {
      setLoading(false);
    }
  }

  function swapFromTo() {
    setFrom(to);
    setTo(from);
  }

  const stationsForRoute = scheduleStations?.length
    ? scheduleStations
    : stations;
  const stationOptions = stationsForRoute
    .filter(
      (s) =>
        s.code.toLowerCase().includes(from.toLowerCase()) ||
        s.name.toLowerCase().includes(from.toLowerCase()),
    )
    .slice(0, 50);
  const toOptions = stationsForRoute
    .filter(
      (s) =>
        s.code.toLowerCase().includes(to.toLowerCase()) ||
        s.name.toLowerCase().includes(to.toLowerCase()),
    )
    .slice(0, 50);

  const trainFilter = trainInput.toLowerCase();
  const trainDropdownOptions = trainFilter
    ? trainOptions.filter(
        (t) =>
          t.label.toLowerCase().includes(trainFilter) ||
          t.number.toLowerCase().includes(trainFilter),
      )
    : trainOptions;
  const payload = checkResult?.resultPayload;
  const vbd = payload?.vbd ?? [];
  const apiError = payload?.error;
  const hasBerths = vbd.length > 0;
  const summary = payload?.summary;
  const attempts = payload?.attempts;
  const bookings = payload?.bookings;
  const fullJourneyConfirmed = payload?.fullJourneyConfirmed;
  const chartDetails = payload?.chartPreparationDetails;
  const fullRouteStations = payload?.fullRouteStations ?? [];
  const longestPath = payload?.longestPathAvailable;
  const hasChartResult =
    chartDetails || fullRouteStations.length > 0 || longestPath;

  // Build full journey legs (ticket + gap) from route and booking plan
  const scheduleList =
    payload?.trainSchedule?.stationList ??
    scheduleStations?.map((s) => ({
      stationCode: s.code,
      stationName: s.name,
    }));
  const routeStationsRaw = Array.isArray(scheduleList)
    ? scheduleList
        .map((s) => ({
          code: String(s.stationCode ?? "")
            .trim()
            .toUpperCase(),
          name: String(s.stationName ?? "").trim(),
        }))
        .filter((s) => s.code)
    : [];
  const fromIdx = routeStationsRaw.findIndex((s) => s.code === fromCode);
  const toIdx = routeStationsRaw.findIndex((s) => s.code === toCode);
  const routeStations =
    fromIdx >= 0 && toIdx >= 0 && fromIdx < toIdx
      ? routeStationsRaw.slice(fromIdx, toIdx + 1)
      : [];
  const openAiPlan = payload?.openAiBookingPlan ?? [];
  const openAiStructuredSeats = payload?.openAiStructuredSeats ?? [];
  // Parse plan segments: each item is a bookable segment (from, to, class, price) — may span multiple stations
  const planSegments = openAiPlan.map(
    (item: { instruction?: string; approx_price?: number }) => {
      const instr = typeof item === "string" ? item : (item?.instruction ?? "");
      const parts = instr.split(" - ").map((p) => p.trim());
      return {
        fromCode: (parts[0] ?? "").toUpperCase(),
        toCode: (parts[1] ?? "").toUpperCase(),
        classCode: parts[2]?.trim() ?? "3A",
        approx_price: item?.approx_price ?? null,
        instruction: instr,
      };
    },
  );
  // Route index of a station code (for coverage check)
  const routeIndex = (code: string) =>
    routeStations.findIndex(
      (s) => s.code === String(code).trim().toUpperCase(),
    );
  // Check if a consecutive route pair (fromCode, toCode) at indices (i, i+1) is covered by any plan segment
  const isPairCovered = (fromCodeLeg: string, toCodeLeg: string) => {
    const i = routeIndex(fromCodeLeg);
    const j = routeIndex(toCodeLeg);
    if (i < 0 || j !== i + 1) return false;
    return planSegments.some((seg) => {
      const segFromIdx = routeIndex(seg.fromCode);
      const segToIdx = routeIndex(seg.toCode);
      return (
        segFromIdx >= 0 && segToIdx >= 0 && segFromIdx <= i && segToIdx >= j
      );
    });
  };
  // Ticket cards: one per plan segment (Book). Gap cards: consecutive route pairs not covered (Monitor).
  const ticketCards = planSegments.filter((seg) => seg.fromCode && seg.toCode);
  const gapLegs: Leg[] =
    routeStations.length >= 2
      ? Array.from({ length: routeStations.length - 1 }, (_, i) => {
          const fromCodeLeg = routeStations[i].code;
          const toCodeLeg = routeStations[i + 1].code;
          return {
            fromCode: fromCodeLeg,
            toCode: toCodeLeg,
            hasTicket: false,
            planItem: undefined,
          };
        }).filter((leg) => !isPairCovered(leg.fromCode, leg.toCode))
      : [];
  const totalApproxPrice =
    ticketCards.length > 0
      ? ticketCards.reduce((sum, seg) => sum + (seg.approx_price ?? 0), 0)
      : typeof payload?.openAiTotalPrice === "number"
        ? payload.openAiTotalPrice
        : null;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50">
      <header
        className="border-b border-slate-100 bg-white/95 backdrop-blur-sm sticky top-0 z-10"
        role="banner"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-blue-600 tracking-tight">
            LastBerth
          </span>
        </div>
      </header>

      <main
        className="mx-auto max-w-lg px-4 py-6 pb-10"
        role="main"
        id="main-content"
      >
        <section aria-labelledby="hero-heading" className="text-center mb-6">
          <h1
            id="hero-heading"
            className="text-xl font-semibold text-slate-800 leading-tight tracking-tight"
          >
            LastBerth – Get confirmed ticket for immediate journeys in your
            preferred train
          </h1>
          <p className="mt-2 text-slate-500 text-sm">
            Search once. We find the best seat options for you.
          </p>
        </section>

        <form
          onSubmit={handleSearch}
          className="space-y-4"
          aria-label="Search train and find seat availability"
        >
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="min-w-0 relative">
                <label
                  htmlFor="train-dropdown-button"
                  className="block text-m font-semibold text-gray-900 mb-1.5"
                >
                  Train Number or Name
                </label>
                <div
                  id="train-dropdown-button"
                  role="button"
                  tabIndex={0}
                  data-dropdown-toggle="train-dropdown"
                  data-dropdown-trigger="click"
                  className="grid w-full grid-cols-1 cursor-default rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") e.preventDefault();
                  }}
                >
                  <input
                    type="text"
                    value={trainInput}
                    onChange={(e) => setTrainInput(e.target.value)}
                    placeholder={
                      trainsLoading
                        ? "Loading trains…"
                        : "Search train number or name"
                    }
                    className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 text-inherit placeholder:text-gray-400"
                    autoComplete="off"
                  />
                  <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                    <ChevronUpDownIcon className="size-5 text-gray-500" />
                  </span>
                </div>
                {mounted && (
                  <div
                    id="train-dropdown"
                    className="z-10 hidden absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5"
                  >
                    <ul
                      className="text-base sm:text-sm"
                      aria-labelledby="train-dropdown-button"
                    >
                      {trainDropdownOptions.slice(0, 100).map((t) => {
                        const selected = trainInput === t.label;
                        return (
                          <li key={`${t.number}-${t.label}`}>
                            <button
                              type="button"
                              className="relative block w-full cursor-default py-2 pl-3 pr-9 text-left text-gray-900 select-none focus:bg-indigo-600 focus:text-white focus:outline-none"
                              onClick={() => {
                                setTrainInput(t.label);
                                document
                                  .getElementById("train-dropdown")
                                  ?.classList.add("hidden");
                              }}
                            >
                              <span className="block truncate font-normal">
                                {t.label}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-indigo-600">
                                  <CheckIcon className="size-5" />
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div
                className={`min-w-0 relative ${scheduleError ? "opacity-60" : ""}`}
              >
                <label
                  htmlFor="from-dropdown-button"
                  className="block text-medium font-semibold text-gray-900 mb-1.5"
                >
                  From
                </label>
                <div
                  id="from-dropdown-button"
                  role="button"
                  tabIndex={scheduleError ? -1 : 0}
                  {...(!scheduleError && {
                    "data-dropdown-toggle": "from-dropdown",
                    "data-dropdown-trigger": "click",
                  })}
                  className="grid w-full grid-cols-1 cursor-default rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px] disabled:pointer-events-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") e.preventDefault();
                  }}
                >
                  <input
                    type="text"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder={
                      scheduleLoading
                        ? "Loading route…"
                        : scheduleStations
                          ? "Boarding station"
                          : "Station code"
                    }
                    disabled={!!scheduleError}
                    className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 text-inherit placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-90"
                  />
                  <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                    <ChevronUpDownIcon className="size-5 text-gray-500" />
                  </span>
                </div>
                {mounted && !scheduleError && (
                  <div
                    id="from-dropdown"
                    className="z-10 hidden absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5"
                  >
                    <ul
                      className="text-base sm:text-sm"
                      aria-labelledby="from-dropdown-button"
                    >
                      {stationOptions.map((s) => {
                        const optionLabel = `${s.code} - ${s.name}`;
                        const selected = from === optionLabel;
                        return (
                          <li key={s.code}>
                            <button
                              type="button"
                              className="relative block w-full cursor-default py-2 pl-3 pr-9 text-left text-gray-900 select-none focus:bg-indigo-600 focus:text-white focus:outline-none"
                              onClick={() => {
                                setFrom(optionLabel);
                                document
                                  .getElementById("from-dropdown")
                                  ?.classList.add("hidden");
                              }}
                            >
                              <span className="block truncate font-normal">
                                {s.code} – {s.name}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-indigo-600">
                                  <CheckIcon className="size-5" />
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={swapFromTo}
                  disabled={!!scheduleError}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:bg-slate-200 active:text-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Swap from and to"
                >
                  <SwapIcon className="h-5 w-5" />
                </button>
              </div>

              <div
                className={`min-w-0 relative ${scheduleError ? "opacity-60" : ""}`}
              >
                <label
                  htmlFor="to-dropdown-button"
                  className="block text-medium font-semibold text-gray-900 mb-1.5"
                >
                  To
                </label>
                <div
                  id="to-dropdown-button"
                  role="button"
                  tabIndex={scheduleError ? -1 : 0}
                  {...(!scheduleError && {
                    "data-dropdown-toggle": "to-dropdown",
                    "data-dropdown-trigger": "click",
                  })}
                  className="grid w-full grid-cols-1 cursor-default rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px] disabled:pointer-events-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") e.preventDefault();
                  }}
                >
                  <input
                    type="text"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder={
                      scheduleLoading
                        ? "Loading route…"
                        : scheduleStations
                          ? "Destination station"
                          : "Station code"
                    }
                    disabled={!!scheduleError}
                    className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 text-inherit placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-90"
                  />
                  <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                    <ChevronUpDownIcon className="size-5 text-gray-500" />
                  </span>
                </div>
                {mounted && !scheduleError && (
                  <div
                    id="to-dropdown"
                    className="z-10 hidden absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5"
                  >
                    <ul
                      className="text-base sm:text-sm"
                      aria-labelledby="to-dropdown-button"
                    >
                      {toOptions.map((s) => {
                        const optionLabel = `${s.code} - ${s.name}`;
                        const selected = to === optionLabel;
                        return (
                          <li key={s.code}>
                            <button
                              type="button"
                              className="relative block w-full cursor-default py-2 pl-3 pr-9 text-left text-gray-900 select-none focus:bg-indigo-600 focus:text-white focus:outline-none"
                              onClick={() => {
                                setTo(optionLabel);
                                document
                                  .getElementById("to-dropdown")
                                  ?.classList.add("hidden");
                              }}
                            >
                              <span className="block truncate font-normal">
                                {s.code} – {s.name}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-indigo-600">
                                  <CheckIcon className="size-5" />
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="departure-date-select"
                  className="block text-medium font-semibold text-gray-900 mb-1.5"
                >
                  Departure Date
                </label>
                <div className="grid w-full grid-cols-1 cursor-default rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px]">
                  <select
                    id="departure-date-select"
                    value={journeyDate}
                    onChange={(e) => setJourneyDate(e.target.value)}
                    required
                    className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 p-0 text-inherit appearance-none cursor-pointer"
                  >
                    {dateOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                    <ChevronUpDownIcon className="size-5 text-gray-500" />
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 pt-0">
              <button
                type="submit"
                disabled={loading || !!scheduleError}
                className="w-full rounded-xl bg-blue-600 py-4 min-h-[48px] font-semibold text-white text-base active:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>
        </form>

        {!loading && !checkResult && (
          <section className="mt-8 mb-4">
            <h2 className="text-center text-base font-semibold text-slate-800 mb-6">
              How it works
            </h2>
            <div className="grid grid-cols-1 gap-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold text-sm mb-3">
                  1
                </div>
                <h3 className="font-medium text-slate-800 text-sm mb-1">
                  Search
                </h3>
                <p className="text-slate-500 text-sm">
                  Enter your train, from, to and date above.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold text-sm mb-3">
                  2
                </div>
                <h3 className="font-medium text-slate-800 text-sm mb-1">
                  We find options
                </h3>
                <p className="text-slate-500 text-sm">
                  We check availability and suggest the best seat options for
                  you.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold text-sm mb-3">
                  3
                </div>
                <h3 className="font-medium text-slate-800 text-sm mb-1">
                  Book
                </h3>
                <p className="text-slate-500 text-sm">
                  Click Book on a journey to complete your booking on IRCTC.
                </p>
              </div>
            </div>
          </section>
        )}

        {(scheduleError || error) && (
          <div className="mt-4 rounded-xl bg-red-50/80 border border-red-100 px-4 py-3 text-red-700 text-sm">
            {scheduleError ?? error}
          </div>
        )}

        {loading && !checkResult && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="flex justify-center mb-4 min-h-[200px] items-center">
              {metroAnimData ? (
                <Lottie
                  animationData={metroAnimData}
                  loop
                  className="w-120 h-56 max-w-full"
                />
              ) : (
                <div className="h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              )}
            </div>
            <p className="text-slate-600 text-sm font-medium">
              Finding you the best possible seats…
            </p>
          </div>
        )}

        {checkResult && !loading && (
          <section className="mt-6 rounded-2xl bg-slate-100/60 py-4 px-0">
            {payload?.serviceSource === "service2" ? (
              payload.chartStatus ? (
                <div className="rounded-2xl border border-amber-200/90 bg-white p-4 shadow-md">
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <p className="font-medium text-amber-900 text-sm">
                      {payload.chartStatus.kind === "not_prepared_yet"
                        ? payload.chartStatus.message
                        : payload.chartStatus.error}
                    </p>
                    {payload.chartStatus.kind === "not_prepared_yet" &&
                      fromCode &&
                      toCode && (
                        <p className="mt-2 text-sm text-amber-800">
                          We can check at chart preparation time and notify you
                          when seats are available. Choose which stations to
                          monitor below.
                        </p>
                      )}
                    <div className="mt-4 flex flex-wrap gap-3">
                      {payload.chartStatus.kind === "not_prepared_yet" &&
                        fromCode &&
                        toCode && (
                          <button
                            type="button"
                            onClick={() =>
                              setMonitoringLeg({
                                fromCode,
                                toCode,
                              })
                            }
                            className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white active:bg-amber-700 transition"
                          >
                            Monitor at chart time
                          </button>
                        )}
                      <a
                        href="https://www.irctc.co.in/eticketing/login"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-medium text-amber-900 no-underline active:bg-amber-50 transition"
                      >
                        Open IRCTC →
                      </a>
                    </div>
                  </div>
                </div>
              ) : checkResult.status === "failed" || apiError ? (
                <div className="rounded-2xl border border-red-200/80 bg-white p-4 shadow-md">
                  <div className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-4 min-h-[44px] flex items-center">
                    <p className="font-medium text-red-800 text-sm">
                      {apiError || "Request failed."}
                    </p>
                  </div>
                </div>
              ) : Array.isArray(payload.openAiBookingPlan) &&
                payload.openAiBookingPlan.length > 0 ? (
                <div className="rounded-2xl border border-slate-200/90 bg-white shadow-lg overflow-hidden">
                  {/* Train header with total fare on top right */}
                  <div className="border-b border-slate-100 px-4 py-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 leading-tight">
                        {trainNumber} {payload.composition?.trainName ?? ""}
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                        <span>{payload.composition?.from ?? fromCode}</span>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>
                          {(payload.composition?.to ?? toCode) || "—"}
                        </span>
                      </p>
                      {payload.chartPreparationDetails
                        ?.firstChartCreationTime && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Chart preparation:{" "}
                          {
                            payload.chartPreparationDetails
                              .firstChartCreationTime
                          }
                          {payload.chartPreparationDetails.chartingStationCode
                            ? ` at ${payload.chartPreparationDetails.chartingStationCode}`
                            : ""}
                        </p>
                      )}
                    </div>
                    {totalApproxPrice != null && totalApproxPrice > 0 && (
                      <div className="shrink-0 text-right">
                        <p className="text-slate-800 font-semibold text-sm">
                          Total approx. fare
                        </p>
                        <p className="text-slate-900 font-bold text-base">
                          ₹{totalApproxPrice.toLocaleString("en-IN")}
                        </p>
                      </div>
                    )}
                  </div>

                  {payload.openAiSummary && (
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-sm font-semibold text-slate-700 leading-snug">
                        {payload.openAiSummary}
                      </p>
                    </div>
                  )}

                  {/* Full journey: plan segments as Book cards, then gap legs as Monitor cards */}
                  <div className="px-4 py-4 space-y-3">
                    {ticketCards.length > 0 || gapLegs.length > 0 ? (
                      <>
                        {ticketCards.map((seg, i) => {
                          const stationLabel = (code: string) => {
                            const s = stationsForRoute.find(
                              (x) =>
                                x.code.toUpperCase() ===
                                String(code).trim().toUpperCase(),
                            );
                            return s ? `${s.code} - ${s.name}` : code;
                          };
                          const seatsForSegment = openAiStructuredSeats.filter(
                            (s) =>
                              String(s.from ?? "")
                                .trim()
                                .toUpperCase() === seg.fromCode &&
                              String(s.to ?? "")
                                .trim()
                                .toUpperCase() === seg.toCode,
                          );
                          const scheduleListWithTimes =
                            payload?.trainSchedule?.stationList ?? [];
                          const fromStationSchedule =
                            scheduleListWithTimes.find(
                              (s) =>
                                String(s.stationCode ?? "")
                                  .trim()
                                  .toUpperCase() === seg.fromCode,
                            );
                          const toStationSchedule = scheduleListWithTimes.find(
                            (s) =>
                              String(s.stationCode ?? "")
                                .trim()
                                .toUpperCase() === seg.toCode,
                          );
                          const depTime =
                            fromStationSchedule?.departureTime?.trim() || null;
                          const arrTime =
                            toStationSchedule?.arrivalTime?.trim() ||
                            toStationSchedule?.departureTime?.trim() ||
                            null;
                          const irctcClass = seg.classCode.replace(/AC$/i, "A");
                          const bookUrl =
                            seg.fromCode && seg.toCode && trainNumber
                              ? `https://www.irctc.co.in/nget/redirect?${new URLSearchParams(
                                  {
                                    origin: seg.fromCode,
                                    destination: seg.toCode,
                                    trainNo: trainNumber,
                                    class: irctcClass,
                                    quota: "GN",
                                  },
                                ).toString()}`
                              : "https://www.irctc.co.in/eticketing/login";
                          return (
                            <Fragment
                              key={`ticket-${seg.fromCode}-${seg.toCode}-${i}`}
                            >
                              {i > 0 && (
                                <div className="flex justify-center py-1">
                                  <ChevronDownIcon className="h-10 w-10 text-slate-400" />
                                </div>
                              )}
                              <div className="flex flex-col rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-4 w-full shadow-sm">
                                <p className="text-sm font-semibold text-slate-500 mb-1.5">
                                  Ticket {i + 1}
                                  <span className="ml-2 inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                    {seg.classCode}
                                  </span>
                                </p>
                                <div className="flex items-start gap-2 text-sm font-medium text-slate-800">
                                  <div className="min-w-0 flex-1">
                                    <p className="leading-tight">
                                      {stationLabel(seg.fromCode)}
                                    </p>
                                    {depTime && (
                                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                                        Dep {depTime}
                                      </p>
                                    )}
                                  </div>
                                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <p className="leading-tight">
                                      {stationLabel(seg.toCode)}
                                    </p>
                                    {arrTime && (
                                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                                        Arr {arrTime}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {seatsForSegment.length > 0 && (
                                  <p className="mt-2 text-sm text-slate-600">
                                    {seatsForSegment
                                      .map(
                                        (s) =>
                                          `Coach ${s.coach ?? "—"}, Berth ${s.berth ?? "—"}${s.seat ? `, ${s.seat}` : ""}`,
                                      )
                                      .join(" · ")}
                                  </p>
                                )}
                                {seg.approx_price != null && (
                                  <p className="mt-2 text-base font-semibold text-slate-900">
                                    <span className="text-xs text-slate-500">
                                      approx
                                    </span>{" "}
                                    ₹{seg.approx_price.toLocaleString("en-IN")}
                                  </p>
                                )}
                                <a
                                  href={bookUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-4 rounded-xl bg-emerald-600 px-4 py-3.5 min-h-[48px] flex items-center justify-center text-base font-semibold text-white no-underline active:bg-emerald-700 transition"
                                >
                                  Book
                                </a>
                              </div>
                            </Fragment>
                          );
                        })}
                        {gapLegs.map((leg) => {
                          const stationLabel = (code: string) => {
                            const s = stationsForRoute.find(
                              (x) =>
                                x.code.toUpperCase() ===
                                String(code).trim().toUpperCase(),
                            );
                            return s ? `${s.code} - ${s.name}` : code;
                          };
                          const routeLabel = `${stationLabel(leg.fromCode)} → ${stationLabel(leg.toCode)}`;
                          return (
                            <div
                              key={`gap-${leg.fromCode}-${leg.toCode}`}
                              className="flex flex-col rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-4 w-full shadow-sm"
                            >
                              <p className="text-sm font-semibold text-slate-500 mb-1.5">
                                No tickets
                              </p>
                              <p className="text-sm font-medium text-slate-800">
                                {routeLabel}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setMonitoringLeg({
                                    fromCode: leg.fromCode,
                                    toCode: leg.toCode,
                                  })
                                }
                                className="mt-4 rounded-xl bg-amber-600 px-4 py-3.5 min-h-[48px] flex items-center justify-center text-base font-semibold text-white active:bg-amber-700 transition"
                              >
                                Monitor
                              </button>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      openAiPlan.map(
                        (
                          item: {
                            instruction?: string;
                            approx_price?: number;
                          },
                          i: number,
                        ) => {
                          const instruction =
                            typeof item === "string"
                              ? item
                              : (item?.instruction ?? "");
                          const parts = instruction.split(" - ");
                          const origin = parts[0]?.trim() ?? "";
                          const destination = parts[1]?.trim() ?? "";
                          const classCode = parts[2]?.trim() ?? "3A";
                          const irctcClass = classCode.replace(/AC$/i, "A");
                          const stationLabel = (code: string) => {
                            const s = stationsForRoute.find(
                              (x) =>
                                x.code.toUpperCase() ===
                                String(code).trim().toUpperCase(),
                            );
                            return s ? `${s.code} - ${s.name}` : code;
                          };
                          const price =
                            typeof item === "object" &&
                            typeof item?.approx_price === "number"
                              ? item.approx_price
                              : null;
                          const bookUrl =
                            origin && destination && trainNumber
                              ? `https://www.irctc.co.in/nget/redirect?${new URLSearchParams(
                                  {
                                    origin,
                                    destination,
                                    trainNo: trainNumber,
                                    class: irctcClass,
                                    quota: "GN",
                                  },
                                ).toString()}`
                              : "https://www.irctc.co.in/eticketing/login";
                          return (
                            <div
                              key={i}
                              className="flex flex-col rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-4 w-full shadow-sm"
                            >
                              <p className="text-sm font-semibold text-slate-500 mb-1.5">
                                Ticket {i + 1}
                                <span className="ml-2 inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                  {classCode}
                                </span>
                              </p>
                              <p className="text-sm font-medium text-slate-800">
                                {stationLabel(origin)} →{" "}
                                {stationLabel(destination)}
                              </p>
                              {price != null && (
                                <p className="mt-2 text-base font-semibold text-slate-900">
                                  <span className="text-xs text-slate-500">
                                    approx
                                  </span>{" "}
                                  ₹{price.toLocaleString("en-IN")}
                                </p>
                              )}
                              <a
                                href={bookUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-4 rounded-xl bg-emerald-600 px-4 py-3.5 min-h-[48px] flex items-center justify-center text-base font-semibold text-white no-underline active:bg-emerald-700 transition"
                              >
                                Book
                              </a>
                            </div>
                          );
                        },
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/90 bg-white shadow-lg overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4">
                    <h2 className="text-base font-bold text-slate-900">
                      {trainNumber} {payload.composition?.trainName ?? ""}
                    </h2>
                  </div>
                  <div className="p-4">
                    <div className="rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-6 text-center">
                      <p className="font-medium text-red-800 text-sm">
                        No tickets found between these stations
                      </p>
                      <p className="mt-1 text-sm text-red-700/90">
                        Try a different date, train, or route.
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Chart & availability result
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Train {trainNumber} • {fromCode} → {toCode || "—"} •{" "}
                  {journeyDate}
                </p>
                {checkResult.status === "failed" || apiError ? (
                  <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4">
                    <p className="font-medium text-red-800">
                      {apiError || "Request failed."}
                    </p>
                  </div>
                ) : (
                  <>
                    {chartDetails && (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                        <p className="text-sm font-medium text-slate-700">
                          Chart preparation
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          First chart: {chartDetails.firstChartCreationTime} •
                          Charting station: {chartDetails.chartingStationName} (
                          {chartDetails.chartingStationCode}) • Date:{" "}
                          {chartDetails.journeyDate}
                        </p>
                      </div>
                    )}
                    {fullRouteStations.length > 0 &&
                      payload?.serviceSource !== "service2" && (
                        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="text-sm font-medium text-slate-700">
                            Full route ({fullRouteStations.length} stations)
                          </p>
                          <p className="mt-1 text-sm text-slate-600 font-mono">
                            {fullRouteStations.map((s, i) => (
                              <span key={i}>
                                {i > 0 ? " → " : ""}
                                {s.stationCode}
                              </span>
                            ))}
                          </p>
                        </div>
                      )}
                    {longestPath && payload?.serviceSource !== "service2" && (
                      <div
                        className={`mt-4 rounded-xl border p-4 ${longestPath.available ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}
                      >
                        <p className="text-sm font-medium text-slate-700">
                          Longest path available
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {longestPath.fromStationName} (
                          {longestPath.fromStationCode}) →{" "}
                          {longestPath.toStationName} (
                          {longestPath.toStationCode})
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {longestPath.available
                            ? "Seats available"
                            : "No confirmed seats on this segment"}
                        </p>
                        {longestPath.availabilityByClass &&
                          Object.keys(longestPath.availabilityByClass).length >
                            0 && (
                            <p className="mt-1 text-xs text-slate-500">
                              By class:{" "}
                              {Object.entries(longestPath.availabilityByClass)
                                .map(([cls, status]) => `${cls}: ${status}`)
                                .join(", ")}
                            </p>
                          )}
                      </div>
                    )}
                    {fullJourneyConfirmed &&
                      payload?.serviceSource !== "service2" && (
                        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4">
                          <p className="font-medium text-green-800">
                            Full journey confirmed.
                          </p>
                        </div>
                      )}
                    {summary && payload?.serviceSource !== "service2" && (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                        <p className="text-sm font-medium text-slate-700">
                          Summary
                        </p>
                        <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">
                          {summary}
                        </p>
                      </div>
                    )}
                    {Array.isArray(bookings) &&
                      bookings.length > 0 &&
                      payload?.serviceSource !== "service2" && (
                        <div className="mt-4">
                          <p className="text-sm font-medium text-slate-700">
                            Bookings
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-600">
                            {bookings.map((b, i) => (
                              <li key={i}>
                                {b.from} → {b.to}: {b.status ?? "—"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {Array.isArray(attempts) &&
                      attempts.length > 0 &&
                      payload?.serviceSource !== "service2" && (
                        <div className="mt-4">
                          <p className="text-sm font-medium text-slate-700">
                            Attempts
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-600">
                            {attempts.map((a, i) => (
                              <li key={i}>
                                {a.action ?? a.result ?? JSON.stringify(a)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {hasBerths && (
                      <>
                        <p className="mt-4 font-medium text-green-800">
                          {vbd.length} vacant berth{vbd.length !== 1 ? "s" : ""}{" "}
                          found.
                        </p>
                        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                              <tr>
                                <th className="px-4 py-2">Coach</th>
                                <th className="px-4 py-2">Berth</th>
                                <th className="px-4 py-2">Type</th>
                                <th className="px-4 py-2">From</th>
                                <th className="px-4 py-2">To</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vbd.map((row, i) => (
                                <tr
                                  key={i}
                                  className="border-t border-slate-100 hover:bg-slate-50/50"
                                >
                                  <td className="px-4 py-2 font-mono">
                                    {row.coachName}
                                  </td>
                                  <td className="px-4 py-2">
                                    {row.berthNumber}
                                  </td>
                                  <td className="px-4 py-2">{row.berthCode}</td>
                                  <td className="px-4 py-2">{row.from}</td>
                                  <td className="px-4 py-2">{row.to}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    {!hasChartResult &&
                      !summary &&
                      !hasBerths &&
                      (Array.isArray(bookings)
                        ? bookings.length === 0
                        : true) && (
                        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="text-sm text-slate-600">
                            Check the Browser Use job output for full details.
                          </p>
                        </div>
                      )}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* Monitor modal: select stations to watch for a gap leg */}
        {monitoringLeg && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-title"
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col">
              <div className="p-4 border-b border-slate-100">
                <h2
                  id="monitor-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Monitor {monitoringLeg.fromCode} → {monitoringLeg.toCode}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  We’ll check at each selected station’s chart time for new
                  tickets.
                </p>
              </div>
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {monitorError && (
                  <p className="text-sm text-red-600">{monitorError}</p>
                )}
                {monitorSuccess && (
                  <p className="text-sm text-emerald-600">{monitorSuccess}</p>
                )}
                {monitorJourneyResponse && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200/80 p-4 space-y-3">
                    <p className="text-sm font-medium text-emerald-900">
                      Monitoring started
                    </p>
                    <p className="text-sm text-emerald-800">
                      We will check when the chart prepares at the selected
                      station(s). Chart times we’ll monitor:
                    </p>
                    <ul className="text-sm text-emerald-800 list-disc list-inside space-y-1">
                      {monitorJourneyResponse.tasks.map((t, i) => (
                        <li key={`${t.stationCode}-${t.chartAt}-${i}`}>
                          {t.stationCode} –{" "}
                          {new Date(t.chartAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-emerald-800 pt-2 border-t border-emerald-200/60">
                      If tickets become available, we’ll notify you by WhatsApp
                      and email. Please book immediately on IRCTC to avoid them
                      selling out.
                    </p>
                  </div>
                )}
                {!monitorJourneyResponse && (
                  <>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={monitorEmail}
                        onChange={(e) => setMonitorEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      />
                      <label className="block text-sm font-medium text-slate-700">
                        Mobile
                      </label>
                      <input
                        type="tel"
                        value={monitorMobile}
                        onChange={(e) => setMonitorMobile(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      />
                    </div>
                    {monitorStations.length === 0 && !monitorError && (
                      <p className="text-sm text-slate-500">
                        Loading stations…
                      </p>
                    )}
                    {monitorStations.length > 0 && (
                      <>
                        <p className="text-sm font-medium text-slate-700">
                          Stations to monitor (we’ll check at each chart time)
                        </p>
                        <ul className="space-y-2">
                          {monitorStations.map((s) => (
                            <li
                              key={s.stationCode}
                              className="flex items-center gap-3"
                            >
                              <input
                                type="checkbox"
                                id={`monitor-${s.stationCode}`}
                                checked={monitorSelected.has(s.stationCode)}
                                onChange={(e) => {
                                  setMonitorSelected((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked)
                                      next.add(s.stationCode);
                                    else next.delete(s.stationCode);
                                    return next;
                                  });
                                }}
                                className="rounded border-slate-300"
                              />
                              <label
                                htmlFor={`monitor-${s.stationCode}`}
                                className="text-sm font-medium text-slate-800 cursor-pointer"
                              >
                                {s.stationCode} – {s.stationName}
                                <span className="ml-1 text-slate-500 font-normal">
                                  ({s.chartOneTime}
                                  {s.chartTwoTime
                                    ? `, ${s.chartTwoTime}${s.chartTwoDayOffset ? " +1d" : ""}`
                                    : ""}
                                  )
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 flex gap-3">
                {monitorJourneyResponse ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMonitoringLeg(null);
                      setMonitorStations([]);
                      setMonitorSelected(new Set());
                      setMonitorSuccess(null);
                      setMonitorJourneyResponse(null);
                      setMonitorError(null);
                      setMonitorEmail("");
                      setMonitorMobile("");
                    }}
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Close
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMonitoringLeg(null);
                        setMonitorStations([]);
                        setMonitorSelected(new Set());
                        setMonitorSuccess(null);
                        setMonitorJourneyResponse(null);
                        setMonitorError(null);
                        setMonitorEmail("");
                        setMonitorMobile("");
                      }}
                      className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={monitorSubmitting || monitorSelected.size === 0}
                      onClick={async () => {
                        if (!monitoringLeg || monitorSelected.size === 0)
                          return;
                        setMonitorSubmitting(true);
                        setMonitorError(null);
                        setMonitorSuccess(null);
                        try {
                          const { data } = await apiClient.post<{
                            journeyRequestId: string;
                            tasks: {
                              id: string;
                              stationCode: string;
                              chartAt: string;
                              status: string;
                            }[];
                          }>("/api/availability/journey", {
                            trainNumber: trainNumber.trim(),
                            fromStationCode: monitoringLeg.fromCode,
                            toStationCode: monitoringLeg.toCode,
                            journeyDate: journeyDate.trim(),
                            classCode: "3A",
                            stationCodesToMonitor: Array.from(monitorSelected),
                            email: monitorEmail.trim() || undefined,
                            mobile: monitorMobile.trim() || undefined,
                          });
                          setMonitorJourneyResponse({
                            journeyRequestId: data.journeyRequestId,
                            tasks: data.tasks ?? [],
                          });
                        } catch (err: unknown) {
                          const ax = err as {
                            response?: { data?: { message?: string } };
                          };
                          setMonitorError(
                            ax.response?.data?.message ?? "Request failed.",
                          );
                        } finally {
                          setMonitorSubmitting(false);
                        }
                      }}
                      className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700"
                    >
                      {monitorSubmitting ? "Starting…" : "Start monitoring"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
