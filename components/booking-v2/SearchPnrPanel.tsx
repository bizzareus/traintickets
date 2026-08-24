"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import { EntireJourneyAlertCTA } from "@/components/booking-v2/EntireJourneyAlertCTA";
import { StationChartingStatus } from "@/components/booking-v2/StationChartingStatus";
import { AlternatePathContent } from "@/components/booking-v2/AlternatePathContent";
import { TrainScheduleBottomSheet } from "@/components/booking-v2/TrainScheduleBottomSheet";
import { useAlternatePaths } from "@/components/booking-v2/useAlternatePaths";
import type {
  PnrPassengerStatus,
  PnrStatusResponse,
  TrainListItem,
} from "@/components/booking-v2/alternatePathsTypes";

const IS_TICKET_ALERT_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_TICKET_ALERT_CTA === "true";

interface SearchPnrPanelProps {
  className?: string;
}

/**
 * Self-contained "Search PNR" experience: PNR input + lookup, the live PNR
 * status card, confirmation prediction, and the shared alternate-paths engine
 * rendered inline below the result. Used by both the homepage PNR tab and the
 * standalone `/pnr-status` page.
 */
export function SearchPnrPanel({ className }: SearchPnrPanelProps) {
  const [pnr, setPnr] = useState("");
  const [pnrLoading, setPnrLoading] = useState(false);
  const [pnrError, setPnrError] = useState<string | null>(null);
  const [pnrData, setPnrData] = useState<PnrStatusResponse["data"] | null>(
    null,
  );
  const [journeyDate, setJourneyDate] = useState<string | null>(null);
  const [pnrForCta, setPnrForCta] = useState<string>("");
  const [isLiveChartPrepared, setIsLiveChartPrepared] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [chartAlertOpen, setChartAlertOpen] = useState(false);
  const chartAlertShownForPnr = useRef<string | null>(null);

  // Schedule modal (opened from within AlternatePathContent leg cards)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleTrainNumber, setScheduleTrainNumber] = useState("");
  const [scheduleHighlightFrom, setScheduleHighlightFrom] = useState("");
  const [scheduleHighlightTo, setScheduleHighlightTo] = useState("");

  const alt = useAlternatePaths();

  useEffect(() => {
    try {
      setIsAdminUser(window.localStorage.getItem("admin") === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const originChartTime = useMemo(() => {
    if (!pnrData?.DepartureTime || !pnrData?.Doj)
      return "4 hours before departure";
    try {
      const parsed = moment(
        `${pnrData.Doj} ${pnrData.DepartureTime}`,
        "DD-MM-YYYY HH:mm",
      );
      if (!parsed.isValid()) return "4 hours before departure";

      parsed.subtract(4, "hours");
      return parsed.format("ddd, MMM D [at] h:mm A");
    } catch {
      return "4 hours before departure";
    }
  }, [pnrData]);

  const isChartLikelyPrepared = useMemo(() => {
    if (!pnrData?.DepartureTime || !pnrData?.Doj) return false;
    try {
      const parsed = moment(
        `${pnrData.Doj} ${pnrData.DepartureTime}`,
        "DD-MM-YYYY HH:mm",
      );
      if (!parsed.isValid()) return false;

      parsed.subtract(4, "hours");
      return moment().isAfter(parsed);
    } catch {
      return false;
    }
  }, [pnrData]);

  const effectiveChartPrepared = isLiveChartPrepared || isChartLikelyPrepared;

  /** PNR Doj is DD-MM-YYYY; the journey/alert APIs expect YYYY-MM-DD. */
  const journeyDateYmd = useMemo(() => {
    const parts = (pnrData?.Doj ?? "").split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }, [pnrData]);

  /** True when any passenger is still waitlisted/RAC (not confirmed). */
  const hasWaitlisted = useMemo(() => {
    const passengers = pnrData?.PassengerStatus;
    if (!passengers?.length) return false;
    return passengers.some((p) => {
      const cur = (p.CurrentStatus ?? "").toUpperCase();
      const confirmed = cur.includes("CNF") || p.ConfirmTktStatus === "Confirm";
      return !confirmed;
    });
  }, [pnrData]);

  // Proactively prompt waitlisted users (once per PNR) to subscribe to chart
  // alerts — the chart isn't prepared yet, so quota seats are still to be
  // released and we can notify them when new seats open up for booking.
  useEffect(() => {
    if (
      pnrData &&
      hasWaitlisted &&
      !effectiveChartPrepared &&
      chartAlertShownForPnr.current !== pnrData.Pnr
    ) {
      chartAlertShownForPnr.current = pnrData.Pnr;
      setChartAlertOpen(true);
    }
  }, [pnrData, hasWaitlisted, effectiveChartPrepared]);

  const handlePnrSearch = useCallback(async () => {
    const trimmed = pnr.trim();
    if (!trimmed || trimmed.length !== 10 || !/^\d+$/.test(trimmed)) {
      setPnrError("PNR must be a 10-digit number.");
      setPnrForCta("");
      return;
    }
    setPnrLoading(true);
    setPnrError(null);
    setPnrData(null);
    setPnrForCta("");
    setChartAlertOpen(false);

    try {
      const response = await apiClient.get<PnrStatusResponse>(
        `/api/booking-v2/pnr/${trimmed}`,
      );
      const res = response.data;
      if (!res.status || !res.data) {
        const customMsg = "There is an issue with railways server we are not able to figure out the status";
        setPnrError(customMsg);
        setPnrForCta(trimmed);
        trackAnalyticsEvent({
          name: "search_pnr_status_checked",
          properties: { success: false, error: res.message || "No data" },
        });
        return;
      }

      const data = res.data;
      setPnrData(data);
      trackAnalyticsEvent({
        name: "search_pnr_status_checked",
        properties: { success: true },
      });

      // Parse and sync journey date
      let parsedDate = journeyDate;
      if (data.Doj) {
        const parts = data.Doj.split("-");
        if (parts.length === 3) {
          const ymd = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          setJourneyDate(ymd);
          parsedDate = ymd;
        }
      }

      // Construct Mock TrainListItem
      const mockTrain: TrainListItem = {
        trainNumber: data.TrainNo,
        trainName: data.TrainName || "Train",
        departureTime: data.DepartureTime || "",
        arrivalTime: data.ArrivalTime || "",
        fromStnCode: data.From,
        toStnCode: data.To,
        avlClasses: undefined,
        trainStartDate: data.Doj
          ? (() => {
              const parts = data.Doj.split("-");
              return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            })()
          : undefined,
      };

      // Call Alternate Seats finder
      if (parsedDate) {
        void alt.findAlternates(mockTrain, undefined, parsedDate);
      }
    } catch (err: unknown) {
      const customMsg = "There is an issue with railways server we are not able to figure out the status";
      let origMsg = "Failed to fetch PNR status.";
      if (err && typeof err === "object" && "response" in err) {
        const ax = err as { response?: { data?: { message?: string } } };
        if (ax.response?.data?.message) {
          origMsg = ax.response.data.message;
        }
      } else if (err instanceof Error) {
        origMsg = err.message;
      }
      setPnrError(customMsg);
      setPnrForCta(trimmed);
      trackAnalyticsEvent({
        name: "search_pnr_status_checked",
        properties: { success: false, error: origMsg },
      });
    } finally {
      setPnrLoading(false);
    }
  }, [pnr, alt, journeyDate]);

  return (
    <form
      {...({
        toolname: "check_pnr_status",
        tooldescription: "Check live 10-digit Indian Railways PNR status, seat allotment, and waiting list confirmation probability.",
      } as Record<string, unknown>)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pnrLoading && pnr.length === 10) void handlePnrSearch();
      }}
      className={className}
    >
      <div className="flex flex-col overflow-visible rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-3">
        <div className="flex-1 min-w-0">
          <label
            htmlFor="pnrInput"
            className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-blue-600 sm:h-4 sm:w-4"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
              />
            </svg>
            Enter 10-Digit PNR Number
          </label>
          <input
            type="text"
            id="pnrInput"
            name="pnr"
            {...({
              toolparamdescription: "10-digit PNR number printed on Indian Railways ticket",
            } as Record<string, unknown>)}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Enter 10-Digit PNR Number"
            value={pnr}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= 10) setPnr(val);
            }}
            placeholder="e.g. 4335734389"
            className="w-full border-0 p-0 text-base font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 sm:text-lg"
          />
        </div>
        <div className="mt-3 flex items-stretch sm:mt-0">
          <button
            type="submit"
            disabled={pnrLoading || pnr.length !== 10}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3.5 text-center text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/35 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:text-base"
          >
            {pnrLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Checking PNR
              </span>
            ) : (
              "Find Alternate Tickets"
            )}
          </button>
        </div>
      </div>

      {pnrError && (
        <div
          className="mt-6 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm animate-fade-in"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z" />
            </svg>
            <span>{pnrError}</span>
          </div>
          {pnrForCta && (
            <div className="pl-8">
              <a
                href={`https://www.confirmtkt.com/pnr-status/${pnrForCta}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25 transition-all duration-200"
              >
                Go to ConfirmTkt for PNR Analysis
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          )}
        </div>
      )}

      {/* PNR Details Card */}
      {pnrData && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in">
          <div className="bg-slate-900 px-4 py-3 text-white flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-blue-600 px-2 py-0.5 text-xs font-black uppercase tracking-wider">
                PNR
              </span>
              <span className="text-sm font-bold tracking-wider font-mono">
                {pnrData.Pnr}
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-300">
              Quota:{" "}
              <span className="text-white font-bold">{pnrData.Quota}</span> |
              Class:{" "}
              <span className="text-white font-bold">{pnrData.Class}</span>
            </div>
          </div>
          {IS_TICKET_ALERT_ENABLED && (
            <div className="bg-blue-50 border-b border-blue-100 p-3">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-sm transition flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                Get Ticket Alert (Chart expected at {originChartTime})
              </button>
            </div>
          )}
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 sm:text-lg flex items-center gap-2">
                  <span className="text-blue-600 font-extrabold">
                    {pnrData.TrainNo}
                  </span>
                  <span>{pnrData.TrainName}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Departing on{" "}
                  <span className="font-semibold text-slate-700">
                    {pnrData.Doj}
                  </span>
                  <StationChartingStatus
                    trainNumber={pnrData.TrainNo}
                    journeyDate={pnrData.Doj}
                    stationCode={pnrData.From}
                    onStatusFetched={setIsLiveChartPrepared}
                  />
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm font-medium">
                <div className="text-right">
                  <span className="block font-black text-slate-900 tracking-wide">
                    {pnrData.From}
                  </span>
                  <span className="text-xs text-slate-500">
                    {pnrData.BoardingStationName ||
                      pnrData.SourceName ||
                      "Origin"}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center min-w-[64px]">
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                    Direct
                  </span>
                  <div className="h-0.5 w-full bg-slate-200 relative my-1">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                  </div>
                  {pnrData.Duration && (
                    <span className="text-[10px] text-slate-500">
                      {pnrData.Duration}
                    </span>
                  )}
                </div>
                <div>
                  <span className="block font-black text-slate-900 tracking-wide">
                    {pnrData.To}
                  </span>
                  <span className="text-xs text-slate-500">
                    {pnrData.ReservationUptoName ||
                      pnrData.DestinationName ||
                      "Destination"}
                  </span>
                </div>
              </div>
            </div>

            {pnrData.PassengerStatus &&
              pnrData.PassengerStatus.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Passenger Seat Status
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {pnrData.PassengerStatus.map(
                      (passenger: PnrPassengerStatus) => (
                        <div
                          key={passenger.Number}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs shadow-2xs"
                        >
                          <span className="font-semibold text-slate-600">
                            Passenger {passenger.Number}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {passenger.BookingStatus && (
                              <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-medium text-slate-700">
                                Bkg: {passenger.BookingStatus}
                              </span>
                            )}
                            <span
                              className={`rounded px-1.5 py-0.5 font-bold ${
                                passenger.CurrentStatus === "CNF" ||
                                passenger.ConfirmTktStatus === "Confirm"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-amber-100 text-amber-800 border border-amber-200"
                              }`}
                            >
                              Cur: {passenger.CurrentStatus}
                            </span>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

            {/* Alternate tickets (full width) */}
            {(alt.altResult ||
              alt.altError ||
              (alt.altLoading && alt.altForTrain)) && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <div className="rounded-2xl border border-blue-100 bg-white shadow-sm relative flex flex-col max-h-[80vh] sm:max-h-[600px] overflow-hidden">
                  <AlternatePathContent
                    altForTrain={alt.altForTrain}
                    altTrainName={alt.altTrainName}
                    altAvlClasses={alt.altAvlClasses}
                    altLoading={alt.altLoading}
                    altResult={alt.altResult}
                    altError={alt.altError}
                    altProgress={alt.altProgress}
                    journeyDate={journeyDate}
                    fromCode={pnrData?.From}
                    toCode={pnrData?.To}
                    ctaTrainNumber={pnrData?.TrainNo}
                    ctaTrainName={pnrData?.TrainName}
                    ctaTrainStartDate={journeyDateYmd}
                    ctaJourneyDate={journeyDateYmd}
                    ctaClassCode={pnrData?.Class}
                    originChartTime={originChartTime}
                    isAdminUser={isAdminUser}
                    onClose={alt.reset}
                    onOpenSchedule={(trainNumber, from, to) => {
                      setScheduleTrainNumber(trainNumber);
                      setScheduleHighlightFrom(from);
                      setScheduleHighlightTo(to);
                      setScheduleModalOpen(true);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chart-alert subscribe popup for waitlisted PNRs */}
      {chartAlertOpen && pnrData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
          role="presentation"
          onClick={() => setChartAlertOpen(false)}
        >
          <div
            className="w-full max-h-[90vh] overflow-y-auto bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chartAlertTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </span>
                <h3
                  id="chartAlertTitle"
                  className="text-base font-bold text-slate-900"
                >
                  Get notified when seats open up
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setChartAlertOpen(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              Your ticket is still on the waiting list. When the reservation
              chart is prepared (around{" "}
              <span className="font-semibold text-slate-800">
                {originChartTime}
              </span>
              ), Indian Railways releases unused quota seats for booking.
              Subscribe to chart alerts and we&apos;ll notify you the moment new
              seats become available, so you can book a confirmed ticket.
            </p>

            <EntireJourneyAlertCTA
              trainNumber={pnrData.TrainNo}
              trainName={pnrData.TrainName}
              trainStartDate={journeyDateYmd}
              journeyDate={journeyDateYmd}
              classCode={pnrData.Class || "SL"}
              defaultOrigin={pnrData.From}
              defaultDestination={pnrData.To}
              originChartTime={originChartTime}
            />
          </div>
        </div>
      )}

      <TrainScheduleBottomSheet
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        trainNumber={scheduleTrainNumber}
        highlightFrom={scheduleHighlightFrom}
        highlightTo={scheduleHighlightTo}
      />
      </form>
  );
}
