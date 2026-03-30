"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";

const MONITOR_CONTACT_STORAGE_KEY = "lastBerth_monitor_contact";

type Station = { code: string; name: string };
type TrainOption = { number: string; label: string };

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

function SearchLoaderTrainSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 112 28"
      width={112}
      height={28}
      aria-hidden
    >
      <rect x="4" y="6" width="34" height="16" rx="3" fill="#2563eb" />
      <rect x="28" y="4" width="10" height="9" rx="2" fill="#1d4ed8" />
      <rect x="10" y="9" width="12" height="7" rx="1" fill="#bfdbfe" />
      <path d="M4 18 L0 21 L4 21 Z" fill="#1e3a8a" />
      <rect x="40" y="8" width="28" height="14" rx="2" fill="#3b82f6" />
      <rect x="70" y="8" width="28" height="14" rx="2" fill="#60a5fa" />
      <circle cx="14" cy="22" r="4" fill="#0f172a" />
      <circle cx="26" cy="22" r="4" fill="#0f172a" />
      <circle cx="52" cy="22" r="3.5" fill="#0f172a" />
      <circle cx="66" cy="22" r="3.5" fill="#0f172a" />
      <circle cx="84" cy="22" r="3.5" fill="#0f172a" />
      <circle cx="98" cy="22" r="3.5" fill="#0f172a" />
    </svg>
  );
}

/** Train + track strip for search loading (no border on track — sits inside outer loader card). */
function SearchLoaderTrainTrack() {
  return (
    <div
      className="relative mb-5 h-16 overflow-hidden rounded-xl bg-white"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[15px]">
        <div
          className="absolute bottom-[3px] left-3 right-3 top-[3px] rounded-[1px]"
          style={{
            background:
              "repeating-linear-gradient(90deg, #78716c 0px, #78716c 3px, #ffffff 3px, #ffffff 11px)",
          }}
        />
        <div className="absolute left-3 right-2 top-[2px] h-[2.5px] rounded-[1px] bg-gradient-to-b from-slate-500 to-slate-700 shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]" />
        <div className="absolute bottom-[2px] left-3 right-2 h-[2.5px] rounded-[1px] bg-gradient-to-b from-slate-500 to-slate-700 shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]" />
      </div>
      <div className="search-loader-train-motion flex items-end">
        <SearchLoaderTrainSvg className="shrink-0 drop-shadow-sm" />
      </div>
    </div>
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

/** Human-friendly date for monitoring confirmation copy (e.g. "Sunday, 30 March 2026"). */
function formatJourneyDateFriendly(ymd: string): string {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd;
  const [y, mo, d] = parts;
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Short phrase for “as of when” in IRCTC disclaimer (chart / availability snapshot). */
function buildChartFreshnessPhrase(
  d: ChartPreparationDetails | undefined,
): string {
  if (!d) return "the last time we checked for you";
  const time = d.firstChartCreationTime?.trim();
  const name = d.chartingStationName?.trim();
  const code = d.chartingStationCode?.trim();
  let station = "";
  if (name && code) station = `${name} (${code})`;
  else if (name) station = name;
  else if (code) station = code;
  if (time && station) return `${time} at ${station}`;
  if (time) return time;
  if (station) return `the last check at ${station}`;
  return "the last time we checked for you";
}

function getDateOptions() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toLabel = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return [
    { value: toYmdLocal(today), label: `Today (${toLabel(today)})` },
    { value: toYmdLocal(tomorrow), label: `Tomorrow (${toLabel(tomorrow)})` },
  ];
}

export default function HomePage() {
  const dateOptions = getDateOptions();
  const defaultDate = dateOptions[0].value; // today
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
  const [monitorSubmitting, setMonitorSubmitting] = useState(false);
  const [monitorSuccess, setMonitorSuccess] = useState<string | null>(null);
  const [monitorJourneyResponse, setMonitorJourneyResponse] = useState<{
    journeyRequestId: string;
    tasks: { stationCode: string; chartAt: string; status: string }[];
  } | null>(null);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorEmail, setMonitorEmail] = useState("");
  const [monitorMobile, setMonitorMobile] = useState("");
  const [mounted, setMounted] = useState(false);
  const [chartPendingModalDismissed, setChartPendingModalDismissed] =
    useState(false);
  const chartPendingOpenedTracked = useRef(false);
  const irctcDisclaimerOpenTracked = useRef(false);
  const monitoringSuccessOpenTracked = useRef(false);
  const gapMonitorOpenKey = useRef<string | null>(null);
  const [monitoringStartedPopupOpen, setMonitoringStartedPopupOpen] =
    useState(false);
  const [helpfulFeedbackPopupOpen, setHelpfulFeedbackPopupOpen] =
    useState(false);
  const [irctcBookConfirm, setIrctcBookConfirm] = useState<{
    url: string;
    source: "booking_plan" | "openai_plan";
  } | null>(null);
  const helpfulFeedbackShownForSearch = useRef(false);
  const trainInputRef = useRef<HTMLInputElement>(null);
  const [stationGateMessage, setStationGateMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || trainsLoading) return;
    trainInputRef.current?.focus({ preventScroll: true });
  }, [mounted, trainsLoading]);

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
    if (trainSelected) setStationGateMessage(null);
  }, [trainSelected]);

  function promptSelectTrainFirst() {
    setStationGateMessage(
      "Search above and pick a train from the list. From and To unlock once your train is selected.",
    );
    trainInputRef.current?.focus({ preventScroll: true });
  }

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

  // Reset monitor form when modal opens
  useEffect(() => {
    if (!monitoringLeg) return;
    setMonitoringStartedPopupOpen(false);
    setMonitorSuccess(null);
    setMonitorError(null);
    setMonitorJourneyResponse(null);
    try {
      const raw =
        typeof window !== "undefined" &&
        window.localStorage.getItem(MONITOR_CONTACT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { email?: string; mobile?: string };
        setMonitorEmail(parsed.email != null ? String(parsed.email) : "");
        setMonitorMobile(parsed.mobile != null ? String(parsed.mobile) : "");
      } else {
        setMonitorEmail("");
        setMonitorMobile("");
      }
    } catch {
      setMonitorEmail("");
      setMonitorMobile("");
    }
  }, [monitoringLeg]);

  // Re-init Flowbite after mount and when dropdowns exist in the DOM (avoids hydration mismatch from Popper.js).
  // Must wait for !trainsLoading so the train search row is mounted before init; otherwise toggle has no handler.
  useEffect(() => {
    if (!mounted || trainsLoading) return;
    import("flowbite").then((fb) => {
      if (typeof fb.initFlowbite === "function") fb.initFlowbite();
    });
  }, [mounted, trainsLoading, scheduleError, scheduleStations]);

  useEffect(() => {
    if (loading || !checkResult) {
      setChartPendingModalDismissed(false);
      chartPendingOpenedTracked.current = false;
    }
  }, [loading, checkResult]);

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
    setMonitorJourneyResponse(null);
    setMonitorError(null);
    setMonitorSuccess(null);
    setMonitoringStartedPopupOpen(false);
    setHelpfulFeedbackPopupOpen(false);
    helpfulFeedbackShownForSearch.current = false;
    setIrctcBookConfirm(null);
    setLoading(true);
    trackAnalyticsEvent({
      name: "button_clicked",
      properties: {
        button_id: "search_submit",
        train_number: trainNumber.trim(),
        from_code: fromCode,
        to_code: toCode || "",
      },
    });
    trackAnalyticsEvent({
      name: "search_submitted",
      properties: {
        train_number: trainNumber.trim(),
        from_code: fromCode,
        to_code: toCode || "",
        journey_date: journeyDate.trim(),
      },
    });
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
      trackAnalyticsEvent({
        name: "search_completed",
        properties: {
          success: true,
          has_chart_status: Boolean(data.chartStatus),
        },
      });
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      setError(
        ax.response?.data?.message ??
          ax.response?.data?.error ??
          "Request failed. Is the API running?",
      );
      trackAnalyticsEvent({
        name: "search_completed",
        properties: { success: false, error: "request_failed" },
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitJourneyMonitor(fromC: string, toC: string) {
    const email = monitorEmail.trim() || undefined;
    const mobile = monitorMobile.trim() || undefined;
    if (!email && !mobile) return;
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
        fromStationCode: fromC,
        toStationCode: toC,
        journeyDate: journeyDate.trim(),
        classCode: "3A",
        email,
        mobile,
      });
      setMonitorJourneyResponse({
        journeyRequestId: data.journeyRequestId,
        tasks: data.tasks ?? [],
      });
      setMonitoringStartedPopupOpen(true);
      setChartPendingModalDismissed(true);
      setMonitoringLeg(null);
      trackAnalyticsEvent({
        name: "monitor_journey_submitted",
        properties: { success: true },
      });
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(
            MONITOR_CONTACT_STORAGE_KEY,
            JSON.stringify({
              email: email ?? "",
              mobile: mobile ?? "",
            }),
          );
        } catch {
          // ignore storage errors
        }
      }
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string } };
      };
      setMonitorError(ax.response?.data?.message ?? "Request failed.");
      trackAnalyticsEvent({
        name: "monitor_journey_submitted",
        properties: {
          success: false,
          error: ax.response?.data?.message ?? "request_failed",
        },
      });
    } finally {
      setMonitorSubmitting(false);
    }
  }

  function swapFromTo() {
    trackAnalyticsEvent({
      name: "button_clicked",
      properties: { button_id: "swap_stations" },
    });
    trackAnalyticsEvent({
      name: "swap_stations_clicked",
      properties: {},
    });
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
  const chartFreshnessPhrase = buildChartFreshnessPhrase(chartDetails);
  const fullRouteStations = payload?.fullRouteStations ?? [];
  const longestPath = payload?.longestPathAvailable;
  const hasChartResult =
    chartDetails || fullRouteStations.length > 0 || longestPath;

  const chartStatusPayload = payload?.chartStatus;
  const showChartPendingMonitor =
    Boolean(checkResult && !loading) &&
    payload?.serviceSource === "service2" &&
    chartStatusPayload &&
    (chartStatusPayload.kind === "not_prepared_yet" ||
      (chartStatusPayload.kind === "chart_error" &&
        /chart\s+not\s+prepared/i.test(chartStatusPayload.error ?? ""))) &&
    Boolean(fromCode && toCode);

  useEffect(() => {
    if (
      !showChartPendingMonitor ||
      chartPendingModalDismissed ||
      chartPendingOpenedTracked.current
    )
      return;
    chartPendingOpenedTracked.current = true;
    trackAnalyticsEvent({
      name: "popup_opened",
      properties: { popup: "chart_pending" },
    });
    trackAnalyticsEvent({
      name: "monitor_modal_opened",
      properties: { source: "chart_pending" },
    });
  }, [showChartPendingMonitor, chartPendingModalDismissed]);

  useEffect(() => {
    if (!irctcBookConfirm) {
      irctcDisclaimerOpenTracked.current = false;
      return;
    }
    if (irctcDisclaimerOpenTracked.current) return;
    irctcDisclaimerOpenTracked.current = true;
    trackAnalyticsEvent({
      name: "popup_opened",
      properties: {
        popup: "irctc_disclaimer",
        plan_source: irctcBookConfirm.source,
      },
    });
  }, [irctcBookConfirm]);

  useEffect(() => {
    if (!monitoringStartedPopupOpen || !monitorJourneyResponse) {
      monitoringSuccessOpenTracked.current = false;
      return;
    }
    if (monitoringSuccessOpenTracked.current) return;
    monitoringSuccessOpenTracked.current = true;
    trackAnalyticsEvent({
      name: "popup_opened",
      properties: { popup: "monitoring_success" },
    });
  }, [monitoringStartedPopupOpen, monitorJourneyResponse]);

  useEffect(() => {
    if (!monitoringLeg) {
      gapMonitorOpenKey.current = null;
      return;
    }
    const key = `${monitoringLeg.fromCode}:${monitoringLeg.toCode}`;
    if (gapMonitorOpenKey.current === key) return;
    gapMonitorOpenKey.current = key;
    trackAnalyticsEvent({
      name: "popup_opened",
      properties: {
        popup: "gap_leg_monitor",
        from_code: monitoringLeg.fromCode,
        to_code: monitoringLeg.toCode,
      },
    });
  }, [monitoringLeg]);

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
  const hasTicketResults =
    Boolean(checkResult && !loading) &&
    payload?.serviceSource === "service2" &&
    !payload?.chartStatus &&
    Array.isArray(payload?.openAiBookingPlan) &&
    payload.openAiBookingPlan.length > 0;

  useEffect(() => {
    if (!hasTicketResults || helpfulFeedbackShownForSearch.current) return;
    const timeout = window.setTimeout(() => {
      helpfulFeedbackShownForSearch.current = true;
      setHelpfulFeedbackPopupOpen(true);
      trackAnalyticsEvent({
        name: "popup_opened",
        properties: { popup: "helpful_feedback" },
      });
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [hasTicketResults]);

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
        <section
          aria-labelledby="hero-heading"
          className="mb-7 text-center sm:mb-8"
        >
          <div className="mx-auto max-w-[22rem] rounded-2xl border border-slate-200/90 bg-white px-4 py-5 shadow-sm sm:max-w-md sm:px-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600/90">
              How LastBerth helps
            </p>
            <h1
              id="hero-heading"
              className="mt-2 text-balance text-xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-[1.35rem]"
            >
              Confirmed seats after charting — with split-journey options
            </h1>
            <div className="mt-4 space-y-3 text-left">
              <p className="text-pretty text-sm leading-relaxed text-slate-600">
                After the chart is prepared, availability shifts along your
                train&apos;s route.
              </p>
              <p className="text-pretty text-sm leading-relaxed text-slate-600">
                We search your train and show practical ways to book: a single
                ticket or a few connected legs — you pay on{" "}
                <span className="font-medium text-slate-700">IRCTC</span>.
              </p>
            </div>
          </div>
        </section>

        <form
          onSubmit={handleSearch}
          className="space-y-4"
          aria-label="Search train and find seat availability"
        >
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            {trainsLoading ? (
              <div
                className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-14"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div
                  className="h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"
                  aria-hidden
                />
                <p className="text-base font-semibold text-slate-800">
                  Loading…
                </p>
                <p className="text-center text-sm text-slate-500">
                  Fetching the train list. This only takes a moment.
                </p>
              </div>
            ) : (
              <>
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
                    ref={trainInputRef}
                    id="train-search-input"
                    type="text"
                    value={trainInput}
                    onChange={(e) => setTrainInput(e.target.value)}
                    placeholder="Search train number or name"
                    className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 text-inherit placeholder:text-gray-400"
                    autoComplete="off"
                  />
                  <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                    <ChevronUpDownIcon className="size-5 text-gray-500" />
                  </span>
                </div>
                <div
                  id="train-dropdown"
                  className="z-10 hidden absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5"
                >
                  {mounted && (
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
                                trackAnalyticsEvent({
                                  name: "train_selected_from_dropdown",
                                  properties: { train_number: t.number },
                                });
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
                  )}
                </div>
              </div>

              {stationGateMessage && (
                <div
                  className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3.5 py-3 text-left shadow-sm"
                  role="status"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"
                    aria-hidden
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </span>
                  <p className="min-w-0 text-sm leading-relaxed text-amber-950">
                    {stationGateMessage}
                  </p>
                </div>
              )}

              <div
                className={`min-w-0 relative ${scheduleError ? "opacity-60" : !trainSelected ? "opacity-75" : ""}`}
              >
                <label
                  htmlFor="from-dropdown-button"
                  className="block text-medium font-semibold text-gray-900 mb-1.5"
                >
                  From
                </label>
                <div className="relative">
                  {!trainSelected && (
                    <button
                      type="button"
                      className="absolute inset-0 z-[5] rounded-md bg-transparent cursor-pointer"
                      aria-label="Select a train before choosing From station"
                      onClick={promptSelectTrainFirst}
                    />
                  )}
                  <div
                    id="from-dropdown-button"
                    role="button"
                    tabIndex={scheduleError || !trainSelected ? -1 : 0}
                    {...(!scheduleError &&
                      trainSelected && {
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
                      onFocus={() => {
                        if (!trainSelected) promptSelectTrainFirst();
                      }}
                      placeholder={
                        !trainSelected
                          ? "Select a train first"
                          : scheduleLoading
                            ? "Loading route…"
                            : scheduleStations
                              ? "Boarding station"
                              : "Station code"
                      }
                      disabled={!trainSelected || !!scheduleError}
                      className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 text-inherit placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-90"
                    />
                    <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                      <ChevronUpDownIcon className="size-5 text-gray-500" />
                    </span>
                  </div>
                </div>
                {!scheduleError && trainSelected && (
                  <div
                    id="from-dropdown"
                    className="z-10 hidden absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5"
                  >
                    {mounted && (
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
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!trainSelected) {
                      promptSelectTrainFirst();
                      return;
                    }
                    swapFromTo();
                  }}
                  disabled={!!scheduleError}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:bg-slate-200 active:text-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Swap from and to"
                >
                  <SwapIcon className="h-5 w-5" />
                </button>
              </div>

              <div
                className={`min-w-0 relative ${scheduleError ? "opacity-60" : !trainSelected ? "opacity-75" : ""}`}
              >
                <label
                  htmlFor="to-dropdown-button"
                  className="block text-medium font-semibold text-gray-900 mb-1.5"
                >
                  To
                </label>
                <div className="relative">
                  {!trainSelected && (
                    <button
                      type="button"
                      className="absolute inset-0 z-[5] rounded-md bg-transparent cursor-pointer"
                      aria-label="Select a train before choosing To station"
                      onClick={promptSelectTrainFirst}
                    />
                  )}
                  <div
                    id="to-dropdown-button"
                    role="button"
                    tabIndex={scheduleError || !trainSelected ? -1 : 0}
                    {...(!scheduleError &&
                      trainSelected && {
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
                      onFocus={() => {
                        if (!trainSelected) promptSelectTrainFirst();
                      }}
                      placeholder={
                        !trainSelected
                          ? "Select a train first"
                          : scheduleLoading
                            ? "Loading route…"
                            : scheduleStations
                              ? "Destination station"
                              : "Station code"
                      }
                      disabled={!trainSelected || !!scheduleError}
                      className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 border-0 text-inherit placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-90"
                    />
                    <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                      <ChevronUpDownIcon className="size-5 text-gray-500" />
                    </span>
                  </div>
                </div>
                {!scheduleError && trainSelected && (
                  <div
                    id="to-dropdown"
                    className="z-10 hidden absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5"
                  >
                    {mounted && (
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
                    )}
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
              </>
            )}
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
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <SearchLoaderTrainTrack />
            <p className="text-slate-900 text-left text-lg font-bold leading-snug sm:text-xl">
              Finding you the best possible seats…
            </p>
          </div>
        )}

        {checkResult &&
          !loading &&
          (!showChartPendingMonitor || chartPendingModalDismissed) && (
          <section className="mt-6 rounded-2xl bg-slate-100/60 py-4 px-0">
            {payload?.serviceSource === "service2" ? (
              payload.chartStatus ? (
                <div className="rounded-2xl border border-amber-200/90 bg-white p-4 shadow-md">
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <p className="font-bold text-amber-900 text-xl">
                      {payload.chartStatus.kind === "not_prepared_yet"
                        ? payload.chartStatus.message
                        : payload.chartStatus.error}
                    </p>
                    {showChartPendingMonitor && (
                      <p className="mt-2 text-sm text-amber-800 font-medium">
                        We can check at chart preparation time and notify you
                        when seats are available. We only find you confirmed
                        tickets once the chart is prepared. You will receive
                        alerts by WhatsApp and email.
                      </p>
                    )}
                    {showChartPendingMonitor && chartPendingModalDismissed && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            trackAnalyticsEvent({
                              name: "button_clicked",
                              properties: {
                                button_id: "chart_pending_reopen",
                              },
                            });
                            trackAnalyticsEvent({
                              name: "popup_opened",
                              properties: { popup: "chart_pending" },
                            });
                            trackAnalyticsEvent({
                              name: "monitor_modal_opened",
                              properties: { source: "chart_pending" },
                            });
                            setChartPendingModalDismissed(false);
                          }}
                          className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white active:bg-amber-700 transition"
                        >
                          Monitor tickets
                        </button>
                      </div>
                    )}
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
                                <button
                                  type="button"
                                  onClick={() => {
                                    trackAnalyticsEvent({
                                      name: "button_clicked",
                                      properties: {
                                        button_id: "book_ticket_card",
                                        plan_source: "booking_plan",
                                        train_number: trainNumber.trim(),
                                      },
                                    });
                                    setIrctcBookConfirm({
                                      url: bookUrl,
                                      source: "booking_plan",
                                    });
                                  }}
                                  className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3.5 min-h-[48px] flex items-center justify-center text-base font-semibold text-white active:bg-emerald-700 transition"
                                >
                                  Book
                                </button>
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
                                onClick={() => {
                                  trackAnalyticsEvent({
                                    name: "button_clicked",
                                    properties: {
                                      button_id: "gap_leg_monitor_open",
                                      from_code: leg.fromCode,
                                      to_code: leg.toCode,
                                    },
                                  });
                                  trackAnalyticsEvent({
                                    name: "monitor_modal_opened",
                                    properties: { source: "gap_leg" },
                                  });
                                  setMonitoringLeg({
                                    fromCode: leg.fromCode,
                                    toCode: leg.toCode,
                                  });
                                }}
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
                              <button
                                type="button"
                                onClick={() => {
                                  trackAnalyticsEvent({
                                    name: "button_clicked",
                                    properties: {
                                      button_id: "book_ticket_card",
                                      plan_source: "openai_plan",
                                      train_number: trainNumber.trim(),
                                    },
                                  });
                                  setIrctcBookConfirm({
                                    url: bookUrl,
                                    source: "openai_plan",
                                  });
                                }}
                                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3.5 min-h-[48px] flex items-center justify-center text-base font-semibold text-white active:bg-emerald-700 transition"
                              >
                                Book
                              </button>
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

        {irctcBookConfirm && (
          <div
            className="fixed inset-0 z-[105] flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="irctc-disclaimer-title"
            onClick={() => {
              trackAnalyticsEvent({
                name: "popup_closed",
                properties: {
                  popup: "irctc_disclaimer",
                  method: "backdrop",
                },
              });
              setIrctcBookConfirm(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 px-4 py-4">
                <h2
                  id="irctc-disclaimer-title"
                  className="text-lg font-semibold text-slate-900 leading-snug"
                >
                  Before you open IRCTC
                </h2>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                  The seats and fares shown in this ticket box are based on what
                  we found as of{" "}
                  <span className="font-semibold text-slate-900">
                    {chartFreshnessPhrase}
                  </span>
                  . Trains fill up quickly — someone else may have booked those
                  seats since then, or availability may have changed.
                </p>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Please double-check on the official IRCTC site before you pay.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: {
                        button_id: "irctc_disclaimer_go_back",
                        plan_source: irctcBookConfirm?.source,
                      },
                    });
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "irctc_disclaimer",
                        method: "go_back",
                      },
                    });
                    setIrctcBookConfirm(null);
                  }}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!irctcBookConfirm) return;
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "irctc_disclaimer",
                        method: "continue_irctc",
                      },
                    });
                    trackAnalyticsEvent({
                      name: "irctc_book_clicked",
                      properties: { source: irctcBookConfirm.source },
                    });
                    window.open(
                      irctcBookConfirm.url,
                      "_blank",
                      "noopener,noreferrer",
                    );
                    setIrctcBookConfirm(null);
                  }}
                  className="w-full sm:w-auto rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white active:bg-emerald-700"
                >
                  Continue to IRCTC
                </button>
              </div>
            </div>
          </div>
        )}

        {helpfulFeedbackPopupOpen && (
          <div
            className="fixed inset-0 z-[115] flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="helpful-feedback-title"
            onClick={() => {
              trackAnalyticsEvent({
                name: "popup_closed",
                properties: {
                  popup: "helpful_feedback",
                  method: "backdrop",
                },
              });
              setHelpfulFeedbackPopupOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 px-4 py-4">
                <h2
                  id="helpful-feedback-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Was this result helpful?
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Your feedback helps us improve recommendations. You can also
                  continue to IRCTC now.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: { button_id: "helpful_feedback_yes" },
                    });
                    trackAnalyticsEvent({
                      name: "result_helpfulness_submitted",
                      properties: { helpful: true },
                    });
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "helpful_feedback",
                        method: "helpful_yes",
                      },
                    });
                    setHelpfulFeedbackPopupOpen(false);
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white active:bg-emerald-700"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: { button_id: "helpful_feedback_no" },
                    });
                    trackAnalyticsEvent({
                      name: "result_helpfulness_submitted",
                      properties: { helpful: false },
                    });
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "helpful_feedback",
                        method: "helpful_no",
                      },
                    });
                    setHelpfulFeedbackPopupOpen(false);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const irctcUrl = "https://www.irctc.co.in/eticketing/login";
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: { button_id: "helpful_feedback_irctc" },
                    });
                    trackAnalyticsEvent({
                      name: "irctc_open_login_clicked",
                      properties: {},
                    });
                    window.open(irctcUrl, "_blank", "noopener,noreferrer");
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "helpful_feedback",
                        method: "continue_irctc",
                      },
                    });
                    setHelpfulFeedbackPopupOpen(false);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700"
                >
                  Open IRCTC
                </button>
              </div>
            </div>
          </div>
        )}

        {showChartPendingMonitor &&
          !chartPendingModalDismissed &&
          chartStatusPayload && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-0"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chart-pending-modal-title"
              onClick={() => {
                trackAnalyticsEvent({
                  name: "popup_closed",
                  properties: {
                    popup: "chart_pending",
                    method: "backdrop",
                  },
                });
                trackAnalyticsEvent({
                  name: "monitor_modal_closed",
                  properties: { source: "chart_pending", outcome: "backdrop" },
                });
                setChartPendingModalDismissed(true);
              }}
            >
              <div
                className="relative w-full max-w-full max-h-[min(92dvh,100dvh)] flex flex-col rounded-none border-y border-amber-200/90 bg-white shadow-2xl overflow-hidden sm:rounded-2xl sm:border sm:max-h-[min(90dvh,40rem)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 border-b border-amber-100 bg-amber-50/95 px-4 py-3 flex items-start justify-between gap-3">
                  <h2
                    id="chart-pending-modal-title"
                    className="font-bold text-amber-900 text-lg leading-snug"
                  >
                    {chartStatusPayload.kind === "not_prepared_yet"
                      ? chartStatusPayload.message
                      : chartStatusPayload.error}
                  </h2>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => {
                      trackAnalyticsEvent({
                        name: "popup_closed",
                        properties: {
                          popup: "chart_pending",
                          method: "x_button",
                        },
                      });
                      trackAnalyticsEvent({
                        name: "monitor_modal_closed",
                        properties: { source: "chart_pending", outcome: "cancel" },
                      });
                      setChartPendingModalDismissed(true);
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-amber-800 hover:bg-amber-100/80 transition"
                  >
                    <span className="sr-only">Close</span>
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
                  <p className="text-sm text-amber-900/90 font-medium">
                    We can check at chart preparation time and notify you when
                    seats are available. We only find you confirmed tickets once
                    the chart is prepared. You will receive alerts by WhatsApp
                    and email.
                  </p>
                  {monitorError && (
                    <p className="text-sm text-red-600">{monitorError}</p>
                  )}
                  {monitorSuccess && (
                    <p className="text-sm text-emerald-600">{monitorSuccess}</p>
                  )}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Mobile
                    </label>
                    <input
                      type="tel"
                      value={monitorMobile}
                      onChange={(e) => setMonitorMobile(e.target.value)}
                      placeholder="10-digit mobile number"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 outline-none"
                    />
                    <label className="block text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={monitorEmail}
                      onChange={(e) => setMonitorEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 outline-none"
                    />
                  </div>
                </div>
                <div className="shrink-0 border-t border-slate-100 p-4">
                  <button
                    type="button"
                    disabled={
                      monitorSubmitting ||
                      (!monitorEmail.trim() && !monitorMobile.trim())
                    }
                    onClick={() => {
                      trackAnalyticsEvent({
                        name: "button_clicked",
                        properties: {
                          button_id: "chart_pending_monitor_tickets",
                          train_number: trainNumber.trim(),
                          from_code: fromCode,
                          to_code: toCode,
                        },
                      });
                      void submitJourneyMonitor(fromCode, toCode);
                    }}
                    className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed active:bg-amber-700 transition"
                  >
                    {monitorSubmitting ? "Starting…" : "Monitor tickets"}
                  </button>
                </div>
              </div>
            </div>
          )}

        {monitoringStartedPopupOpen && monitorJourneyResponse && (
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-0"
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitoring-started-title"
            onClick={() => {
              trackAnalyticsEvent({
                name: "popup_closed",
                properties: {
                  popup: "monitoring_success",
                  method: "backdrop",
                },
              });
              trackAnalyticsEvent({
                name: "monitor_modal_closed",
                properties: {
                  outcome: "success_dismiss",
                  source: "monitoring_started",
                },
              });
              setMonitoringStartedPopupOpen(false);
              setMonitorJourneyResponse(null);
              setMonitorSuccess(null);
              setMonitorError(null);
            }}
          >
            <div
              className="relative w-full max-w-full max-h-[min(92dvh,100dvh)] flex flex-col rounded-none border-y border-emerald-200/90 bg-white shadow-2xl overflow-hidden sm:rounded-2xl sm:border sm:max-h-[min(90dvh,36rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-emerald-100 bg-emerald-50/95 px-4 py-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-800 uppercase tracking-wide">
                    All set
                  </p>
                  <h2
                    id="monitoring-started-title"
                    className="mt-1 font-bold text-emerald-950 text-xl leading-snug"
                  >
                    We&apos;ll watch this train for you
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "monitoring_success",
                        method: "x_button",
                      },
                    });
                    trackAnalyticsEvent({
                      name: "monitor_modal_closed",
                      properties: {
                        outcome: "success_dismiss",
                        source: "monitoring_started",
                      },
                    });
                    setMonitoringStartedPopupOpen(false);
                    setMonitorJourneyResponse(null);
                    setMonitorSuccess(null);
                    setMonitorError(null);
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-emerald-800 hover:bg-emerald-100/80 transition"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4 text-slate-700 text-base leading-relaxed">
                <p>
                  You&apos;re signed up. For your journey on{" "}
                  <span className="font-semibold text-slate-900">
                    {formatJourneyDateFriendly(journeyDate)}
                  </span>
                  , we&apos;ll quietly check whether any{" "}
                  <span className="font-semibold text-slate-900">
                    confirmed seats
                  </span>{" "}
                  open up on{" "}
                  <span className="font-semibold text-slate-900">
                    {trainInput.trim() || trainNumber}
                  </span>
                  {from.trim() && to.trim() ? (
                    <>
                      {" "}
                      from{" "}
                      <span className="font-semibold text-slate-900">
                        {from.trim()}
                      </span>{" "}
                      to{" "}
                      <span className="font-semibold text-slate-900">
                        {to.trim()}
                      </span>
                    </>
                  ) : (
                    " for the route you searched"
                  )}{" "}
                  — you don&apos;t need to keep refreshing the app.
                </p>
                <p className="font-semibold text-slate-900">
                  What happens next
                </p>
                <ul className="space-y-2 list-disc list-inside text-slate-700">
                  <li>
                    We run several automatic checks for you before the train
                    leaves.
                  </li>
                  <li>
                    If a seat becomes free that matches your trip, we&apos;ll
                    message you on{" "}
                    <span className="font-semibold text-slate-900">
                      WhatsApp
                    </span>{" "}
                    and{" "}
                    <span className="font-semibold text-slate-900">email</span>{" "}
                    (whichever you gave us).
                  </li>
                  <li>
                    Please open{" "}
                    <span className="font-semibold text-slate-900">IRCTC</span>{" "}
                    and book as soon as you see our message — good seats go
                    quickly.
                  </li>
                </ul>
                <p className="text-sm text-slate-500 pt-1 border-t border-slate-100">
                  This doesn&apos;t hold or reserve a ticket for you; it only
                  tells you when something might be available so you can book
                  yourself on IRCTC.
                </p>
              </div>
              <div className="shrink-0 border-t border-slate-100 p-4">
                <button
                  type="button"
                  onClick={() => {
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: { button_id: "monitoring_success_got_it" },
                    });
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "monitoring_success",
                        method: "got_it",
                      },
                    });
                    trackAnalyticsEvent({
                      name: "monitor_modal_closed",
                      properties: {
                        outcome: "success_dismiss",
                        source: "monitoring_started",
                      },
                    });
                    setMonitoringStartedPopupOpen(false);
                    setMonitorJourneyResponse(null);
                    setMonitorSuccess(null);
                    setMonitorError(null);
                  }}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white active:bg-emerald-700"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Monitor modal: select stations to watch for a gap leg */}
        {monitoringLeg && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-title"
            onClick={() => {
              trackAnalyticsEvent({
                name: "popup_closed",
                properties: {
                  popup: "gap_leg_monitor",
                  method: "backdrop",
                },
              });
              trackAnalyticsEvent({
                name: "monitor_modal_closed",
                properties: { outcome: "cancel", source: "gap_leg" },
              });
              setMonitoringLeg(null);
              setMonitorSuccess(null);
              setMonitorJourneyResponse(null);
              setMonitorError(null);
              setMonitorEmail("");
              setMonitorMobile("");
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-100">
                <h2
                  id="monitor-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Monitor {monitoringLeg.fromCode} → {monitoringLeg.toCode}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  We&apos;ll check at chart time for this leg and notify you
                  when seats are available. Enter email or mobile to get
                  notified.
                </p>
              </div>
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {monitorError && (
                  <p className="text-sm text-red-600">{monitorError}</p>
                )}
                {monitorSuccess && (
                  <p className="text-sm text-emerald-600">{monitorSuccess}</p>
                )}
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
              </div>
              <div className="p-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: { button_id: "gap_monitor_cancel" },
                    });
                    trackAnalyticsEvent({
                      name: "popup_closed",
                      properties: {
                        popup: "gap_leg_monitor",
                        method: "cancel",
                      },
                    });
                    trackAnalyticsEvent({
                      name: "monitor_modal_closed",
                      properties: { outcome: "cancel", source: "gap_leg" },
                    });
                    setMonitoringLeg(null);
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
                  disabled={
                    monitorSubmitting ||
                    (!monitorEmail.trim() && !monitorMobile.trim())
                  }
                  onClick={() => {
                    if (!monitoringLeg) return;
                    trackAnalyticsEvent({
                      name: "button_clicked",
                      properties: {
                        button_id: "gap_monitor_start",
                        from_code: monitoringLeg.fromCode,
                        to_code: monitoringLeg.toCode,
                        train_number: trainNumber.trim(),
                      },
                    });
                    void submitJourneyMonitor(
                      monitoringLeg.fromCode,
                      monitoringLeg.toCode,
                    );
                  }}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700"
                >
                  {monitorSubmitting ? "Starting…" : "Start monitoring"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
