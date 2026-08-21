"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";
import { trackAlertRequested } from "@/lib/analytics/track";

interface Props {
  trainNumber: string;
  trainName?: string;
  trainStartDate?: string;
  journeyDate: string;
  classCode: string;
  defaultOrigin: string;
  defaultDestination: string;
  originChartTime: string;
}

export function EntireJourneyAlertCTA({
  trainNumber,
  trainName,
  trainStartDate,
  journeyDate,
  classCode,
  defaultOrigin,
  defaultDestination,
  originChartTime,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const subscribe = async () => {
    const em = email.trim();
    const mob = mobile.trim();

    if (!em && !mob) {
      setError("Please enter an email or mobile number.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: defaultOrigin,
        toStationCode: defaultDestination,
        journeyDate: journeyDate.trim(),
        classCode: classCode.trim().toUpperCase(),
        stationCodesToMonitor: [defaultOrigin],
        email: em || undefined,
        mobile: mob || undefined,
        trainStartDate: trainStartDate,
      });
      setSuccess(true);
      trackAlertRequested({
        success: true,
        source: "search_entire_journey",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: defaultOrigin,
        toCode: defaultDestination,
        journeyDate: journeyDate.trim(),
        classCode: classCode.trim().toUpperCase(),
        hasEmail: Boolean(em),
        hasMobile: Boolean(mob),
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.errors?.[0]?.message ||
        err?.response?.data?.message ||
        "Failed to set up alert. Please check your inputs.";
      const errMsg = typeof msg === "string" ? msg : JSON.stringify(msg);
      setError(errMsg);
      trackAlertRequested({
        success: false,
        source: "search_entire_journey",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: defaultOrigin,
        toCode: defaultDestination,
        journeyDate: journeyDate.trim(),
        classCode: classCode.trim().toUpperCase(),
        hasEmail: Boolean(em),
        hasMobile: Boolean(mob),
        error: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mt-2 w-full rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
        <p className="text-xs font-semibold text-emerald-900">
          Success! We've set up an alert for the entire journey.
        </p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="mt-4 bg-white shadow-sm ring-1 ring-gray-900/5 rounded-xl">
        <div className="px-4 py-5 sm:p-6">
          <div className="sm:flex sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Entire Journey Chart Alert</h3>
              <div className="mt-1 max-w-xl text-sm text-gray-500">
                <p>Waitlisted? We'll alert you at {originChartTime}</p>
              </div>
            </div>
            <div className="mt-4 sm:ml-6 sm:mt-0 sm:flex sm:shrink-0 sm:items-center">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
              >
                Get Ticket Alert
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full rounded-md border border-blue-200 bg-blue-50 p-2.5">
      <p className="mb-1.5 text-xs font-semibold text-blue-900">
        Get notified when new seats open at {originChartTime} on Entire Journey route
      </p>
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <input
          type="email"
          className="w-full rounded border border-blue-200 bg-emerald-50 px-2 py-1 text-xs placeholder:text-gray-400"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="tel"
          className="w-full rounded border border-blue-200 bg-emerald-50 px-2 py-1 text-xs placeholder:text-gray-400"
          placeholder="Mobile (optional)"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={subscribe}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Setting up…" : "Set alert"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
        <span className="text-[10px] italic text-blue-700/80">
          Triggers at {originChartTime}
        </span>
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
