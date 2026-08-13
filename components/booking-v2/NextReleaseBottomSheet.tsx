"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";
import { formatChartMomentIst, parseChartDateTimeIst } from "./alternatePathHelpers";

export function NextReleaseBottomSheet({
  trainNumber,
  journeyDate,
  stationCode,
  onClose,
}: {
  trainNumber: string;
  journeyDate: string;
  stationCode: string;
  onClose: () => void;
}) {
  const [nextMeta, setNextMeta] = useState<StationChartMetaItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient
      .post<{ stations: StationChartMetaItem[] }>(
        "/api/train-composition/stations-meta",
        {
          trainNumber,
          journeyDate,
          sourceStation: stationCode,
          refreshFromIrctc: false,
        },
      )
      .then((r) => setNextMeta(r.data?.stations?.[0] ?? null))
      .catch(() => setNextMeta(null))
      .finally(() => setLoading(false));
  }, [trainNumber, journeyDate, stationCode]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-12 shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-gray-200" />
        <h3 className="text-xl font-extrabold text-gray-900">
          Next Release Info
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          The next charting event is scheduled for:
        </p>

        <div className="mt-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="mt-4 text-xs font-bold text-blue-600 animate-pulse">
                Fetching next release schedule...
              </p>
            </div>
          ) : nextMeta?.chartOneTime ? (
            <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
              <div className="relative z-10">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500">
                  ESTIMATED CHARTING AT
                </p>
                <div className="mt-2 space-y-2">
                  <p className="text-xl font-black tracking-tight text-indigo-950">
                    {(() => {
                      const ymd = journeyDate.slice(0, 10);
                      const m = parseChartDateTimeIst(
                        ymd,
                        nextMeta.chartOneTime,
                        nextMeta.chartOneDayOffset || 0,
                      );
                      return m
                        ? formatChartMomentIst(m)
                        : nextMeta.chartOneTime;
                    })()}{" "}
                    IST
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-black text-indigo-700">
                      {stationCode}
                    </p>
                  </div>
                </div>
              </div>
              <div className="absolute right-[-20px] top-[-20px] h-32 w-32 rounded-full bg-indigo-500 opacity-5 blur-3xl" />
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
              <p className="text-sm font-medium text-gray-400 italic">
                No specific charting metadata was found for {stationCode}. It
                might follow the same timeline as the previous station.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="bg-indigo-600 hover:bg-indigo-700 mt-8 w-full rounded-2xl px-4 py-4 text-sm font-black text-white shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
        >
          Got it, Close
        </button>
      </div>
    </div>
  );
}
