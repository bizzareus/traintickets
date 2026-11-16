"use client";
import { createFreeChartAlert } from "@/lib/chart-alert-payments";

import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { apiClient, irctcScheduleClient } from "@/lib/api";
import { trackAnalyticsEvent, trackAlertRequested } from "@/lib/analytics";
import { fetchService2CheckStream } from "@/lib/service2CheckStream";
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
import { saveStoredContact } from "@/lib/contact";

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

type Service2Composition = {
  trainNo?: string;
  trainName?: string;
  from?: string;
  to?: string;
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
    error?: string | null;
    composition?: Service2Composition;
    chartStatus?:
      | { kind: "not_prepared_yet"; message: string }
      | { kind: "chart_error"; error: string }
      | { kind: "irctc_unavailable"; message: string; detail?: string };
    trainStartDate?: string;
    [k: string]: unknown;
  };
};

/** Body from `POST /api/service2/check` and the stream `result` event. */
type Service2CheckOkBody = {
  status?: string;
  composition?: NonNullable<CheckResult["resultPayload"]>["composition"];
  vacantBerth?: { error?: string | null };
  chartStatus?: NonNullable<CheckResult["resultPayload"]>["chartStatus"];
  trainStartDate?: string;
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
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const monitoringSuccessOpenTracked = useRef(false);
  const [monitoringStartedPopupOpen, setMonitoringStartedPopupOpen] =
    useState(false);
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
  const service2RequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => service2RequestRef.current?.abort(), []);
  const [trainDropdownOpen, setTrainDropdownOpen] = useState(false);
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);
  const [stationGateMessage, setStationGateMessage] = useState<string | null>(
    null,
  );
  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (scheduleError) return;
    if (trainDoesNotRunOnSelectedDate) {
      setError(trainRunDayMessage ?? "This train doesn't run on that day.");
      return;
    }
    if (!trainNumber.trim() || !fromCode || !journeyDate) {
      setError("Please enter train number, from station and date.");
      return;
    }
    service2RequestRef.current?.abort();
    const controller = new AbortController();
    service2RequestRef.current = controller;
    setError(null);
    setCheckResult(null);
    setMonitorJourneyResponse(null);
    setMonitorError(null);
    setMonitorSuccess(null);
    setMonitoringStartedPopupOpen(false);
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
        },
        controller.signal,
      )) as Service2CheckOkBody;
      setCheckResult({
        status: data.status ?? "success",
        resultPayload: {
          composition: data.composition,
          chartStatus: data.chartStatus ?? undefined,
          error: data.vacantBerth?.error ?? null,
          trainStartDate: data.trainStartDate,
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
      if (controller.signal.aborted) return;
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
      if (service2RequestRef.current === controller) {
        service2RequestRef.current = null;
        setLoading(false);
        setService2StreamLine("");
      }
    }
  }

  async function submitJourneyMonitor(fromC: string, toC: string) {
    const email = monitorEmail.trim() || undefined;
    const mobile = monitorMobile.trim() || undefined;
    if (!email) return;
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
        trainStartDate: checkResult?.resultPayload?.trainStartDate,
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

      await createFreeChartAlert({
        trainNumber: trainNumber.trim(),
        fromStationCode: fromC,
        toStationCode: toC,
        journeyDate: journeyDate.trim(),
        classCode: "3A",
        email,
        mobile,
        trainStartDate: checkResult?.resultPayload?.trainStartDate,
      });
      setMonitorJourneyResponse(null);
      setJourneySetupQueued(true);
      setMonitoringStartedPopupOpen(true);
      setChartPendingModalDismissed(true);
      trackAlertRequested({
        success: true,
        source: "v1_page",
        trainNumber: trainNumber.trim(),
        fromCode: fromC,
        toCode: toC,
        journeyDate: journeyDate.trim(),
        classCode: "3A",
        email: email || undefined,
        mobile: mobile || undefined,
      });
      trackAnalyticsEvent({
        name: "monitor_journey_submitted",
        properties: { success: true, queued: true },
      });
      saveStoredContact({ email: email ?? "", mobile: mobile ?? "" });
    } catch (err: unknown) {
      const runDayPayload = extractJourneyTrainRunDayError(err);
      if (runDayPayload) {
        setJourneyRunDayApiError(runDayPayload);
        trackAlertRequested({
          success: false,
          source: "v1_page",
          trainNumber: trainNumber.trim(),
          fromCode: fromC,
          toCode: toC,
          journeyDate: journeyDate.trim(),
          classCode: "3A",
          email: email || undefined,
          mobile: mobile || undefined,
          error: "train_does_not_run_on_date",
        });
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
        trackAlertRequested({
          success: false,
          source: "v1_page",
          trainNumber: trainNumber.trim(),
          fromCode: fromC,
          toCode: toC,
          journeyDate: journeyDate.trim(),
          classCode: "3A",
          email: email || undefined,
          mobile: mobile || undefined,
          error: msg,
        });
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
      : (scheduleStations ?? [])
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
            (s) => !fromCode || s.code.toUpperCase() !== fromCode.toUpperCase(),
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
  const uiPayload = payload;
  const apiError = uiPayload?.error;

  const chartStatusPayload = uiPayload?.chartStatus;

  const showChartPendingMonitor =
    Boolean(checkResult && !loading) &&
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

  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-50/50">
      <div className="sticky top-0 z-20">
        <header
          className="border-b border-slate-100 bg-white/95 backdrop-blur-sm"
          role="banner"
        >
          <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
            <span className="text-lg font-semibold tracking-tight text-blue-600">
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
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            {trainsLoading ? (
              <div
                className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-14"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div
                  className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
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
                <div className="space-y-4 p-4">
                  <div className="relative min-w-0">
                    <label
                      htmlFor="train-search-input"
                      className="text-m mb-1.5 block font-semibold text-gray-900"
                    >
                      Train Number or Name
                    </label>
                    <div className="grid min-h-[38px] w-full cursor-text grid-cols-1 rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-sm text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600">
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
                        className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent text-inherit outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0"
                        autoComplete="off"
                      />
                      <span className="pointer-events-none col-start-1 row-start-1 self-center justify-self-end pr-2">
                        <ChevronUpDownIcon className="size-5 text-gray-500" />
                      </span>
                    </div>
                    <div
                      id="train-dropdown"
                      className={`absolute left-0 right-0 top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5 ${trainDropdownOpen ? "" : "hidden"}`}
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
                                  className="relative block w-full cursor-default select-none py-2 pl-3 pr-9 text-left text-gray-900 focus:bg-indigo-600 focus:text-white focus:outline-none"
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
                    className={`relative min-w-0 ${scheduleError ? "opacity-60" : !trainSelected ? "opacity-75" : ""}`}
                  >
                    <label
                      htmlFor="from-station-input"
                      className="text-medium mb-1.5 block font-semibold text-gray-900"
                    >
                      From
                    </label>
                    <div className="relative">
                      {!trainSelected && (
                        <button
                          type="button"
                          className="absolute inset-0 z-[5] cursor-pointer rounded-md bg-transparent"
                          aria-label="Select a train before choosing From station"
                          onClick={promptSelectTrainFirst}
                        />
                      )}
                      <div className="grid min-h-[38px] w-full cursor-text grid-cols-1 rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-sm text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 disabled:pointer-events-none">
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
                          className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent text-inherit outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-90"
                          autoComplete="off"
                        />
                        <span className="pointer-events-none col-start-1 row-start-1 self-center justify-self-end pr-2">
                          <ChevronUpDownIcon className="size-5 text-gray-500" />
                        </span>
                      </div>
                    </div>
                    {!scheduleError && trainSelected && (
                      <div
                        id="from-dropdown"
                        className={`absolute left-0 right-0 top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5 ${fromDropdownOpen ? "" : "hidden"}`}
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
                                    className="relative block w-full cursor-default select-none py-2 pl-3 pr-9 text-left text-gray-900 focus:bg-indigo-600 focus:text-white focus:outline-none"
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

                  <div className="-my-1 flex justify-center">
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
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition active:bg-slate-200 active:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Swap from and to"
                    >
                      <SwapIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div
                    className={`relative min-w-0 ${scheduleError ? "opacity-60" : !trainSelected ? "opacity-75" : ""}`}
                  >
                    <label
                      htmlFor="to-station-input"
                      className="text-medium mb-1.5 block font-semibold text-gray-900"
                    >
                      To
                    </label>
                    <div className="relative">
                      {!trainSelected && (
                        <button
                          type="button"
                          className="absolute inset-0 z-[5] cursor-pointer rounded-md bg-transparent"
                          aria-label="Select a train before choosing To station"
                          onClick={promptSelectTrainFirst}
                        />
                      )}
                      <div className="grid min-h-[38px] w-full cursor-text grid-cols-1 rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-sm text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 disabled:pointer-events-none">
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
                          className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent text-inherit outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-90"
                          autoComplete="off"
                        />
                        <span className="pointer-events-none col-start-1 row-start-1 self-center justify-self-end pr-2">
                          <ChevronUpDownIcon className="size-5 text-gray-500" />
                        </span>
                      </div>
                    </div>
                    {!scheduleError && trainSelected && (
                      <div
                        id="to-dropdown"
                        className={`absolute left-0 right-0 top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 shadow-lg outline outline-1 outline-black/5 ${toDropdownOpen ? "" : "hidden"}`}
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
                                    className="relative block w-full cursor-default select-none py-2 pl-3 pr-9 text-left text-gray-900 focus:bg-indigo-600 focus:text-white focus:outline-none"
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
                      className="text-medium mb-1.5 block font-semibold text-gray-900"
                    >
                      Departure Date
                    </label>
                    <div
                      className={`grid min-h-[38px] w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-sm text-gray-900 outline outline-1 -outline-offset-1 ${
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
                        className="col-start-1 row-start-1 w-full min-w-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-inherit outline-none focus:outline-none focus:ring-0"
                      >
                        {dateOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none col-start-1 row-start-1 self-center justify-self-end pr-2">
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
                    className="min-h-[48px] w-full rounded-xl bg-blue-600 py-4 text-base font-semibold text-white transition active:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="mb-4 mt-8"
            aria-labelledby={
              formAlertMessage ? undefined : "how-it-works-heading"
            }
            aria-label={formAlertMessage ? "Search form notice" : undefined}
          >
            {formAlertMessage ? (
              <div
                role="alert"
                className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-700"
              >
                {formAlertMessage}
              </div>
            ) : (
              <>
                <h2
                  id="how-it-works-heading"
                  className="mb-4 text-center text-base font-semibold text-slate-800"
                >
                  How it works
                </h2>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Previous step"
                    onClick={() => scrollHowItWorksCarousel(-1)}
                    className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-50 md:hidden"
                  >
                    <ChevronLeftIcon className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next step"
                    onClick={() => scrollHowItWorksCarousel(1)}
                    className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-50 md:hidden"
                  >
                    <ChevronRightIcon className="size-5" />
                  </button>
                  <div
                    ref={howItWorksCarouselRef}
                    onScroll={updateHowItWorksSlideFromScroll}
                    className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-10 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
                  >
                    {HOW_IT_WORKS_STEPS.map((item) => (
                      <div
                        key={item.step}
                        data-how-step
                        className="flex min-w-[min(100%,calc(100vw-5.25rem))] shrink-0 snap-center flex-col items-center rounded-xl border border-slate-100 bg-white px-4 py-5 text-center shadow-sm md:min-w-0"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                          {item.step}
                        </div>
                        <h3 className="mb-1 text-sm font-medium text-slate-800">
                          {item.title}
                        </h3>
                        <p className="text-pretty text-sm text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className="mt-3 flex justify-center gap-1.5 md:hidden"
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

        {loading && !checkResult && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <SearchLoaderTrainTrack />
            <p className="text-left text-lg font-bold leading-snug text-slate-900 sm:text-xl">
              {service2StreamLine || "Finding you the best possible seats…"}
            </p>
          </div>
        )}

        {checkResult &&
          !loading &&
          (!showChartPendingMonitor || chartPendingModalDismissed) && (
            <section className="mt-6 rounded-2xl bg-slate-100/60 px-0 py-4">
              {uiPayload?.chartStatus ? (
                <div className="rounded-2xl border border-amber-200/90 bg-white p-4 shadow-md">
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <p className="text-xl font-bold text-amber-900">
                      {uiPayload.chartStatus.kind === "not_prepared_yet"
                        ? uiPayload.chartStatus.message
                        : uiPayload.chartStatus.kind === "irctc_unavailable"
                          ? uiPayload.chartStatus.message
                          : uiPayload.chartStatus.error}
                    </p>
                    {uiPayload.chartStatus.kind === "irctc_unavailable" &&
                      uiPayload.chartStatus.detail && (
                        <p className="mt-2 text-sm leading-snug text-amber-800/95">
                          {uiPayload.chartStatus.detail}
                        </p>
                      )}
                    {showChartPendingMonitor && (
                      <p className="mt-2 text-sm font-medium text-amber-800">
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
                          className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition active:bg-amber-700"
                        >
                          Get Ticket Alert
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : checkResult?.status === "failed" || apiError ? (
                <div className="rounded-2xl border border-red-200/80 bg-white p-4 shadow-md">
                  <div className="flex min-h-[44px] items-center rounded-xl border border-red-100 bg-red-50/80 px-4 py-4">
                    <p className="text-sm font-medium text-red-800">
                      {SERVICE2_NO_TICKETS_AVAILABLE_COPY}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4">
                    <h2 className="text-base font-bold text-slate-900">
                      {trainNumber} {uiPayload?.composition?.trainName ?? ""}
                    </h2>
                  </div>
                  <div className="p-4">
                    <div className="rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-red-800">
                        No tickets found between these stations
                      </p>
                      <p className="mt-1 text-sm text-red-700/90">
                        Try a different date, train, or route.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

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
                className="text-lg font-bold leading-snug text-slate-900"
              >
                Train does not run on this date
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
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
                className="relative flex max-h-[min(92dvh,100dvh)] w-full max-w-full flex-col overflow-hidden rounded-none border-y border-amber-200/90 bg-white shadow-2xl sm:max-h-[min(90dvh,40rem)] sm:rounded-2xl sm:border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-100 bg-amber-50/95 px-4 py-3">
                  <h2
                    id="chart-pending-modal-title"
                    className="text-lg font-bold leading-snug text-amber-900"
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
                    className="shrink-0 rounded-lg p-1.5 text-amber-800 transition hover:bg-amber-100/80"
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
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  <p className="text-sm font-medium text-amber-900/90">
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
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                    />
                    <label className="block text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={monitorEmail}
                      onChange={(e) => setMonitorEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
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
                    className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {monitorSubmitting ? "Getting alert…" : "Get Ticket Alert"}
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
                className="relative flex max-h-[min(92dvh,100dvh)] w-full max-w-full flex-col overflow-hidden rounded-none border-y border-emerald-200/90 bg-white shadow-2xl sm:max-h-[min(90dvh,36rem)] sm:rounded-2xl sm:border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-emerald-100 bg-emerald-50/95 px-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
                      All set
                    </p>
                    <h2
                      id="monitoring-started-title"
                      className="mt-1 text-xl font-bold leading-snug text-emerald-950"
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
                    className="shrink-0 rounded-lg p-1.5 text-emerald-800 transition hover:bg-emerald-100/80"
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
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 text-base leading-relaxed text-slate-700">
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
                  <ul className="list-inside list-disc space-y-2 text-slate-700">
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
                  <p className="border-t border-slate-100 pt-1 text-sm text-slate-500">
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
      </main>
    </div>
  );
}
