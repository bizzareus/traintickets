"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Fragment,
} from "react";
import { apiClient, irctcScheduleClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { fetchService2CheckStream } from "@/lib/service2CheckStream";
import {
  IstRailMaintenanceBanner,
  IstRailMaintenanceModal,
} from "@/components/IstRailMaintenance";
import { useIstRailMaintenance } from "@/hooks/useIstRailMaintenance";
import {
  extractJourneyTrainRunDayError,
  extractTrainRunDayFromValidateBody,
  firstJourneyValidationMessage,
  type JourneyRunDayUiError,
} from "@/lib/journeyValidationErrors";
import {
  buildTrainDoesNotRunUiMessage,
  getTrainRunsOnFlagForYmd,
  type TrainRunsOnJson,
} from "@/lib/trainRunsOn";
import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";

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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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

const INDICATIVE_FARE_INFO =
  "Indicative pricing — refer to IRCTC for actual pricing.";

function InformationCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IndicativeFareInfoButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-slate-400 outline-none hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${className ?? ""}`}
      aria-label={INDICATIVE_FARE_INFO}
      title={INDICATIVE_FARE_INFO}
    >
      <InformationCircleIcon className="h-4 w-4" />
    </button>
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
        <div className="search-loader-track-ties absolute bottom-[3px] left-3 right-3 top-[3px] rounded-[1px]" />
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

const HOW_IT_WORKS_STEPS = [
  {
    step: "1",
    title: "Search",
    description: "Enter your train, from, to and date above.",
  },
  {
    step: "2",
    title: "We find options",
    description:
      "We check availability and suggest the best seat options for you.",
  },
  {
    step: "3",
    title: "Book",
    description: "Click Book on a journey to complete your booking on IRCTC.",
  },
] as const;

/** Shown when Service 2 returns failed (e.g. IRCTC vacant-berth errors) — avoid generic “Request failed”. */
const SERVICE2_NO_TICKETS_AVAILABLE_COPY =
  "We couldn't find any available tickets for you.";

type CheckResult = {
  status: string;
  resultPayload?: {
    vbd?: VacantBerthItem[];
    error?: string | null;
    summary?: string;
    composition?: Service2Composition;
    openAiSummary?: string | null;
    /** One slot per route leg when aligned: bookable segment or `{}` for no ticket. */
    openAiBookingPlan?: Array<
      { instruction?: string; approx_price?: number } | Record<string, never>
    >;
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
      | { kind: "chart_error"; error: string }
      | { kind: "irctc_unavailable"; message: string; detail?: string };
    attempts?: { time?: string; action?: string; result?: string }[];
    bookings?: { from?: string; to?: string; status?: string }[];
    fullJourneyConfirmed?: boolean;
    chartPreparationDetails?: ChartPreparationDetails;
    /** Backend: chart row missing in DB after AI + composition refetch */
    chartRefreshNotice?: {
      checkedStationCode: string;
      message: string;
      indicativeChartTime?: string | null;
    };
    fullRouteStations?: {
      stationCode?: string;
      stationName?: string;
      sequenceOrder?: number;
    }[];
    longestPathAvailable?: LongestPathAvailable;
    [k: string]: unknown;
  };
};

/** Body from `POST /api/service2/check` and the stream `result` event. */
type Service2CheckOkBody = {
  status?: string;
  composition?: NonNullable<CheckResult["resultPayload"]>["composition"];
  chartPreparationDetails?: NonNullable<
    CheckResult["resultPayload"]
  >["chartPreparationDetails"];
  vacantBerth?: { vbd?: VacantBerthItem[]; error?: string | null };
  openAiSummary?: string | null;
  openAiStructuredSeats?: NonNullable<
    CheckResult["resultPayload"]
  >["openAiStructuredSeats"];
  openAiBookingPlan?: NonNullable<
    CheckResult["resultPayload"]
  >["openAiBookingPlan"];
  openAiTotalPrice?: number;
  trainSchedule?: NonNullable<CheckResult["resultPayload"]>["trainSchedule"];
  chartStatus?: NonNullable<CheckResult["resultPayload"]>["chartStatus"];
  chartRefreshNotice?: NonNullable<
    CheckResult["resultPayload"]
  >["chartRefreshNotice"];
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

/**
 * If the API mistakenly returns the full model JSON in `openAiSummary`, avoid
 * rendering it as a wall of text; pull out `summary` when possible.
 */
function displayTextFromOpenAiSummary(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  if (!t.startsWith("{")) return t;
  try {
    const j = JSON.parse(t) as { summary?: string };
    if (typeof j.summary === "string" && j.summary.trim())
      return j.summary.trim();
  } catch {
    /* ignore */
  }
  return "We could not display this plan correctly. Please try your search again.";
}

/** Short phrase for “as of when” in IRCTC disclaimer (chart / availability snapshot). */
function buildChartFreshnessPhrase(
  d: ChartPreparationDetails | undefined,
  opts?: { omitStation?: boolean },
): string {
  if (!d) return "the last time we checked for you";
  const time = d.firstChartCreationTime?.trim();
  const name = d.chartingStationName?.trim();
  const code = d.chartingStationCode?.trim();
  let station = "";
  if (name && code) station = `${name} (${code})`;
  else if (name) station = name;
  else if (code) station = code;

  if (opts?.omitStation) {
    if (time) return time;
    return "the last time we checked for you";
  }

  if (time && station) return `${time} at ${station}`;
  if (time) return time;
  if (station) return `the last check at ${station}`;
  return "the last time we checked for you";
}

function TicketCardTitleRow({
  ticketIndex,
  classCode,
  asOfPhrase,
}: {
  ticketIndex: number;
  classCode: string;
  asOfPhrase: string;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="text-sm font-semibold text-slate-500 min-w-0">
        Ticket {ticketIndex}
        <span className="ml-2 inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
          {classCode}
        </span>
      </p>
      <p
        className="text-s font-bold text-slate-500 text-right leading-snug max-w-[min(100%,12.5rem)] shrink-0 sm:max-w-[14rem]"
        title={`Availability as of ${asOfPhrase}`}
      >
        Availability as of {asOfPhrase}
      </p>
    </div>
  );
}

/** Footer strip under each ticket card: IRCTC chart times per station (Success-style bar). */
function TicketJourneyChartStrip({
  fromMeta,
  toMeta,
  loading,
}: {
  fromMeta?: StationChartMetaItem;
  toMeta?: StationChartMetaItem;
  loading: boolean;
}) {
  const pickFinalChartTime = (meta?: StationChartMetaItem): string | null =>
    meta?.chartTwoTime?.trim() || meta?.chartOneTime?.trim() || null;

  const finalChartTime =
    pickFinalChartTime(fromMeta) ?? pickFinalChartTime(toMeta);

  if (!loading && !finalChartTime) return null;

  return (
    <div
      className="-mx-4 mt-4 flex min-h-[32px] gap-3 rounded-b-xl border-t border-amber-300 bg-amber-100 px-4 py-3 text-amber-900"
      role="status"
    >
      <div className="min-w-0 flex-1 text-left">
        {loading && !finalChartTime ? (
          <p className="mt-1 text-s leading-snug font-semibold text-amber-800">
            Checking chart times for this leg…
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-s leading-snug font-semibold text-amber-900">
              Final Chart will be prepared at{" "}
              <span className="font-semibold">{finalChartTime}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
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
  const [scheduleTrainRunsOn, setScheduleTrainRunsOn] =
    useState<TrainRunsOnJson | null>(null);
  const [loading, setLoading] = useState(false);
  /** Live status line while service2 SSE check is in progress. */
  const [service2StreamLine, setService2StreamLine] = useState("");
  /** Latest plan snapshot from SSE while chained vacant-berth + OpenAI runs. */
  const [service2StreamPartial, setService2StreamPartial] =
    useState<NonNullable<CheckResult["resultPayload"]> | null>(null);
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
  /** True when POST /journey returned 202 and setup runs in the background */
  const [journeySetupQueued, setJourneySetupQueued] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [journeyRunDayApiError, setJourneyRunDayApiError] =
    useState<JourneyRunDayUiError | null>(null);
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
  const [stationChartMetaByCode, setStationChartMetaByCode] = useState<
    Record<string, StationChartMetaItem>
  >({});
  const [legChartMetaLoading, setLegChartMetaLoading] = useState<
    Record<string, boolean>
  >({});
  const [irctcBookConfirm, setIrctcBookConfirm] = useState<{
    url: string;
    source: "booking_plan" | "openai_plan";
  } | null>(null);
  const trainInputRef = useRef<HTMLInputElement>(null);
  const howItWorksCarouselRef = useRef<HTMLDivElement>(null);
  const [howItWorksSlide, setHowItWorksSlide] = useState(0);
  const trainDropdownBlurCloseTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const fromDropdownBlurCloseTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const toDropdownBlurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [trainDropdownOpen, setTrainDropdownOpen] = useState(false);
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);
  const [stationGateMessage, setStationGateMessage] = useState<string | null>(
    null,
  );
  useEffect(() => {
    setMounted(true);
  }, []);

  const railMaint = useIstRailMaintenance(mounted);

  function scrollHowItWorksCarousel(dir: -1 | 1) {
    const el = howItWorksCarouselRef.current;
    if (!el) return;
    const first = el.querySelector("[data-how-step]") as HTMLElement | null;
    const gap = 16;
    const w = (first?.offsetWidth ?? 280) + gap;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  }

  function updateHowItWorksSlideFromScroll() {
    const el = howItWorksCarouselRef.current;
    if (!el) return;
    const first = el.querySelector("[data-how-step]") as HTMLElement | null;
    const stepW = (first?.offsetWidth ?? 1) + 16;
    if (stepW < 8) return;
    const i = Math.round(el.scrollLeft / stepW);
    setHowItWorksSlide(Math.max(0, Math.min(HOW_IT_WORKS_STEPS.length - 1, i)));
  }

  useEffect(() => {
    return () => {
      if (trainDropdownBlurCloseTimer.current) {
        clearTimeout(trainDropdownBlurCloseTimer.current);
      }
      if (fromDropdownBlurCloseTimer.current) {
        clearTimeout(fromDropdownBlurCloseTimer.current);
      }
      if (toDropdownBlurCloseTimer.current) {
        clearTimeout(toDropdownBlurCloseTimer.current);
      }
    };
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
    setFromDropdownOpen(false);
    setToDropdownOpen(false);
  }, [trainNumber]);

  useEffect(() => {
    if (!trainSelected || !trainNumber) {
      setScheduleStations(null);
      setScheduleError(null);
      setScheduleTrainRunsOn(null);
      return;
    }
    setScheduleLoading(true);
    setScheduleStations(null);
    setScheduleError(null);
    setScheduleTrainRunsOn(null);
    irctcScheduleClient
      .get<{
        stationList?: { stationCode?: string; stationName?: string }[];
        trainRunsOn?: TrainRunsOnJson;
      }>(`/api/irctc/schedule/${encodeURIComponent(trainNumber)}`)
      .then((r) => {
        const tro = r.data?.trainRunsOn;
        if (tro && typeof tro === "object" && !Array.isArray(tro)) {
          setScheduleTrainRunsOn(tro as TrainRunsOnJson);
        } else {
          setScheduleTrainRunsOn(null);
        }
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
          setScheduleTrainRunsOn(null);
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

  const trainRunsOnSelectedDate = useMemo(
    () => getTrainRunsOnFlagForYmd(journeyDate, scheduleTrainRunsOn),
    [journeyDate, scheduleTrainRunsOn],
  );
  const trainDoesNotRunOnSelectedDate = trainRunsOnSelectedDate === "N";
  const trainRunDayMessage = useMemo(() => {
    if (!trainDoesNotRunOnSelectedDate) return null;
    return buildTrainDoesNotRunUiMessage(journeyDate, scheduleTrainRunsOn);
  }, [trainDoesNotRunOnSelectedDate, scheduleTrainRunsOn, journeyDate]);
  /** Schedule / search errors only — train run-day message is shown under Departure Date. */
  const formAlertMessage = scheduleError ?? error;

  /** When route order is known, clear To if it matches From or is not after From. */
  useEffect(() => {
    if (!scheduleStations?.length || !to.includes(" - ")) return;
    const fromI = scheduleStations.findIndex(
      (s) => s.code.toUpperCase() === fromCode.toUpperCase(),
    );
    const toI = scheduleStations.findIndex(
      (s) => s.code.toUpperCase() === toCode.toUpperCase(),
    );
    if (fromI < 0 || toI < 0 || toI <= fromI) {
      setTo("");
    }
  }, [from, to, scheduleStations, fromCode, toCode]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (railMaint.onBlockedSearchAttempt()) return;
    if (scheduleError) return;
    if (trainDoesNotRunOnSelectedDate) {
      setError(trainRunDayMessage ?? "This train doesn't run on that day.");
      return;
    }
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
    setIrctcBookConfirm(null);
    setService2StreamPartial(null);
    setService2StreamLine("Fetching chart and vacant berths from IRCTC…");
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
      const data = (await fetchService2CheckStream(
        {
          trainNumber: trainNumber.trim(),
          stationCode: fromCode,
          journeyDate: journeyDate.trim(),
          classCode: "3A",
          destinationStation: toCode || undefined,
        },
        (ev) => {
          if (ev.phase === "started") {
            const num = (ev.trainNumber ?? trainNumber).trim() || "your train";
            const src = (from.trim() || fromCode).trim() || "your station";
            const dep = to.trim() ? to.trim() : "your destination";
            const dateStr = formatJourneyDateFriendly(journeyDate.trim());
            setService2StreamLine(
              `Finding about train ${num} for your journey from ${src} to ${dep} on ${dateStr}…`,
            );
            return;
          }
          if (ev.phase === "irctc_complete") {
            const n = ev.vacantSegmentCount;
            const segWord = n === 1 ? "segment" : "segments";
            setService2StreamLine(
              `Found overall ${n} vacant berth ${segWord} from IRCTC across classes.${
                ev.vacantBerthApiError
                  ? " Some class calls returned errors; still analysing what's available."
                  : ""
              }`,
            );
            return;
          }
          if (ev.phase === "ai_started") {
            setService2StreamLine(
              `Finding the best ticket plan to get you to ${ev.destinationStation} using AI. This can take a little while - please wait...`,
            );
            return;
          }
          if (ev.phase === "partial_ai_result") {
            setService2StreamPartial({
              serviceSource: "service2",
              composition: ev.composition as Service2Composition | undefined,
              chartPreparationDetails: ev.chartPreparationDetails as
                | ChartPreparationDetails
                | undefined,
              trainSchedule: ev.trainSchedule as NonNullable<
                CheckResult["resultPayload"]
              >["trainSchedule"],
              openAiSummary: ev.openAiSummary,
              openAiStructuredSeats: (ev.openAiStructuredSeats ??
                []) as NonNullable<
                CheckResult["resultPayload"]
              >["openAiStructuredSeats"],
              openAiBookingPlan: (ev.openAiBookingPlan ?? []) as NonNullable<
                CheckResult["resultPayload"]
              >["openAiBookingPlan"],
              openAiTotalPrice: ev.openAiTotalPrice,
              vacantBerth: { vbd: [], error: null },
              vbd: [],
              error: null,
            });
            setService2StreamLine(
              `Found some tickets — looking for the rest (checking from ${ev.nextBoardingStation})…`,
            );
          }
        },
      )) as Service2CheckOkBody;
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
          chartRefreshNotice: data.chartRefreshNotice ?? undefined,
          vbd: data.vacantBerth?.vbd ?? [],
          error: data.vacantBerth?.error ?? null,
        },
      });
      if (data.vacantBerth?.error) setError(SERVICE2_NO_TICKETS_AVAILABLE_COPY);
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
          "Request failed fetching data from Indian Railways for Seat Availability. Please try again.",
      );
      trackAnalyticsEvent({
        name: "search_completed",
        properties: { success: false, error: "request_failed" },
      });
    } finally {
      setLoading(false);
      setService2StreamLine("");
      setService2StreamPartial(null);
    }
  }

  async function submitJourneyMonitor(fromC: string, toC: string) {
    const email = monitorEmail.trim() || undefined;
    const mobile = monitorMobile.trim() || undefined;
    if (!email && !mobile) return;
    setMonitorSubmitting(true);
    setMonitorError(null);
    setMonitorSuccess(null);
    setJourneyRunDayApiError(null);
    setJourneySetupQueued(false);
    try {
      const { data: validated } = await apiClient.post<{
        valid: boolean;
        errors?: Array<{ code: string; message: string }>;
      }>("/api/availability/journey/validate", {
        trainNumber: trainNumber.trim(),
        fromStationCode: fromC,
        toStationCode: toC,
        journeyDate: journeyDate.trim(),
        classCode: "3A",
      });
      if (!validated.valid) {
        const runDay = extractTrainRunDayFromValidateBody(validated);
        if (runDay) setJourneyRunDayApiError(runDay);
        else
          setMonitorError(
            firstJourneyValidationMessage(validated) ?? "Validation failed.",
          );
        trackAnalyticsEvent({
          name: "monitor_journey_submitted",
          properties: { success: false, error: "validation_failed" },
        });
        return;
      }

      await apiClient.post<{
        accepted?: boolean;
        status?: string;
        message?: string;
      }>("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        fromStationCode: fromC,
        toStationCode: toC,
        journeyDate: journeyDate.trim(),
        classCode: "3A",
        email,
        mobile,
      });
      setMonitorJourneyResponse(null);
      setJourneySetupQueued(true);
      setMonitoringStartedPopupOpen(true);
      setChartPendingModalDismissed(true);
      setMonitoringLeg(null);
      trackAnalyticsEvent({
        name: "monitor_journey_submitted",
        properties: { success: true, queued: true },
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
      const runDayPayload = extractJourneyTrainRunDayError(err);
      if (runDayPayload) {
        setJourneyRunDayApiError(runDayPayload);
        trackAnalyticsEvent({
          name: "monitor_journey_submitted",
          properties: {
            success: false,
            error: "train_does_not_run_on_date",
          },
        });
      } else {
        const ax = err as {
          response?: { data?: unknown; status?: number };
        };
        const data = ax.response?.data;
        const msg =
          firstJourneyValidationMessage(data) ??
          (typeof data === "object" &&
          data &&
          "message" in data &&
          typeof (data as { message?: unknown }).message === "string"
            ? String((data as { message: string }).message)
            : null) ??
          "Request failed.";
        setMonitorError(msg);
        trackAnalyticsEvent({
          name: "monitor_journey_submitted",
          properties: {
            success: false,
            error: "request_failed",
          },
        });
      }
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
    setFromDropdownOpen(false);
    setToDropdownOpen(false);
  }

  const stationsForRoute = trainSelected
    ? scheduleLoading
      ? []
      : scheduleStations ?? []
    : stations;
  const stationOptions = stationsForRoute
    .filter(
      (s) =>
        s.code.toLowerCase().includes(from.toLowerCase()) ||
        s.name.toLowerCase().includes(from.toLowerCase()),
    )
    .slice(0, 50);

  const fromIndexOnSchedule =
    scheduleStations?.length && fromCode
      ? scheduleStations.findIndex(
          (s) => s.code.toUpperCase() === fromCode.toUpperCase(),
        )
      : -1;
  /** Stations strictly after From on the train route (excludes From); fallback list excludes same code only. */
  const stationsEligibleForTo =
    scheduleStations != null && scheduleStations.length > 0
      ? fromIndexOnSchedule >= 0
        ? scheduleStations.slice(fromIndexOnSchedule + 1)
        : []
      : trainSelected
        ? []
        : stationsForRoute.filter(
            (s) =>
              !fromCode || s.code.toUpperCase() !== fromCode.toUpperCase(),
          );
  const toOptions = stationsEligibleForTo
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
  const uiPayload =
    loading && service2StreamPartial != null ? service2StreamPartial : payload;
  const vbd = uiPayload?.vbd ?? [];
  const apiError = uiPayload?.error;
  const hasBerths = vbd.length > 0;
  const summary = uiPayload?.summary;
  const attempts = uiPayload?.attempts;
  const bookings = uiPayload?.bookings;
  const fullJourneyConfirmed = uiPayload?.fullJourneyConfirmed;
  const chartDetails = uiPayload?.chartPreparationDetails;
  const chartFreshnessPhrase = buildChartFreshnessPhrase(chartDetails);
  const ticketCardAsOfPhrase = buildChartFreshnessPhrase(chartDetails, {
    omitStation: true,
  });
  const fullRouteStations = uiPayload?.fullRouteStations ?? [];
  const longestPath = uiPayload?.longestPathAvailable;
  const hasChartResult =
    chartDetails || fullRouteStations.length > 0 || longestPath;

  const chartStatusPayload = uiPayload?.chartStatus;
  const openAiSummaryForDisplay = displayTextFromOpenAiSummary(
    uiPayload?.openAiSummary,
  );

  /** Recover plan/seats from a mistaken full-JSON `openAiSummary` string. */
  const {
    openAiBookingPlanResolved,
    openAiStructuredSeatsResolved,
    openAiTotalPriceResolved,
  } = useMemo(() => {
    const plan = uiPayload?.openAiBookingPlan;
    const seats = uiPayload?.openAiStructuredSeats;
    let total = uiPayload?.openAiTotalPrice;
    const hasPlan = Array.isArray(plan) && plan.length > 0;
    const hasSeats = Array.isArray(seats) && seats.length > 0;

    let blob: {
      booking_plan?: unknown[];
      seats?: unknown[];
      total_price?: number;
    } | null = null;
    const raw = uiPayload?.openAiSummary;
    if (
      (!hasPlan || !hasSeats) &&
      typeof raw === "string" &&
      raw.trim().startsWith("{")
    ) {
      try {
        blob = JSON.parse(raw.trim()) as {
          booking_plan?: unknown[];
          seats?: unknown[];
          total_price?: number;
        };
      } catch {
        blob = null;
      }
    }

    const planOut = hasPlan
      ? plan!
      : Array.isArray(blob?.booking_plan)
        ? (blob!.booking_plan as NonNullable<
            CheckResult["resultPayload"]
          >["openAiBookingPlan"])
        : [];

    const seatsOut = hasSeats
      ? seats!
      : Array.isArray(blob?.seats)
        ? (blob!.seats as NonNullable<
            CheckResult["resultPayload"]
          >["openAiStructuredSeats"])
        : [];

    if (total == null && typeof blob?.total_price === "number") {
      total = blob.total_price;
    }

    return {
      openAiBookingPlanResolved: planOut ?? [],
      openAiStructuredSeatsResolved: seatsOut ?? [],
      openAiTotalPriceResolved: total,
    };
  }, [
    uiPayload?.openAiBookingPlan,
    uiPayload?.openAiStructuredSeats,
    uiPayload?.openAiTotalPrice,
    uiPayload?.openAiSummary,
  ]);

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

  // Build full journey legs (ticket + gap) from route and booking plan (memoized so chart-meta effect deps stay stable).
  const routeStations = useMemo(() => {
    const scheduleList =
      uiPayload?.trainSchedule?.stationList ??
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
    return fromIdx >= 0 && toIdx >= 0 && fromIdx < toIdx
      ? routeStationsRaw.slice(fromIdx, toIdx + 1)
      : [];
  }, [
    uiPayload?.trainSchedule?.stationList,
    scheduleStations,
    fromCode,
    toCode,
  ]);
  const openAiPlan = openAiBookingPlanResolved;
  const openAiStructuredSeats = openAiStructuredSeatsResolved;

  function isEmptyService2PlanSlot(
    slot:
      | { instruction?: string; approx_price?: number }
      | Record<string, never>
      | undefined,
  ): boolean {
    if (slot == null || typeof slot !== "object") return true;
    if (Object.keys(slot as object).length === 0) return true;
    const ins = String(
      "instruction" in slot
        ? ((slot as { instruction?: string }).instruction ?? "")
        : "",
    ).trim();
    return ins.length === 0;
  }

  // Parse plan segments: each item matches openAiPlan index (empty slots → no from/to)
  const planSegments = useMemo(
    () =>
      openAiPlan.map(
        (
          item:
            | { instruction?: string; approx_price?: number }
            | Record<string, never>,
        ) => {
          const instr =
            typeof item === "string"
              ? item
              : "instruction" in item
                ? (item.instruction ?? "")
                : "";
          const parts = instr.split(" - ").map((p) => p.trim());
          return {
            fromCode: (parts[0] ?? "").toUpperCase(),
            toCode: (parts[1] ?? "").toUpperCase(),
            classCode: parts[2]?.trim() ?? "3A",
            approx_price:
              "approx_price" in item && typeof item.approx_price === "number"
                ? item.approx_price
                : null,
            instruction: instr,
          };
        },
      ),
    [openAiPlan],
  );

  const routeLegCount =
    routeStations.length >= 2 ? routeStations.length - 1 : 0;
  const planAlignedWithRoute =
    routeLegCount > 0 && openAiPlan.length === routeLegCount;
  const alignedJourneyLegs = useMemo(() => {
    if (!planAlignedWithRoute || routeStations.length < 2) return null;
    return routeStations.slice(0, -1).map((fromSt, i) => ({
      fromCode: fromSt.code,
      toCode: routeStations[i + 1]!.code,
      seg: planSegments[i]!,
      slot: openAiPlan[i],
    }));
  }, [planAlignedWithRoute, routeStations, planSegments, openAiPlan]);
  // Route index of a station code (for coverage check)
  const routeIndex = useCallback(
    (code: string) =>
      routeStations.findIndex(
        (s) => s.code === String(code).trim().toUpperCase(),
      ),
    [routeStations],
  );
  // Check if a consecutive route pair (fromCode, toCode) at indices (i, i+1) is covered by any plan segment
  const isPairCovered = useCallback(
    (fromCodeLeg: string, toCodeLeg: string) => {
      const i = routeIndex(fromCodeLeg);
      const j = routeIndex(toCodeLeg);
      if (i < 0 || j !== i + 1) return false;
      return planSegments.some((seg) => {
        if (!seg.fromCode || !seg.toCode) return false;
        const segFromIdx = routeIndex(seg.fromCode);
        const segToIdx = routeIndex(seg.toCode);
        return (
          segFromIdx >= 0 && segToIdx >= 0 && segFromIdx <= i && segToIdx >= j
        );
      });
    },
    [planSegments, routeIndex],
  );
  /** Hide micro-legs already covered by a prior ticket’s span (empty slot but not a gap). */
  const alignedJourneyLegsForDisplay = useMemo(() => {
    if (alignedJourneyLegs == null) return null;
    return alignedJourneyLegs.filter((leg) => {
      if (!isEmptyService2PlanSlot(leg.slot)) return true;
      if (isPairCovered(leg.fromCode, leg.toCode)) return false;
      return true;
    });
  }, [alignedJourneyLegs, isPairCovered]);

  /**
   * Per ticket leg: fetch chart meta per endpoint `sourceStation` (from + to for the strip).
   * API body is only trainNumber, journeyDate, sourceStation (no stationCodes).
   */
  const service2ChartLegRequests = useMemo(() => {
    if (uiPayload?.serviceSource !== "service2") return [];
    type Job = { legKey: string; sourceStations: string[] };
    const out: Job[] = [];
    const pushLeg = (aRaw: string, bRaw: string) => {
      const a = String(aRaw ?? "")
        .trim()
        .toUpperCase();
      const b = String(bRaw ?? "")
        .trim()
        .toUpperCase();
      if (!a || !b) return;
      const sourceStations: string[] = [];
      const seen = new Set<string>();
      for (const c of [a, b]) {
        if (!seen.has(c)) {
          seen.add(c);
          sourceStations.push(c);
        }
      }
      out.push({ legKey: `${a}-${b}`, sourceStations });
    };
    if (alignedJourneyLegsForDisplay?.length) {
      for (const leg of alignedJourneyLegsForDisplay) {
        if (isEmptyService2PlanSlot(leg.slot)) continue;
        pushLeg(leg.seg.fromCode ?? "", leg.seg.toCode ?? "");
      }
      return out;
    }
    if (!planAlignedWithRoute) {
      for (const seg of planSegments) {
        if (!seg.fromCode || !seg.toCode) continue;
        pushLeg(seg.fromCode, seg.toCode);
      }
    }
    return out;
  }, [
    uiPayload?.serviceSource,
    alignedJourneyLegsForDisplay,
    planAlignedWithRoute,
    planSegments,
  ]);

  useEffect(() => {
    if (uiPayload?.serviceSource !== "service2") {
      setStationChartMetaByCode({});
      setLegChartMetaLoading({});
      return;
    }
    if (
      service2ChartLegRequests.length === 0 ||
      !trainNumber.trim() ||
      !journeyDate.trim()
    ) {
      setStationChartMetaByCode({});
      setLegChartMetaLoading({});
      return;
    }
    const ac = new AbortController();
    const jobs = service2ChartLegRequests;
    setStationChartMetaByCode({});
    const init: Record<string, boolean> = {};
    for (const j of jobs) init[j.legKey] = true;
    setLegChartMetaLoading(init);

    void Promise.all(
      jobs.map(async (job) => {
        try {
          await Promise.all(
            job.sourceStations.map(async (sourceStation) => {
              try {
                const r = await apiClient.post<{
                  stations: StationChartMetaItem[];
                }>(
                  "/api/train-composition/stations-meta",
                  {
                    trainNumber: trainNumber.trim(),
                    journeyDate: journeyDate.trim(),
                    sourceStation,
                  },
                  { timeout: 120_000, signal: ac.signal },
                );
                if (ac.signal.aborted) return;
                const rows = Array.isArray(r.data?.stations)
                  ? r.data.stations
                  : [];
                setStationChartMetaByCode((prev) => {
                  const next = { ...prev };
                  for (const row of rows) {
                    const k = String(row.stationCode ?? "")
                      .trim()
                      .toUpperCase();
                    if (k) next[k] = row;
                  }
                  return next;
                });
              } catch {
                /* keep merged meta from other stations / legs */
              }
            }),
          );
        } finally {
          if (!ac.signal.aborted) {
            setLegChartMetaLoading((p) => ({ ...p, [job.legKey]: false }));
          }
        }
      }),
    );

    return () => {
      ac.abort();
    };
  }, [
    uiPayload?.serviceSource,
    service2ChartLegRequests,
    trainNumber,
    journeyDate,
  ]);

  // Ticket cards: one per plan segment (Book). Gap cards: consecutive route pairs not covered (Monitor).
  const ticketCards = planAlignedWithRoute
    ? []
    : planSegments.filter((seg) => seg.fromCode && seg.toCode);
  const gapLegs: Leg[] = planAlignedWithRoute
    ? []
    : routeStations.length >= 2
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
    alignedJourneyLegs != null
      ? alignedJourneyLegs.reduce(
          (sum, leg) =>
            isEmptyService2PlanSlot(leg.slot)
              ? sum
              : sum + (leg.seg.approx_price ?? 0),
          0,
        )
      : ticketCards.length > 0
        ? ticketCards.reduce((sum, seg) => sum + (seg.approx_price ?? 0), 0)
        : typeof openAiTotalPriceResolved === "number"
          ? openAiTotalPriceResolved
          : null;

  /** While SSE is still chaining OpenAI + vacant berth, show loaders on empty legs. */
  const service2SearchingMoreLegs =
    loading &&
    service2StreamPartial != null &&
    uiPayload?.serviceSource === "service2";

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50">
      <div className="sticky top-0 z-20">
        <IstRailMaintenanceBanner show={railMaint.showBanner} />
        <header
          className="border-b border-slate-100 bg-white/95 backdrop-blur-sm"
          role="banner"
        >
          <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
            <span className="text-lg font-semibold text-blue-600 tracking-tight">
              LastBerth
            </span>
          </div>
        </header>
      </div>

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
              Confirmed seats after charting — with realtime availability
            </h1>
            <div className="mt-4 text-left">
              <p className="text-pretty text-sm leading-relaxed text-slate-600">
                After chart preparation, seats change constantly. We read
                real-time availability and show you what you can book now — one
                ticket or split legs and if there are none there is always a way
                to get a seat with the TTE as long as you get the first leg
                booked.
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
                      htmlFor="train-search-input"
                      className="block text-m font-semibold text-gray-900 mb-1.5"
                    >
                      Train Number or Name
                    </label>
                    <div className="grid w-full grid-cols-1 cursor-text rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px]">
                      <input
                        ref={trainInputRef}
                        id="train-search-input"
                        type="text"
                        role="combobox"
                        aria-expanded={trainDropdownOpen}
                        aria-controls="train-dropdown"
                        aria-autocomplete="list"
                        value={trainInput}
                        onChange={(e) => {
                          setTrainInput(e.target.value);
                          setTrainDropdownOpen(true);
                        }}
                        onFocus={() => {
                          if (trainDropdownBlurCloseTimer.current) {
                            clearTimeout(trainDropdownBlurCloseTimer.current);
                            trainDropdownBlurCloseTimer.current = null;
                          }
                          setTrainDropdownOpen(true);
                        }}
                        onBlur={() => {
                          if (trainDropdownBlurCloseTimer.current) {
                            clearTimeout(trainDropdownBlurCloseTimer.current);
                          }
                          trainDropdownBlurCloseTimer.current = setTimeout(
                            () => {
                              setTrainDropdownOpen(false);
                              trainDropdownBlurCloseTimer.current = null;
                            },
                            180,
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setTrainDropdownOpen(false);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
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
                      className={`z-10 absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5 ${trainDropdownOpen ? "" : "hidden"}`}
                    >
                      {mounted && (
                        <ul
                          role="listbox"
                          aria-labelledby="train-search-input"
                          className="text-base sm:text-sm"
                        >
                          {trainDropdownOptions.slice(0, 100).map((t) => {
                            const selected = trainInput === t.label;
                            return (
                              <li
                                key={`${t.number}-${t.label}`}
                                role="presentation"
                              >
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className="relative block w-full cursor-default py-2 pl-3 pr-9 text-left text-gray-900 select-none focus:bg-indigo-600 focus:text-white focus:outline-none"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                  }}
                                  onClick={() => {
                                    trackAnalyticsEvent({
                                      name: "train_selected_from_dropdown",
                                      properties: { train_number: t.number },
                                    });
                                    setTrainInput(t.label);
                                    setTrainDropdownOpen(false);
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
                      htmlFor="from-station-input"
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
                      <div className="grid w-full grid-cols-1 cursor-text rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px] disabled:pointer-events-none">
                        <input
                          id="from-station-input"
                          type="text"
                          role="combobox"
                          aria-expanded={fromDropdownOpen}
                          aria-controls="from-dropdown"
                          aria-autocomplete="list"
                          value={from}
                          onChange={(e) => {
                            setFrom(e.target.value);
                            if (trainSelected && !scheduleError) {
                              setFromDropdownOpen(true);
                            }
                          }}
                          onFocus={() => {
                            if (fromDropdownBlurCloseTimer.current) {
                              clearTimeout(fromDropdownBlurCloseTimer.current);
                              fromDropdownBlurCloseTimer.current = null;
                            }
                            if (!trainSelected) {
                              promptSelectTrainFirst();
                              return;
                            }
                            if (!scheduleError) {
                              setFromDropdownOpen(true);
                            }
                          }}
                          onBlur={() => {
                            if (fromDropdownBlurCloseTimer.current) {
                              clearTimeout(fromDropdownBlurCloseTimer.current);
                            }
                            fromDropdownBlurCloseTimer.current = setTimeout(
                              () => {
                                setFromDropdownOpen(false);
                                fromDropdownBlurCloseTimer.current = null;
                              },
                              180,
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setFromDropdownOpen(false);
                              (e.target as HTMLInputElement).blur();
                            }
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
                          autoComplete="off"
                        />
                        <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                          <ChevronUpDownIcon className="size-5 text-gray-500" />
                        </span>
                      </div>
                    </div>
                    {!scheduleError && trainSelected && (
                      <div
                        id="from-dropdown"
                        className={`z-10 absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5 ${fromDropdownOpen ? "" : "hidden"}`}
                      >
                        {mounted && (
                          <ul
                            role="listbox"
                            className="text-base sm:text-sm"
                            aria-labelledby="from-station-input"
                          >
                            {stationOptions.map((s) => {
                              const optionLabel = `${s.code} - ${s.name}`;
                              const selected = from === optionLabel;
                              return (
                                <li key={s.code} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className="relative block w-full cursor-default py-2 pl-3 pr-9 text-left text-gray-900 select-none focus:bg-indigo-600 focus:text-white focus:outline-none"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                    }}
                                    onClick={() => {
                                      setFrom(optionLabel);
                                      setFromDropdownOpen(false);
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
                      disabled={
                        !!scheduleError || Boolean(scheduleStations?.length)
                      }
                      title={
                        scheduleStations?.length
                          ? "Swap disabled: destination must be after boarding station on this route"
                          : undefined
                      }
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
                      htmlFor="to-station-input"
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
                      <div className="grid w-full grid-cols-1 cursor-text rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 text-sm min-h-[38px] disabled:pointer-events-none">
                        <input
                          id="to-station-input"
                          type="text"
                          role="combobox"
                          aria-expanded={toDropdownOpen}
                          aria-controls="to-dropdown"
                          aria-autocomplete="list"
                          value={to}
                          onChange={(e) => {
                            setTo(e.target.value);
                            if (trainSelected && !scheduleError) {
                              setToDropdownOpen(true);
                            }
                          }}
                          onFocus={() => {
                            if (toDropdownBlurCloseTimer.current) {
                              clearTimeout(toDropdownBlurCloseTimer.current);
                              toDropdownBlurCloseTimer.current = null;
                            }
                            if (!trainSelected) {
                              promptSelectTrainFirst();
                              return;
                            }
                            if (!scheduleError) {
                              setToDropdownOpen(true);
                            }
                          }}
                          onBlur={() => {
                            if (toDropdownBlurCloseTimer.current) {
                              clearTimeout(toDropdownBlurCloseTimer.current);
                            }
                            toDropdownBlurCloseTimer.current = setTimeout(
                              () => {
                                setToDropdownOpen(false);
                                toDropdownBlurCloseTimer.current = null;
                              },
                              180,
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setToDropdownOpen(false);
                              (e.target as HTMLInputElement).blur();
                            }
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
                          autoComplete="off"
                        />
                        <span className="col-start-1 row-start-1 self-center justify-self-end pointer-events-none pr-2">
                          <ChevronUpDownIcon className="size-5 text-gray-500" />
                        </span>
                      </div>
                    </div>
                    {!scheduleError && trainSelected && (
                      <div
                        id="to-dropdown"
                        className={`z-10 absolute left-0 right-0 top-full mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5 ${toDropdownOpen ? "" : "hidden"}`}
                      >
                        {mounted && (
                          <ul
                            role="listbox"
                            className="text-base sm:text-sm"
                            aria-labelledby="to-station-input"
                          >
                            {toOptions.map((s) => {
                              const optionLabel = `${s.code} - ${s.name}`;
                              const selected = to === optionLabel;
                              return (
                                <li key={s.code} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className="relative block w-full cursor-default py-2 pl-3 pr-9 text-left text-gray-900 select-none focus:bg-indigo-600 focus:text-white focus:outline-none"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                    }}
                                    onClick={() => {
                                      setTo(optionLabel);
                                      setToDropdownOpen(false);
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
                    <div
                      className={`grid w-full grid-cols-1 cursor-default rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-gray-900 outline outline-1 -outline-offset-1 text-sm min-h-[38px] ${
                        trainDoesNotRunOnSelectedDate
                          ? "outline-red-400 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-red-500"
                          : "outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600"
                      }`}
                    >
                      <select
                        id="departure-date-select"
                        value={journeyDate}
                        onChange={(e) => setJourneyDate(e.target.value)}
                        required
                        aria-invalid={trainDoesNotRunOnSelectedDate}
                        aria-describedby={
                          trainDoesNotRunOnSelectedDate
                            ? "departure-date-run-day-error"
                            : undefined
                        }
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
                    {trainDoesNotRunOnSelectedDate && trainRunDayMessage && (
                      <p
                        id="departure-date-run-day-error"
                        role="alert"
                        className="mt-2 text-sm font-medium text-red-600"
                      >
                        {trainRunDayMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 pt-0">
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !!scheduleError ||
                      trainDoesNotRunOnSelectedDate
                    }
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
          <section
            className="mt-8 mb-4"
            aria-labelledby={
              formAlertMessage ? undefined : "how-it-works-heading"
            }
            aria-label={formAlertMessage ? "Search form notice" : undefined}
          >
            {formAlertMessage ? (
              <div
                role="alert"
                className="rounded-xl bg-red-50/80 border border-red-100 px-4 py-3 text-red-700 text-sm"
              >
                {formAlertMessage}
              </div>
            ) : (
              <>
                <h2
                  id="how-it-works-heading"
                  className="text-center text-base font-semibold text-slate-800 mb-4"
                >
                  How it works
                </h2>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Previous step"
                    onClick={() => scrollHowItWorksCarousel(-1)}
                    className="md:hidden absolute left-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-50"
                  >
                    <ChevronLeftIcon className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next step"
                    onClick={() => scrollHowItWorksCarousel(1)}
                    className="md:hidden absolute right-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-50"
                  >
                    <ChevronRightIcon className="size-5" />
                  </button>
                  <div
                    ref={howItWorksCarouselRef}
                    onScroll={updateHowItWorksSlideFromScroll}
                    className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-10 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0"
                  >
                    {HOW_IT_WORKS_STEPS.map((item) => (
                      <div
                        key={item.step}
                        data-how-step
                        className="flex min-w-[min(100%,calc(100vw-5.25rem))] shrink-0 snap-center flex-col items-center rounded-xl border border-slate-100 bg-white px-4 py-5 text-center shadow-sm md:min-w-0"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold text-sm mb-3">
                          {item.step}
                        </div>
                        <h3 className="font-medium text-slate-800 text-sm mb-1">
                          {item.title}
                        </h3>
                        <p className="text-slate-500 text-sm text-pretty">
                          {item.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className="flex justify-center gap-1.5 mt-3 md:hidden"
                  aria-hidden
                >
                  {HOW_IT_WORKS_STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === howItWorksSlide
                          ? "w-5 bg-blue-600"
                          : "w-1.5 bg-slate-300"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {loading && !checkResult && !service2StreamPartial && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <SearchLoaderTrainTrack />
            <p className="text-slate-900 text-left text-lg font-bold leading-snug sm:text-xl">
              {service2StreamLine || "Finding you the best possible seats…"}
            </p>
          </div>
        )}

        {((checkResult &&
          !loading &&
          (!showChartPendingMonitor || chartPendingModalDismissed)) ||
          (loading && service2StreamPartial != null)) && (
          <section className="mt-6 rounded-2xl bg-slate-100/60 py-4 px-0">
            {uiPayload?.serviceSource === "service2" ? (
              uiPayload.chartStatus ? (
                <div className="rounded-2xl border border-amber-200/90 bg-white p-4 shadow-md">
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <p className="font-bold text-amber-900 text-xl">
                      {uiPayload.chartStatus.kind === "not_prepared_yet"
                        ? uiPayload.chartStatus.message
                        : uiPayload.chartStatus.kind === "irctc_unavailable"
                          ? uiPayload.chartStatus.message
                          : uiPayload.chartStatus.error}
                    </p>
                    {uiPayload.chartStatus.kind === "irctc_unavailable" &&
                      uiPayload.chartStatus.detail && (
                        <p className="mt-2 text-sm text-amber-800/95 leading-snug">
                          {uiPayload.chartStatus.detail}
                        </p>
                      )}
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
              ) : openAiBookingPlanResolved.length > 0 ? (
                <div className="rounded-2xl border border-slate-200/90 bg-white shadow-lg overflow-hidden">
                  {/* Train header with total fare on top right */}
                  <div className="border-b border-slate-100 px-4 py-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 leading-tight">
                        {trainNumber} {uiPayload.composition?.trainName ?? ""}
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                        <span>{uiPayload.composition?.from ?? fromCode}</span>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>
                          {(uiPayload.composition?.to ?? toCode) || "—"}
                        </span>
                      </p>
                      {uiPayload.chartPreparationDetails
                        ?.firstChartCreationTime && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Chart preparation:{" "}
                          {
                            uiPayload.chartPreparationDetails
                              .firstChartCreationTime
                          }
                          {uiPayload.chartPreparationDetails.chartingStationCode
                            ? ` at ${uiPayload.chartPreparationDetails.chartingStationCode}`
                            : ""}
                        </p>
                      )}
                    </div>
                    {totalApproxPrice != null && totalApproxPrice > 0 && (
                      <div className="shrink-0 text-right">
                        <p className="text-slate-800 font-semibold text-sm">
                          Total approx. fare
                        </p>
                        <p className="mt-0.5 flex items-center justify-end gap-1 text-slate-900 font-bold text-base">
                          <span>
                            ₹{totalApproxPrice.toLocaleString("en-IN")}
                          </span>
                          <IndicativeFareInfoButton />
                        </p>
                      </div>
                    )}
                  </div>

                  {openAiSummaryForDisplay && (
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-sm font-semibold text-slate-700 leading-snug">
                        {openAiSummaryForDisplay}
                      </p>
                    </div>
                  )}

                  {uiPayload.chartRefreshNotice && (
                    <div
                      className="mx-4 mt-3 rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-2.5 text-left"
                      role="status"
                    >
                      <p className="text-sm font-medium text-amber-950">
                        {uiPayload.chartRefreshNotice.message}
                      </p>
                    </div>
                  )}

                  {/* Full journey: plan segments as Book cards, then gap legs as Monitor cards */}
                  <div className="px-4 py-4 space-y-3">
                    {alignedJourneyLegsForDisplay != null &&
                    alignedJourneyLegsForDisplay.length > 0 ? (
                      <>
                        {(() => {
                          let ticketIndex = 0;
                          return alignedJourneyLegsForDisplay.map((leg, i) => {
                            const stationLabel = (code: string) => {
                              const s = stationsForRoute.find(
                                (x) =>
                                  x.code.toUpperCase() ===
                                  String(code).trim().toUpperCase(),
                              );
                              return s ? `${s.code} - ${s.name}` : code;
                            };
                            const hasTicket = !isEmptyService2PlanSlot(
                              leg.slot,
                            );
                            if (hasTicket) ticketIndex += 1;
                            const seg = leg.seg;
                            const scheduleListWithTimes =
                              uiPayload?.trainSchedule?.stationList ?? [];
                            const segFromU = String(seg.fromCode ?? "")
                              .trim()
                              .toUpperCase();
                            const segToU = String(seg.toCode ?? "")
                              .trim()
                              .toUpperCase();
                            const fromStationSchedule =
                              scheduleListWithTimes.find(
                                (s) =>
                                  String(s.stationCode ?? "")
                                    .trim()
                                    .toUpperCase() === segFromU,
                              );
                            const toStationSchedule =
                              scheduleListWithTimes.find(
                                (s) =>
                                  String(s.stationCode ?? "")
                                    .trim()
                                    .toUpperCase() === segToU,
                              );
                            const depTime =
                              fromStationSchedule?.departureTime?.trim() ||
                              null;
                            const arrTime =
                              toStationSchedule?.arrivalTime?.trim() ||
                              toStationSchedule?.departureTime?.trim() ||
                              null;
                            const routeLabel = `${stationLabel(leg.fromCode)} → ${stationLabel(leg.toCode)}`;
                            return (
                              <Fragment
                                key={`aligned-leg-${leg.fromCode}-${leg.toCode}-${i}`}
                              >
                                {i > 0 && (
                                  <div className="flex justify-center py-1">
                                    <ChevronDownIcon className="h-10 w-10 text-slate-400" />
                                  </div>
                                )}
                                {hasTicket ? (
                                  (() => {
                                    const seatsForSegment =
                                      openAiStructuredSeats.filter(
                                        (s) =>
                                          String(s.from ?? "")
                                            .trim()
                                            .toUpperCase() === seg.fromCode &&
                                          String(s.to ?? "")
                                            .trim()
                                            .toUpperCase() === seg.toCode,
                                      );
                                    const irctcClass = seg.classCode.replace(
                                      /AC$/i,
                                      "A",
                                    );
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
                                      <div className="flex flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 pt-4 pb-0 w-full shadow-sm">
                                        <TicketCardTitleRow
                                          ticketIndex={ticketIndex}
                                          classCode={seg.classCode}
                                          asOfPhrase={ticketCardAsOfPhrase}
                                        />
                                        <div className="flex items-start gap-2 text-sm font-medium text-slate-800 pb-4">
                                          <div className="min-w-0 flex-1">
                                            <p className="leading-tight">
                                              {stationLabel(seg.fromCode)}
                                            </p>
                                            {depTime && (
                                              <p className="text-s text-slate-500 font-bold mt-0.5">
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
                                              <p className="text-s text-slate-500 font-bold mt-0.5">
                                                Arr {arrTime}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        {seatsForSegment.length > 0 && (
                                          <p className="mt-2 text-sm text-slate-600 pb-4">
                                            {seatsForSegment
                                              .map(
                                                (s) =>
                                                  `Coach ${s.coach ?? "—"}, Berth ${s.berth ?? "—"}${s.seat ? `, ${s.seat}` : ""}`,
                                              )
                                              .join(" · ")}
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
                                                train_number:
                                                  trainNumber.trim(),
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
                                        <TicketJourneyChartStrip
                                          fromMeta={
                                            stationChartMetaByCode[segFromU]
                                          }
                                          toMeta={
                                            stationChartMetaByCode[segToU]
                                          }
                                          loading={
                                            legChartMetaLoading[
                                              `${segFromU}-${segToU}`
                                            ] ?? false
                                          }
                                        />
                                      </div>
                                    );
                                  })()
                                ) : service2SearchingMoreLegs ? (
                                  <div className="flex flex-col rounded-xl border border-sky-200/90 bg-sky-50/70 px-4 py-4 w-full shadow-sm">
                                    <p className="text-sm font-semibold text-slate-500 mb-1.5">
                                      Upcoming leg
                                    </p>
                                    <p className="text-sm font-medium text-slate-800">
                                      {routeLabel}
                                    </p>
                                    <div className="mt-3 flex items-center gap-2.5 text-sm text-sky-950">
                                      <span
                                        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"
                                        aria-hidden
                                      />
                                      <span>Finding you a ticket here…</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-4 w-full shadow-sm">
                                    <p className="text-sm font-semibold text-slate-500 mb-1.5">
                                      No tickets
                                    </p>
                                    <p className="text-sm font-medium text-slate-800">
                                      {routeLabel}
                                    </p>
                                    <p className="mt-2 text-sm text-amber-900/90 leading-snug">
                                      Speak to the TTE to figure out a space
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
                                )}
                              </Fragment>
                            );
                          });
                        })()}
                      </>
                    ) : ticketCards.length > 0 || gapLegs.length > 0 ? (
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
                            uiPayload?.trainSchedule?.stationList ?? [];
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
                          const ticketSegFromU = String(seg.fromCode ?? "")
                            .trim()
                            .toUpperCase();
                          const ticketSegToU = String(seg.toCode ?? "")
                            .trim()
                            .toUpperCase();
                          return (
                            <Fragment
                              key={`ticket-${seg.fromCode}-${seg.toCode}-${i}`}
                            >
                              {i > 0 && (
                                <div className="flex justify-center py-1">
                                  <ChevronDownIcon className="h-10 w-10 text-slate-400" />
                                </div>
                              )}
                              <div className="flex flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 pt-4 pb-0 w-full shadow-sm">
                                <TicketCardTitleRow
                                  ticketIndex={i + 1}
                                  classCode={seg.classCode}
                                  asOfPhrase={ticketCardAsOfPhrase}
                                />
                                <div className="flex items-start gap-2 pb-4 text-sm font-medium text-slate-800">
                                  <div className="min-w-0 flex-1">
                                    <p className="leading-tight">
                                      {stationLabel(seg.fromCode)}
                                    </p>
                                    {depTime && (
                                      <p className="text-s text-slate-500 font-bold mt-0.5">
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
                                      <p className="text-s text-slate-500 font-bold mt-0.5">
                                        Arr {arrTime}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {seatsForSegment.length > 0 && (
                                  <p className="mt-2 text-sm text-slate-600 pb-4">
                                    {seatsForSegment
                                      .map(
                                        (s) =>
                                          `Coach ${s.coach ?? "—"}, Berth ${s.berth ?? "—"}${s.seat ? `, ${s.seat}` : ""}`,
                                      )
                                      .join(" · ")}
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
                                <TicketJourneyChartStrip
                                  fromMeta={
                                    stationChartMetaByCode[ticketSegFromU]
                                  }
                                  toMeta={stationChartMetaByCode[ticketSegToU]}
                                  loading={
                                    legChartMetaLoading[
                                      `${ticketSegFromU}-${ticketSegToU}`
                                    ] ?? false
                                  }
                                />
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
                              <p className="mt-2 text-sm text-amber-900/90 leading-snug">
                                Speak to the TTE to figure out a space
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
                              <TicketCardTitleRow
                                ticketIndex={i + 1}
                                classCode={classCode}
                                asOfPhrase={ticketCardAsOfPhrase}
                              />
                              <p className="text-sm font-medium text-slate-800">
                                {stationLabel(origin)} →{" "}
                                {stationLabel(destination)}
                              </p>
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
              ) : checkResult?.status === "failed" || apiError ? (
                <div className="rounded-2xl border border-red-200/80 bg-white p-4 shadow-md">
                  <div className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-4 min-h-[44px] flex items-center">
                    <p className="font-medium text-red-800 text-sm">
                      {SERVICE2_NO_TICKETS_AVAILABLE_COPY}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/90 bg-white shadow-lg overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4">
                    <h2 className="text-base font-bold text-slate-900">
                      {trainNumber} {uiPayload.composition?.trainName ?? ""}
                    </h2>
                  </div>
                  <div className="p-4">
                    <div
                      className={`rounded-xl border px-4 py-6 text-center ${
                        openAiSummaryForDisplay
                          ? "border-slate-200/90 bg-slate-50/80"
                          : "border-red-200/80 bg-red-50/60"
                      }`}
                    >
                      <p
                        className={`font-medium text-sm whitespace-pre-wrap ${
                          openAiSummaryForDisplay
                            ? "text-slate-800"
                            : "text-red-800"
                        }`}
                      >
                        {openAiSummaryForDisplay?.trim() ||
                          "No tickets found between these stations"}
                      </p>
                      {!openAiSummaryForDisplay?.trim() && (
                        <p className="mt-1 text-sm text-red-700/90">
                          Try a different date, train, or route.
                        </p>
                      )}
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
                {checkResult?.status === "failed" || apiError ? (
                  <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4">
                    <p className="font-medium text-red-800">
                      {apiError || SERVICE2_NO_TICKETS_AVAILABLE_COPY}
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
                      uiPayload?.serviceSource !== "service2" && (
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
                    {longestPath && uiPayload?.serviceSource !== "service2" && (
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
                      uiPayload?.serviceSource !== "service2" && (
                        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4">
                          <p className="font-medium text-green-800">
                            Full journey confirmed.
                          </p>
                        </div>
                      )}
                    {summary && uiPayload?.serviceSource !== "service2" && (
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
                      uiPayload?.serviceSource !== "service2" && (
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
                      uiPayload?.serviceSource !== "service2" && (
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
                    setHelpfulFeedbackPopupOpen(true);
                    trackAnalyticsEvent({
                      name: "popup_opened",
                      properties: { popup: "helpful_feedback" },
                    });
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

        <IstRailMaintenanceModal
          open={railMaint.maintenanceModalOpen}
          onClose={railMaint.dismissMaintenanceModal}
          minutesDisplay={railMaint.displayMinutes}
        />

        {journeyRunDayApiError && (
          <div
            className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journey-run-day-api-title"
            onClick={() => setJourneyRunDayApiError(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="journey-run-day-api-title"
                className="text-lg font-bold text-slate-900 leading-snug"
              >
                Train does not run on this date
              </h2>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {journeyRunDayApiError.message}
              </p>
              {journeyRunDayApiError.runningDayNames.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Days this train usually runs
                  </p>
                  <p className="mt-1 text-sm text-slate-900">
                    {journeyRunDayApiError.runningDayNames.join(", ")}
                  </p>
                </div>
              )}
              {journeyRunDayApiError.nextRunDayAndDate && (
                <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Next run after your date
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {journeyRunDayApiError.nextRunDayAndDate}
                  </p>
                  {journeyRunDayApiError.nextRunDate && (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {journeyRunDayApiError.nextRunDate}
                    </p>
                  )}
                </div>
              )}
              {journeyRunDayApiError.runningDayNames.length === 0 &&
                !journeyRunDayApiError.nextRunDayAndDate && (
                  <p className="mt-3 text-xs text-slate-500">
                    Pick another journey date or confirm the schedule on IRCTC.
                  </p>
                )}
              <button
                type="button"
                onClick={() => setJourneyRunDayApiError(null)}
                className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700"
              >
                OK
              </button>
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
                        properties: {
                          source: "chart_pending",
                          outcome: "cancel",
                        },
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

        {monitoringStartedPopupOpen &&
          (monitorJourneyResponse || journeySetupQueued) && (
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
                setJourneySetupQueued(false);
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
                      {journeySetupQueued
                        ? "Your alert is being set up"
                        : "We'll watch this train for you"}
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
                      setJourneySetupQueued(false);
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
                  {journeySetupQueued && (
                    <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 text-sm text-emerald-950">
                      We&apos;re finishing setup in the background—chart times,
                      route checks, and your contact details are being
                      configured now. You don&apos;t need to wait on this
                      screen.
                    </p>
                  )}
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
                      <span className="font-semibold text-slate-900">
                        email
                      </span>{" "}
                      (whichever you gave us).
                    </li>
                    <li>
                      Please open{" "}
                      <span className="font-semibold text-slate-900">
                        IRCTC
                      </span>{" "}
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
                      setJourneySetupQueued(false);
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
