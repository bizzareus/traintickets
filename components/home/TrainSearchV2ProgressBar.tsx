"use client";

import { useMemo } from "react";

interface TrainSearchV2ProgressBarProps {
  totalTrains: number;
  scannedCount: number;
  totalToScan: number;
  directAvailableCount: number;
  splitSeatsFoundCount: number;
  isLoading: boolean;
}

export function TrainSearchV2ProgressBar({
  totalTrains,
  scannedCount,
  totalToScan,
  directAvailableCount,
  splitSeatsFoundCount,
  isLoading,
}: TrainSearchV2ProgressBarProps) {
  const percentComplete = useMemo(() => {
    if (totalToScan === 0) return 100;
    const p = Math.round((scannedCount / totalToScan) * 100);
    return Math.min(100, Math.max(15, p));
  }, [scannedCount, totalToScan]);

  const totalSeatsDiscovered = directAvailableCount + splitSeatsFoundCount;

  if (totalTrains === 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Top Status Header - Clean White Background */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-3.5 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-2.5">
          {isLoading && (
            <div className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent sm:mt-0" />
          )}
          <p className="text-xs font-semibold text-slate-800 sm:text-sm">
            {isLoading
              ? "Finding alternate seat options for recommended train..."
              : `Found ${totalSeatsDiscovered} train${totalSeatsDiscovered === 1 ? "" : "s"} with confirmed options`}
          </p>
        </div>

        {/* Badges / Metrics */}
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {directAvailableCount > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:px-2.5 sm:py-1 sm:text-xs">
              <span>✓</span> {directAvailableCount} Direct Available
            </span>
          )}
        </div>
      </div>

      {/* Animated Progress Line */}
      {isLoading && (
        <div className="h-1 w-full overflow-hidden bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      )}
    </div>
  );
}
