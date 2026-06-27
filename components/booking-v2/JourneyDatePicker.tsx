"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar date from YYYY-MM-DD (avoids UTC parse shifting the day). */
function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type DatepickerInstance = {
  destroy: () => void;
  setDate: (d: Date | string | number | null, options?: { autohide?: boolean }) => unknown;
};

export type JourneyDatePickerProps = {
  id: string;
  value: string | null;
  onChange: (ymd: string) => void;
  /** Days relative to today for the earliest selectable date (e.g. -1 allows yesterday). Default 0 (today). */
  minOffsetDays?: number;
  /** Override the trigger input styling (defaults to the large search-field style). */
  inputClassName?: string;
};

/**
 * Flowbite / Tailwind datepicker (flowbite-datepicker) for journey YYYY-MM-DD state.
 */
export function JourneyDatePicker({
  id,
  value,
  onChange,
  minOffsetDays = 0,
  inputClassName,
}: JourneyDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dpRef = useRef<DatepickerInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;

    const onPick = (ev: Event) => {
      const ce = ev as CustomEvent<{ date?: Date }>;
      const d = ce.detail?.date;
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        onChangeRef.current(dateToYmd(d));
        // Input value is already refreshed by the picker using `format` (e.g. "Friday, Apr 03").
      }
    };

    let cancelled = false;

    void import("flowbite-datepicker/Datepicker").then(({ default: Datepicker }) => {
      if (cancelled || !inputRef.current) return;
      const el = inputRef.current;
      const istToday = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
      );
      istToday.setHours(0, 0, 0, 0);
      const minDate = new Date(istToday);
      minDate.setDate(minDate.getDate() + minOffsetDays);

      const dp = new Datepicker(el, {
        autohide: true,
        format: "DD, M dd",
        orientation: "bottom",
        todayHighlight: true,
        minDate,
        container: `#dp-container-${id}`,
      }) as DatepickerInstance;
      dpRef.current = dp;
      el.addEventListener("changeDate", onPick);
      const v = valueRef.current;
      if (v && YMD_RE.test(v)) {
        dp.setDate(ymdToLocalDate(v));
      }
    });

    return () => {
      cancelled = true;
      inputEl.removeEventListener("changeDate", onPick);
      dpRef.current?.destroy();
      dpRef.current = null;
    };
    // Intentionally once per id/min: picker owns the input; callback read via ref.
  }, [id, minOffsetDays]);

  useEffect(() => {
    const dp = dpRef.current;
    if (!dp || !value || !YMD_RE.test(value)) return;
    dp.setDate(ymdToLocalDate(value), { autohide: false });
  }, [value]);

  return (
    <div 
      id={`dp-container-${id}`} 
      className={cn(
        "relative",
        // Tailwind arbitrary variants to style the injected datepicker internal cells
        "[&_.datepicker-cell.disabled]:text-gray-300 [&_.datepicker-cell.disabled]:opacity-50 [&_.datepicker-cell.disabled]:cursor-not-allowed [&_.datepicker-cell.disabled]:pointer-events-none",
        "[&_.datepicker-cell.prev]:text-gray-300 [&_.datepicker-cell.prev]:opacity-40",
        "[&_.datepicker-cell.next]:text-gray-300 [&_.datepicker-cell.next]:opacity-40"
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
        aria-haspopup="dialog"
        autoComplete="off"
      />
    </div>
  );
}
