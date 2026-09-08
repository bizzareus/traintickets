"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import type { StationRow } from "@/lib/stationCacheClient";

export function todayYmd(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function StationFieldSimple(props: {
  label: string;
  placeholder: string;
  query: string;
  onUserType: (q: string) => void;
  value: StationRow | null;
  onSelect: (s: StationRow) => void;
  suggestions: StationRow[];
  loading: boolean;
  pendingDebounce: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suggestError: string | null;
  className?: string;
  compact?: boolean;
}) {
  const {
    label,
    placeholder,
    query,
    onUserType,
    value,
    onSelect,
    suggestions,
    loading,
    pendingDebounce,
    open,
    onOpenChange,
    suggestError,
    className,
    compact = false,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onOpenChange]);

  const showList = open && query.length >= 2;
  const displayText =
    value && !open ? `${value.stationCode} - ${value.stationName}` : query;
  const showLoading = loading || pendingDebounce;

  return (
    <div
      ref={wrapRef}
      className={cn(
        compact
          ? "relative flex h-full min-w-0 flex-1 flex-col justify-center px-1 py-0"
          : "relative min-w-0 flex-1 border-b border-gray-200 px-3 py-2.5 sm:border-b-0 sm:border-r sm:py-2",
        showList && "z-[55]",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className={cn(
          "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500",
            compact && "mb-0 text-[9px] leading-3",
        )}
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
            d="M8 3.1V7a4 4 0 0 0 8 0V3.1"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 15-1-1" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 1-1" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8 19-2 3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m16 19 2 3" />
        </svg>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          name={
            label.toLowerCase().includes("from") ? "fromStation" : "toStation"
          }
          aria-label={label}
          type="text"
          className={cn(
            "block w-full rounded-md border border-gray-300 bg-gray-50 py-3.5 pl-3 pr-8 text-lg font-medium text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 sm:py-4 sm:pl-4 touch-manipulation",
            compact && "h-6 border-0 bg-transparent py-0 pl-0 pr-4 text-sm focus:border-0 focus:ring-0 sm:py-0 sm:pl-0",
          )}
          placeholder={placeholder}
          value={displayText}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-controls={showList ? `${inputId}-listbox` : undefined}
          onChange={(e) => {
            onUserType(e.target.value);
            onOpenChange(true);
          }}
          onFocus={() => onOpenChange(true)}
        />
        <span
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-gray-400"
          aria-hidden
        >
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>
      {showList && (
        <ul
          id={`${inputId}-listbox`}
          className="absolute inset-x-0 top-full z-[60] mt-1 max-h-56 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg sm:min-w-[min(100%,18rem)]"
          role="listbox"
        >
          {showLoading && (
            <li className="px-4 py-3 text-sm text-gray-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                Loading stations…
              </span>
            </li>
          )}
          {!showLoading && suggestError && (
            <li className="px-4 py-3 text-sm text-red-700">{suggestError}</li>
          )}
          {!showLoading && !suggestError && suggestions.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">
              No stations match. Try another spelling.
            </li>
          )}
          {suggestions.map((s) => (
            <li key={`${s.stationCode}-${s.stationName}`} role="option">
              <button
                type="button"
                className="block w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none touch-manipulation"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s);
                  onOpenChange(false);
                }}
              >
                <span className="font-semibold text-gray-900">
                  {s.stationCode}
                </span>
                <span className="text-gray-600"> — {s.stationName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
