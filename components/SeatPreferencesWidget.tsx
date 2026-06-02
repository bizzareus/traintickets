"use client";

import React, { useState } from "react";

type SeatPreferencesWidgetProps = {
  preferredBerths: string[];
  setPreferredBerths: (berths: string[]) => void;
  minAdjacentBerths: number;
  setMinAdjacentBerths: (count: number) => void;
  notifyOnlyOnMatch: boolean;
  setNotifyOnlyOnMatch: (notify: boolean) => void;
};

const BERTH_OPTIONS = [
  { value: "LB", label: "Lower (LB)" },
  { value: "MB", label: "Middle (MB)" },
  { value: "UB", label: "Upper (UB)" },
  { value: "SL", label: "Side Lower (SL)" },
  { value: "SU", label: "Side Upper (SU)" },
  { value: "SM", label: "Side Middle (SM)" },
];

export function SeatPreferencesWidget({
  preferredBerths,
  setPreferredBerths,
  minAdjacentBerths,
  setMinAdjacentBerths,
  notifyOnlyOnMatch,
  setNotifyOnlyOnMatch,
}: SeatPreferencesWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleBerth = (value: string) => {
    if (preferredBerths.includes(value)) {
      setPreferredBerths(preferredBerths.filter((b) => b !== value));
    } else {
      setPreferredBerths([...preferredBerths, value]);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none"
      >
        <span className="flex items-center gap-2">
          <span>✨</span> Seat & Berth Preferences
          {preferredBerths.length > 0 || minAdjacentBerths > 1 || notifyOnlyOnMatch ? (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
              Active
            </span>
          ) : (
            <span className="text-[11px] font-normal text-slate-500">(Optional)</span>
          )}
        </span>
        <span className={`transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 p-3 space-y-4">
          {/* Preferred Berth Types */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Preferred Berth Types
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {BERTH_OPTIONS.map((opt) => {
                const selected = preferredBerths.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleBerth(opt.value)}
                    className={`rounded px-2 py-1.5 text-xs font-medium border text-center transition-all ${
                      selected
                        ? "bg-blue-50 border-blue-400 text-blue-700 font-bold shadow-sm"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Min Adjacent Berths */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                Adjacent Berths
              </label>
              <p className="text-[11px] text-slate-500">
                Minimum berths in the same 8-seat bay
              </p>
            </div>
            <select
              value={minAdjacentBerths}
              onChange={(e) => setMinAdjacentBerths(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <option key={num} value={num}>
                  {num} Berth{num > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Notify Only on Match */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                Strict Alerts Match
              </label>
              <p className="text-[11px] text-slate-500">
                Only send WhatsApp/Call alerts on exact seat preferences matches
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnlyOnMatch}
                onChange={(e) => setNotifyOnlyOnMatch(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
