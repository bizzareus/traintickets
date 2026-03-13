"use client";

import { useState, useEffect } from "react";
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

type CheckResult = {
  status: string;
  resultPayload?: {
    vbd?: VacantBerthItem[];
    error?: string | null;
    summary?: string;
    composition?: Service2Composition;
    openAiSummary?: string | null;
    openAiBookingPlan?: { instruction?: string; approx_price?: number }[];
    openAiTotalPrice?: number;
    trainSchedule?: {
      stationList?: { stationCode?: string; stationName?: string; arrivalTime?: string; departureTime?: string }[];
    } | null;
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

function getDateOptions() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toYmd = (d: Date) => d.toISOString().slice(0, 10);
  const toLabel = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return [
    { value: toYmd(yesterday), label: `Yesterday (${toLabel(yesterday)})` },
    { value: toYmd(today), label: `Today (${toLabel(today)})` },
    { value: toYmd(tomorrow), label: `Tomorrow (${toLabel(tomorrow)})` },
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
    .slice(0, 15);
  const toOptions = stationsForRoute
    .filter(
      (s) =>
        s.code.toLowerCase().includes(to.toLowerCase()) ||
        s.name.toLowerCase().includes(to.toLowerCase()),
    )
    .slice(0, 15);

  const trainFilter = trainInput.toLowerCase();
  const trainDropdownOptions = trainFilter
    ? trainOptions.filter(
        (t) =>
          t.label.toLowerCase().includes(trainFilter) ||
          t.number.toLowerCase().includes(trainFilter),
      )
    : trainOptions;
  const trainDatalistOptions = trainDropdownOptions.slice(0, 200);

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

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50">
      <header className="border-b border-slate-100 bg-white/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-blue-600 tracking-tight">
            CnfTicket.com
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-10">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-slate-800 leading-tight tracking-tight">
            Get confirmed ticket for immediate journeys in your preferred train
          </h1>
          <p className="mt-2 text-slate-500 text-sm">
            Search once. We find the best seat options for you.
          </p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="min-w-0">
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">
                  Train Number or Name
                </label>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50/50 border border-slate-200 px-3 py-3.5 min-h-[48px] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                  <TrainIcon className="h-5 w-5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={trainInput}
                    onChange={(e) => setTrainInput(e.target.value)}
                    placeholder={
                      trainsLoading
                        ? "Loading trains…"
                        : "Search train number or name"
                    }
                    list="train-list"
                    className="w-full min-w-0 bg-transparent text-slate-800 text-base placeholder:text-slate-400 outline-none"
                    autoComplete="off"
                  />
                </div>
                <datalist id="train-list">
                  {trainDatalistOptions.map((t) => (
                    <option key={`${t.number}-${t.label}`} value={t.label} />
                  ))}
                </datalist>
              </div>

              <div className={`min-w-0 ${scheduleError ? "opacity-60" : ""}`}>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">
                  From
                </label>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50/50 border border-slate-200 px-3 py-3.5 min-h-[48px] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                  <TrainIcon className="h-5 w-5 text-slate-400 shrink-0" />
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
                    list="from-list"
                    disabled={!!scheduleError}
                    className="w-full min-w-0 bg-transparent text-slate-800 text-base placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:opacity-90"
                  />
                </div>
                <datalist id="from-list">
                  {stationOptions.map((s) => (
                    <option key={s.code} value={`${s.code} - ${s.name}`} />
                  ))}
                </datalist>
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

              <div className={`min-w-0 ${scheduleError ? "opacity-60" : ""}`}>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">
                  To
                </label>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50/50 border border-slate-200 px-3 py-3.5 min-h-[48px] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                  <TrainIcon className="h-5 w-5 text-slate-400 shrink-0" />
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
                    list="to-list"
                    disabled={!!scheduleError}
                    className="w-full min-w-0 bg-transparent text-slate-800 text-base placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:opacity-90"
                  />
                </div>
                <datalist id="to-list">
                  {toOptions.map((s) => (
                    <option key={s.code} value={`${s.code} - ${s.name}`} />
                  ))}
                </datalist>
              </div>

              <div className="min-w-0">
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">
                  Departure Date
                </label>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50/50 border border-slate-200 px-3 py-3.5 min-h-[48px] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                  <CalendarIcon className="h-5 w-5 text-slate-400 shrink-0" />
                  <select
                    value={journeyDate}
                    onChange={(e) => setJourneyDate(e.target.value)}
                    required
                    className="w-full min-w-0 bg-transparent text-slate-800 text-base outline-none focus:ring-0 border-0 p-0"
                  >
                    {dateOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
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
            <div className="flex justify-center mb-4">
              <div className="h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-slate-600 text-sm font-medium">
              Finding you the best possible seats…
            </p>
          </div>
        )}

        {checkResult && !loading && (
          <section className="mt-6 rounded-2xl bg-slate-100/60 py-4 px-0">
            {payload?.serviceSource === "service2" ? (
              checkResult.status === "failed" || apiError ? (
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
                  {/* Train header - stacked on mobile */}
                  <div className="border-b border-slate-100 px-4 py-4">
                    <div className="flex flex-col gap-3">
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
                        {payload.chartPreparationDetails?.firstChartCreationTime && (
                          <p className="mt-1.5 text-xs text-slate-500">
                            Chart preparation:{" "}
                            {payload.chartPreparationDetails.firstChartCreationTime}
                            {payload.chartPreparationDetails.chartingStationCode
                              ? ` at ${payload.chartPreparationDetails.chartingStationCode}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Booking tiles - vertical stack on mobile, full width */}
                  <div className="px-4 py-4 space-y-3">
                    {payload.openAiBookingPlan.map(
                      (
                        item: { instruction?: string; approx_price?: number },
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
                        // IRCTC URL expects 2A, 3A, 1A (not 2AC, 3AC, 1AC)
                        const irctcClass = classCode.replace(/AC$/i, "A");
                        const stationLabel = (code: string) => {
                          const s = stationsForRoute.find(
                            (x) =>
                              x.code.toUpperCase() ===
                              String(code).trim().toUpperCase(),
                          );
                          return s ? `${s.code} - ${s.name}` : code;
                        };
                        const scheduleList = payload.trainSchedule?.stationList ?? [];
                        const originStation = scheduleList.find(
                          (st) =>
                            String(st.stationCode ?? "").toUpperCase() ===
                            origin.toUpperCase(),
                        );
                        const destStation = scheduleList.find(
                          (st) =>
                            String(st.stationCode ?? "").toUpperCase() ===
                            destination.toUpperCase(),
                        );
                        const dateLabel =
                          journeyDate &&
                          (() => {
                            const d = new Date(journeyDate + "T12:00:00");
                            return isNaN(d.getTime())
                              ? ""
                              : d.toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                });
                          })();
                        const price =
                          typeof item === "object" &&
                          typeof item?.approx_price === "number"
                            ? item.approx_price
                            : null;
                        const bookUrl =
                          origin && destination && trainNumber
                            ? `https://www.irctc.co.in/nget/redirect?${new URLSearchParams(
                                {
                                  from: origin,
                                  to: destination,
                                  trainNo: trainNumber,
                                  class: irctcClass,
                                  page: "train-chart",
                                },
                              ).toString()}`
                            : "https://www.irctc.co.in/eticketing/login";
                        return (
                          <div
                            key={i}
                            className="flex flex-col rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-4 w-full shadow-sm"
                          >
                            <p className="text-2m font-semibold text-slate-500 mb-1.5">
                              Ticket {i + 1}
                              <span className="ml-5 inline-flex w-fit rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                                {classCode}
                              </span>
                            </p>

                            <div className="mt-2 text-sm font-medium text-slate-800">
                              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                                <span className="font-semibold">
                                  {stationLabel(origin)}
                                </span>
                                {(originStation?.departureTime || dateLabel) && (
                                  <span className="text-xs text-slate-500 font-normal">
                                    {originStation?.departureTime
                                      ? `Dep ${originStation.departureTime}${dateLabel ? `, ${dateLabel}` : ""}`
                                      : dateLabel
                                        ? dateLabel
                                        : ""}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-slate-500">
                                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
                              </div>
                              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                                <span className="font-semibold">
                                  {stationLabel(destination)}
                                </span>
                                {(destStation?.arrivalTime ||
                                  destStation?.departureTime ||
                                  dateLabel) && (
                                  <span className="text-xs text-slate-500 font-normal">
                                    {(destStation?.arrivalTime ??
                                      destStation?.departureTime)
                                      ? `Arr ${destStation?.arrivalTime ?? destStation?.departureTime}${dateLabel ? `, ${dateLabel}` : ""}`
                                      : dateLabel
                                        ? dateLabel
                                        : ""}
                                  </span>
                                )}
                              </div>
                            </div>
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
                    )}
                  </div>

                  {typeof payload.openAiTotalPrice === "number" && (
                    <div className="border-t border-slate-100 px-4 py-3 flex justify-end">
                      <span className="text-slate-800 font-semibold text-sm">
                        Total approx. fare: ~ ₹
                        {payload.openAiTotalPrice.toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}
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
      </main>
    </div>
  );
}
