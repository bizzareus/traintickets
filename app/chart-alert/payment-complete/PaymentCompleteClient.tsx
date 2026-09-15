"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BellRing, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { fetchChartAlertPaymentStatus } from "@/lib/chart-alert-payments";
import {
  trackAlertRequested,
  trackAnalyticsEvent,
} from "@/lib/analytics/track";

type Status = "verifying" | "paid" | "pending" | "failed" | "error";

export function PaymentCompleteClient() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? "";
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<{
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode: string;
  } | null>(null);
  const trackedRef = useRef(false);

  const check = useCallback(async () => {
    if (!ref) {
      setStatus("error");
      setError("This payment link is invalid (missing reference).");
      return;
    }
    setStatus((s) => (s === "verifying" ? s : "verifying"));
    setError(null);
    try {
      const res = await fetchChartAlertPaymentStatus(ref);
      setJourney(res.journey);
      // journeyCreated=false means payment landed but alert queueing failed —
      // each status check retries the queue, so keep the user on refresh
      // instead of reporting false success.
      if (res.status === "paid" && !res.journeyCreated) {
        setStatus("pending");
        setError(
          "Payment received — activating your alert. Tap refresh to check again.",
        );
        return;
      }
      if (res.status === "paid") {
        setStatus("paid");
        if (!trackedRef.current) {
          trackedRef.current = true;
          trackAlertRequested({
            success: true,
            source: "chart_alert_payment",
            trainNumber: res.journey?.trainNumber ?? "",
            trainName: res.journey?.trainName ?? undefined,
            fromCode: res.journey?.fromStationCode ?? "",
            toCode: res.journey?.toStationCode ?? "",
            journeyDate: res.journey?.journeyDate ?? "",
            classCode: res.journey?.classCode ?? "",
          });
          trackAnalyticsEvent({
            name: "chart_alert_payment_complete",
            properties: {},
          });
        }
      } else if (res.status === "failed") {
        setStatus("failed");
        trackAnalyticsEvent({
          name: "chart_alert_payment_failed",
          properties: {
            place: "page",
            train_number: res.journey?.trainNumber,
          },
        });
      } else {
        setStatus("pending");
      }
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not verify payment.",
      );
    }
  }, [ref]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-10">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {status === "verifying" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">
              Confirming your payment…
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Please wait while we verify your payment and activate your chart
              alert.
            </p>
          </>
        )}

        {status === "paid" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">
              Alert subscribed!
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {journey ? (
                <>
                  We&apos;ll notify you when the chart for{" "}
                  <strong className="text-slate-800">
                    {journey.trainName ?? journey.trainNumber} (
                    {journey.trainNumber})
                  </strong>{" "}
                  is prepared at{" "}
                  <strong className="text-slate-800">
                    {journey.fromStationCode}
                  </strong>{" "}
                  on{" "}
                  <strong className="text-slate-800">
                    {journey.journeyDate.slice(0, 10)}
                  </strong>
                  .
                </>
              ) : (
                "Your chart alert is now active."
              )}
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Back to home
            </Link>
          </>
        )}

        {status === "pending" && (
          <>
            <BellRing className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">
              Payment not confirmed yet
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {error ??
                "If you just paid, confirmation can take a few seconds. Tap refresh to check again."}
            </p>
            <button
              type="button"
              onClick={() => void check()}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Refresh status
            </button>
          </>
        )}

        {(status === "failed" || status === "error") && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">
              {status === "failed" ? "Payment failed" : "Something went wrong"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {error ??
                "Your payment did not go through. No alert was created — please try subscribing again."}
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
