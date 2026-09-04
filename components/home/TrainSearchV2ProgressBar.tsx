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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          {isLoading && (
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          )}
          <p className="text-sm font-semibold text-slate-800">
            {isLoading
              ? `Scanning all seat combinations across ${totalTrains} trains...`
              : `Found ${totalSeatsDiscovered} train${totalSeatsDiscovered === 1 ? "" : "s"} with confirmed options`}
          </p>
        </div>

        {/* Badges / Metrics */}
        <div className="flex items-center gap-2 text-xs">
          {directAvailableCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 border border-emerald-200">
              <span>✓</span> {directAvailableCount} Direct Available
            </span>
          )}
        </div>
      </div>

      {/* Animated Progress Line */}
      {isLoading && (
        <div className="h-1 w-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      )}
    </div>
  );
}
