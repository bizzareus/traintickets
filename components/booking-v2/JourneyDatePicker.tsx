"use client";

import { useEffect, useRef } from "react";

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  dateLabel: string;
};

/**
 * Flowbite / Tailwind datepicker (flowbite-datepicker) for journey YYYY-MM-DD state.
 */
export function JourneyDatePicker({ id, value, onChange, dateLabel }: JourneyDatePickerProps) {
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
        const ymd = dateToYmd(d);
        onChangeRef.current(ymd);
        if (inputRef.current) inputRef.current.value = ymd;
      }
    };

    let cancelled = false;

    void import("flowbite-datepicker/Datepicker").then(({ default: Datepicker }) => {
      if (cancelled || !inputRef.current) return;
      const el = inputRef.current;
      const dp = new Datepicker(el, {
        autohide: true,
        format: "yyyy-mm-dd",
        orientation: "bottom",
        todayHighlight: true,
      }) as DatepickerInstance;
      dpRef.current = dp;
      el.addEventListener("changeDate", onPick);
      const v = valueRef.current;
      if (v && YMD_RE.test(v)) {
        dp.setDate(v);
        el.value = v;
      }
    });

    return () => {
      cancelled = true;
      inputEl.removeEventListener("changeDate", onPick);
      dpRef.current?.destroy();
      dpRef.current = null;
    };
    // Intentionally once: picker owns the input; callback read via ref.
  }, []);

  useEffect(() => {
    const dp = dpRef.current;
    if (!dp || !value || !YMD_RE.test(value)) return;
    dp.setDate(value, { autohide: false });
    if (inputRef.current) inputRef.current.value = value;
  }, [value]);

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          readOnly
          className="block w-full cursor-pointer rounded-md border border-gray-300 bg-gray-50 py-1.5 pl-2 pr-2 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25"
          placeholder="Select date"
          aria-haspopup="dialog"
          autoComplete="off"
        />
      </div>
      <p className="mt-1 line-clamp-1 text-[11px] font-medium leading-tight text-gray-500 sm:text-xs">
        {dateLabel}
      </p>
    </>
  );
}
