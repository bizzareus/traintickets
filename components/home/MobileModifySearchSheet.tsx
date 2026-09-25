"use client";

import { useEffect, useId, useMemo } from "react";
import { ArrowUpDown, Calendar, X } from "lucide-react";
import { JourneyDatePicker } from "@/components/booking-v2/JourneyDatePicker";
import { TrainClassMultiSelect } from "@/components/home/TrainClassMultiSelect";
import {
  StationFieldSimple,
  todayYmd,
} from "@/components/home/StationFieldSimple";
import type { StationRow } from "@/lib/stationCacheClient";
import type { HomeStrings } from "@/lib/home/home-langs";

function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** "Fri, 30 Oct" — parsed at noon to avoid TZ day-shift. */
export function formatShortDate(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(y, m - 1, d, 12));
}

type StationFieldProps = {
  query: string;
  onUserType: (q: string) => void;
  value: StationRow | null;
  onSelect: (s: StationRow) => void;
  suggestions: StationRow[];
  loading: boolean;
  pending: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suggestError: string | null;
};

type Props = {
  onClose: () => void;
  from: StationFieldProps;
  to: StationFieldProps;
  onSwap: () => void;
  journeyDate: string | null;
  onDateChange: (ymd: string) => void;
  selectedClasses?: string[];
  onSelectedClassesChange?: (classes: string[]) => void;
  searchLoading: boolean;
  onSearch: () => void;
  form: HomeStrings["form"];
};

/**
 * Mobile "Modify your search" bottom sheet: stacked From/To rows with swap,
 * date row with Today/Tomorrow/Day After chips, train class selector, and search CTA.
 * Rendered only on mobile entry points; Trap: Escape closes, backdrop closes.
 */
export function MobileModifySearchSheet({
  onClose,
  from,
  to,
  onSwap,
  journeyDate,
  onDateChange,
  selectedClasses = [],
  onSelectedClassesChange,
  searchLoading,
  onSearch,
  form,
}: Props) {
  const dateInputId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const chips = useMemo(() => {
    const today = todayYmd();
    return [
      { label: "Today", ymd: today },
      { label: "Tomorrow", ymd: addDaysYmd(today, 1) },
      { label: "Day After", ymd: addDaysYmd(today, 2) },
    ];
  }, []);

  const renderStationField = (field: StationFieldProps, label: string) => (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
      <StationFieldSimple
        label={label}
        placeholder={form.stationPlaceholder}
        query={field.query}
        onUserType={field.onUserType}
        value={field.value}
        onSelect={field.onSelect}
        suggestions={field.suggestions}
        loading={field.loading}
        pendingDebounce={field.pending}
        open={field.open}
        onOpenChange={field.onOpenChange}
        suggestError={field.suggestError}
        className="border-0"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Modify your search"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-slate-900">
            Modify your search
          </h2>
        </div>

        {renderStationField(from, form.from)}

        <div className="relative h-0">
          <button
            type="button"
            onClick={onSwap}
            aria-label="Swap origin and destination"
            className="absolute right-4 top-0 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 touch-manipulation"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          {renderStationField(to, form.to)}
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <label
            htmlFor={dateInputId}
            className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-600 sm:h-4 sm:w-4" />
            {form.date}
          </label>
          <div className="relative">
            <JourneyDatePicker
              id={dateInputId}
              value={journeyDate}
              onChange={onDateChange}
              className="z-20"
              inputClassName="block w-full cursor-pointer rounded-md border border-gray-300 bg-gray-50 py-3.5 pl-3 pr-10 text-lg font-medium text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/25 sm:py-4 sm:pl-4 touch-manipulation"
            />
            <Calendar
              className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => onDateChange(c.ymd)}
                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition touch-manipulation text-center ${
                  journeyDate === c.ymd
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-2xs"
                    : "border-gray-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Train Class
          </span>
          <TrainClassMultiSelect
            variant="dropdown"
            selectedClasses={selectedClasses}
            onChange={onSelectedClassesChange ?? (() => {})}
          />
        </div>

        <button
          type="button"
          disabled={searchLoading}
          onClick={onSearch}
          className="mt-3 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
        >
          {searchLoading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              {form.searching}
            </span>
          ) : (
            form.search
          )}
        </button>
      </div>
    </div>
  );
}
