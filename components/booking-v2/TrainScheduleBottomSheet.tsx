"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, RotateCw, TrainFront, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTimeAmPm } from "./alternatePathHelpers";
import type { TrainScheduleResponse } from "./alternatePathsTypes";

type ScheduleProps = {
  onClose: () => void;
  trainNumber: string;
  highlightFrom: string;
  highlightTo: string;
};

export function TrainScheduleBottomSheet({
  open,
  ...props
}: ScheduleProps & { open: boolean }) {
  return open ? <TrainScheduleDialog key={props.trainNumber} {...props} /> : null;
}

function TrainScheduleDialog({
  onClose,
  trainNumber,
  highlightFrom,
  highlightTo,
}: ScheduleProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boardingStationRef = useRef<HTMLTableRowElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [{ schedule, loading, error }, setState] = useState<{
    schedule: TrainScheduleResponse | null;
    loading: boolean;
    error: boolean;
  }>({ schedule: null, loading: true, error: false });

  const stationList = schedule?.stationList ?? [];
  const from = highlightFrom.trim().toUpperCase();
  const to = highlightTo.trim().toUpperCase();
  const fromIdx = stationList.findIndex(
    (station) => station.stationCode.toUpperCase() === from,
  );
  const toIdx = stationList.findIndex(
    (station) => station.stationCode.toUpperCase() === to,
  );
  const hasSelection = fromIdx >= 0 && toIdx >= fromIdx;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const wasScrollLocked = document.body.classList.contains("overflow-hidden");
    dialog.showModal();
    document.body.classList.add("overflow-hidden");
    return () => {
      dialog.close();
      if (!wasScrollLocked) document.body.classList.remove("overflow-hidden");
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<TrainScheduleResponse>(
        `/api/booking-v2/trains/schedule/${encodeURIComponent(trainNumber)}`,
        { signal: controller.signal },
      )
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setState({ schedule: data, loading: false, error: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ schedule: null, loading: false, error: true });
        }
      });
    return () => controller.abort();
  }, [trainNumber, attempt]);

  useEffect(() => {
    if (hasSelection) {
      boardingStationRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [schedule, fromIdx, hasSelection]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-hidden rounded-t-2xl border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px] sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:w-[calc(100%_-_2rem)] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-slate-200"
    >
      <div className="flex max-h-[90dvh] flex-col sm:max-h-[85dvh]">
        <div
          aria-hidden="true"
          className="flex shrink-0 justify-center pt-2 sm:hidden"
        >
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <TrainFront aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
              >
                Train schedule
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                <span className="font-semibold tabular-nums text-slate-700">
                  {trainNumber}
                </span>
                {schedule?.trainName && <> · {schedule.trainName}</>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close train schedule"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:bg-slate-200"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        {!loading && hasSelection && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <span className="text-xs font-medium text-slate-500">
              Your journey
            </span>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {stationList[fromIdx].stationCode}
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
              {stationList[toIdx].stationCode}
            </p>
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          aria-busy={loading}
        >
          {loading && (
            <div
              role="status"
              className="flex min-h-64 flex-col items-center justify-center gap-3 p-6"
            >
              <span
                aria-hidden="true"
                className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 motion-reduce:animate-none"
              />
              <p className="text-sm text-slate-500">Loading train schedule…</p>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"
            >
              <p className="text-sm font-semibold text-slate-900">
                Schedule unavailable
              </p>
              <p className="max-w-xs text-sm leading-relaxed text-slate-500">
                We couldn’t load this train’s schedule. Please try again.
              </p>
              <button
                type="button"
                onClick={() => {
                  setState({ schedule: null, loading: true, error: false });
                  setAttempt((current) => current + 1);
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:bg-blue-800"
              >
                <RotateCw aria-hidden="true" className="h-4 w-4" />
                Try again
              </button>
            </div>
          )}
          {!loading && !error && stationList.length === 0 && (
            <div
              role="status"
              className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <TrainFront
                aria-hidden="true"
                className="mb-1 h-6 w-6 text-slate-400"
              />
              <p className="text-sm font-semibold text-slate-900">
                No schedule available
              </p>
              <p className="text-sm text-slate-500">
                Station timings haven’t been published for this train yet.
              </p>
            </div>
          )}
          {!loading && !error && stationList.length > 0 && (
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">
                Station timetable for train {trainNumber}. All times are in IST.
              </caption>
              <thead className="sticky top-0 z-10 bg-white text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th
                    scope="col"
                    className="py-3 pl-4 text-left font-medium sm:pl-6"
                  >
                    Station
                  </th>
                  <th
                    scope="col"
                    className="w-20 px-1 py-3 text-right font-medium sm:w-28"
                  >
                    Arrival
                  </th>
                  <th
                    scope="col"
                    className="w-24 py-3 pl-1 pr-4 text-right font-medium sm:w-32 sm:pr-6"
                  >
                    Departure
                  </th>
                </tr>
              </thead>
              <tbody>
                {stationList.map((station, idx) => {
                  const highlighted =
                    hasSelection && idx >= fromIdx && idx <= toIdx;
                  const isBoarding = hasSelection && idx === fromIdx;
                  const isAlighting = hasSelection && idx === toIdx;
                  return (
                    <tr
                      key={`${station.stationCode}-${idx}`}
                      ref={isBoarding ? boardingStationRef : null}
                      className={cn(
                        "scroll-mt-12 border-b border-slate-100 last:border-0",
                        (isBoarding || isAlighting) && "bg-blue-50/60",
                      )}
                    >
                      <th
                        scope="row"
                        className="relative py-4 pl-10 pr-2 text-left font-normal sm:pl-12"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-4 flex w-3 flex-col items-center sm:left-6"
                        >
                          <span
                            className={cn(
                              "w-px flex-1",
                              idx > 0 &&
                                (highlighted && idx > fromIdx
                                  ? "bg-blue-500"
                                  : "bg-slate-200"),
                            )}
                          />
                          <span
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full border-2",
                              highlighted
                                ? "border-blue-600 bg-blue-600"
                                : "border-slate-300 bg-white",
                              (isBoarding || isAlighting) &&
                                "ring-4 ring-blue-100",
                            )}
                          />
                          <span
                            className={cn(
                              "w-px flex-1",
                              idx < stationList.length - 1 &&
                                (highlighted && idx < toIdx
                                  ? "bg-blue-500"
                                  : "bg-slate-200"),
                            )}
                          />
                        </span>
                        <p
                          className={cn(
                            "break-words text-[13px] font-semibold leading-snug sm:text-sm",
                            isBoarding || isAlighting
                              ? "text-blue-700"
                              : "text-slate-800",
                          )}
                        >
                          {station.stationName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
                          <span className="font-medium">
                            {station.stationCode}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Day {station.dayCount ?? 1}</span>
                          {(isBoarding || isAlighting) && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-700">
                              {isBoarding ? "Boarding" : "Alighting"}
                            </span>
                          )}
                        </div>
                      </th>
                      <td className="px-1 py-4 text-right text-xs font-medium tabular-nums text-slate-700 sm:text-sm">
                        {idx === 0
                          ? "—"
                          : formatTimeAmPm(station.arrivalTime) || "—"}
                      </td>
                      <td className="py-4 pl-1 pr-4 text-right text-xs font-semibold tabular-nums text-slate-900 sm:pr-6 sm:text-sm">
                        {idx === stationList.length - 1
                          ? "—"
                          : formatTimeAmPm(station.departureTime) || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] text-slate-500 sm:px-6">
          <span>
            {!loading && !error
              ? `${stationList.length} stations`
              : "Train timetable"}
          </span>
          <span>All times in IST · Days counted from origin</span>
        </footer>
      </div>
    </dialog>
  );
}
