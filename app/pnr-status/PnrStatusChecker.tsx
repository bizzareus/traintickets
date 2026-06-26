"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import {
  SmartPnrPredictor,
  type PnrStatusData,
} from "@/components/booking-v2/SmartPnrPredictor";

interface PnrStatusResponse {
  status: boolean;
  message?: string;
  data?: PnrStatusData;
}

/** Live PNR status lookup (GET /api/booking-v2/pnr/:pnr) + confirmation prediction. */
export default function PnrStatusChecker() {
  const [pnr, setPnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PnrStatusData | null>(null);

  const check = async () => {
    const trimmed = pnr.trim();
    if (trimmed.length !== 10 || !/^\d+$/.test(trimmed)) {
      setError("PNR must be a 10-digit number.");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await apiClient.get<PnrStatusResponse>(
        `/api/booking-v2/pnr/${trimmed}`,
      );
      if (!res.data?.status || !res.data?.data) {
        const errMsg = res.data?.message || "Couldn't fetch this PNR. Please re-check the number.";
        setError(errMsg);
        trackAnalyticsEvent({
          name: "pnr_status_checked",
          properties: { success: false, error: errMsg },
        });
        return;
      }
      setData(res.data.data);
      trackAnalyticsEvent({
        name: "pnr_status_checked",
        properties: { success: true },
      });
    } catch {
      setError("Couldn't fetch PNR status right now. Please try again in a moment.");
      trackAnalyticsEvent({
        name: "pnr_status_checked",
        properties: { success: false, error: "request_failed" },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          inputMode="numeric"
          value={pnr}
          onChange={(e) => setPnr(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="Enter 10-digit PNR number"
          aria-label="PNR number"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-lg tracking-wide text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check PNR Status"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

      {data && (
        <div className="mt-5">
          <SmartPnrPredictor pnrData={data} />
        </div>
      )}
    </div>
  );
}
