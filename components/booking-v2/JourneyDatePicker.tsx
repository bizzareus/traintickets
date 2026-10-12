"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import moment from "moment";
import {
  getAdvanceReservationWindow,
  getJourneyDateError,
} from "@/lib/advanceReservation";

type DatepickerInstance = {
  destroy: () => void;
  setOptions: (options: Record<string, unknown>) => void;
  setDate: (
    d: Date | string | number | null,
    options?: { autohide?: boolean; clear?: boolean },
  ) => unknown;
};

function syncPickerValue(
  dp: DatepickerInstance,
  value: string | null,
  restricted: boolean,
) {
  const date = moment(value ?? "", "YYYY-MM-DD", true);
  const valid = date.isValid() && (!restricted || !getJourneyDateError(value!));
  dp.setDate(valid ? date.toDate() : null, { clear: !valid, autohide: false });
}

export type JourneyDatePickerProps = {
  id: string;
  value: string | null;
  onChange: (ymd: string) => void;
  /** Days relative to today for the earliest selectable date (e.g. -1 allows yesterday). Default 0 (today). */
  minOffsetDays?: number;
  /** Limit ticket searches to the currently open 60-day reservation window. */
  restrictToBookingWindow?: boolean;
  /** Override the trigger input styling (defaults to the large search-field style). */
  inputClassName?: string;
  /** Optional class name for the datepicker container. */
  className?: string;
};

/**
 * Flowbite / Tailwind datepicker (flowbite-datepicker) for journey YYYY-MM-DD state.
 */
export function JourneyDatePicker({
  id,
  value,
  onChange,
  minOffsetDays = 0,
  restrictToBookingWindow = false,
  inputClassName,
  className,
}: JourneyDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dpRef = useRef<DatepickerInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;

    const onPick = (ev: Event) => {
      const ce = ev as CustomEvent<{ date?: Date }>;
      const d = ce.detail?.date;
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        const ymd = moment(d).format("YYYY-MM-DD");
        if (restrictToBookingWindow && getJourneyDateError(ymd)) return;
        if (ymd !== valueRef.current) onChangeRef.current(ymd);
        // Input value is already refreshed by the picker using `format` (e.g. "Friday, Apr 03").
      }
    };

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshLimits = () => {
      const now = new Date();
      const range = getAdvanceReservationWindow(now);
      dpRef.current?.setOptions({
        minDate: moment(range.minDate, "YYYY-MM-DD", true)
          .add(minOffsetDays, "days")
          .toDate(),
        maxDate: restrictToBookingWindow
          ? moment(range.maxDate, "YYYY-MM-DD", true).toDate()
          : null,
      });
      if (dpRef.current)
        syncPickerValue(
          dpRef.current,
          valueRef.current,
          restrictToBookingWindow,
        );
      clearTimeout(refreshTimer);
      if (restrictToBookingWindow)
        refreshTimer = setTimeout(
          refreshLimits,
          range.refreshAt - now.getTime(),
        );
    };

    void import("flowbite-datepicker/Datepicker").then(
      ({ default: Datepicker }) => {
        if (cancelled || !inputRef.current) return;
        const el = inputRef.current;
        const dp = new Datepicker(el, {
          autohide: true,
          format: "DD, M dd",
          orientation: "bottom",
          todayHighlight: true,
          container: `#dp-container-${id}`,
        }) as DatepickerInstance;
        dpRef.current = dp;
        refreshLimits();
        el.addEventListener("changeDate", onPick);
        el.addEventListener("focus", refreshLimits);
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      inputEl.removeEventListener("changeDate", onPick);
      inputEl.removeEventListener("focus", refreshLimits);
      dpRef.current?.destroy();
      dpRef.current = null;
    };
    // Picker owns the input; callback read via ref.
  }, [id, minOffsetDays, restrictToBookingWindow]);

  useEffect(() => {
    const dp = dpRef.current;
    if (!dp) return;
    syncPickerValue(dp, value, restrictToBookingWindow);
  }, [value, restrictToBookingWindow]);

  return (
    <div
      id={`dp-container-${id}`}
      className={cn(
        "relative",
        className,
        // Tailwind arbitrary variants to style the injected datepicker internal cells
        "[&_.datepicker-cell.disabled]:pointer-events-none [&_.datepicker-cell.disabled]:cursor-not-allowed [&_.datepicker-cell.disabled]:text-gray-300 [&_.datepicker-cell.disabled]:opacity-50",
        "[&_.datepicker-cell.prev]:text-gray-300 [&_.datepicker-cell.prev]:opacity-40",
        "[&_.datepicker-cell.next]:text-gray-300 [&_.datepicker-cell.next]:opacity-40",
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        readOnly
        className={cn(
          "cursor-pointer",
          inputClassName ??
            "block w-full rounded-md border border-gray-300 bg-gray-50 py-3.5 pl-3 pr-2 text-lg font-semibold text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 sm:py-4 sm:pl-4",
        )}
        placeholder="Select date"
        title={
          restrictToBookingWindow
            ? "Advance booking opens 60 days before travel at 8:00 AM IST."
            : undefined
        }
        aria-haspopup="dialog"
        autoComplete="off"
      />
    </div>
  );
}
