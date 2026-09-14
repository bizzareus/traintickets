"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import {
  fetchChartAlertPaymentStatus,
  redirectToPayment,
} from "@/lib/chart-alert-payments";
import {
  trackAlertRequested,
  trackAnalyticsEvent,
} from "@/lib/analytics/track";

export interface ChartAlertPaymentModalJourney {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
}

interface ChartAlertPaymentModalProps {
  open: boolean;
  onClose: () => void;
  payUrl: string;
  paymentRef: string;
  journey: ChartAlertPaymentModalJourney;
}

type ModalStatus = "paying" | "paid" | "failed";

const POLL_INTERVAL_MS = 3000;

/**
 * In-page Muzobox checkout: the hosted payment page loads in an iframe so
 * the user never leaves LastBerth. While open, this polls our backend status
 * endpoint (which re-verifies server-to-server with Muzobox and queues the
 * alert on first paid sighting). UPI app-switch flows that need a top-level
 * page can use the "open in new tab" fallback.
 */
export function ChartAlertPaymentModal({
  open,
  onClose,
  payUrl,
  paymentRef,
  journey,
}: ChartAlertPaymentModalProps) {
  const [status, setStatus] = useState<ModalStatus>("paying");
  const trackedRef = useRef(false);

  const check = useCallback(async () => {
    if (!paymentRef) return;
    try {
      const res = await fetchChartAlertPaymentStatus(paymentRef);
      if (res.status === "paid" && res.journeyCreated) {
        setStatus("paid");
        if (!trackedRef.current) {
          trackedRef.current = true;
          trackAlertRequested({
            success: true,
            source: "chart_alert_payment",
            trainNumber: journey.trainNumber,
            trainName: journey.trainName,
            fromCode: journey.fromStationCode,
            toCode: journey.toStationCode,
            journeyDate: journey.journeyDate,
            classCode: journey.classCode,
          });
          trackAnalyticsEvent({
            name: "chart_alert_payment_complete",
            properties: {},
          });
        }
      } else if (res.status === "failed") {
        setStatus("failed");
      }
      // paid-but-not-queued and pending both keep polling; the next check
      // retries fulfilment server-side.
    } catch {
      // Transient — keep polling; the user can close or retry via new tab.
    }
  }, [paymentRef, journey]);

  useEffect(() => {
    if (!open) return;
    setStatus("paying");
    trackedRef.current = false;
    const t = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [open, paymentRef, check]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Complete payment"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <BellRing className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold leading-tight text-slate-900">
                {status === "paid"
                  ? "Alert subscribed!"
                  : "Complete your payment"}
              </h3>
              <p className="text-xs font-medium text-slate-500">
                {journey.trainNumber}
                {journey.trainName ? ` · ${journey.trainName}` : ""} ·{" "}
                {journey.fromStationCode} · {journey.journeyDate.slice(0, 10)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "paid" ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="mt-3 text-sm text-slate-600">
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
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        ) : status === "failed" ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <XCircle className="h-12 w-12 text-red-500" />
            <p className="mt-3 text-sm text-slate-600">
              Your payment did not go through and no alert was created. Please
              close and try again, or pay in a new tab below.
            </p>
            <button
              type="button"
              onClick={() => redirectToPayment(payUrl)}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Retry payment
            </button>
          </div>
        ) : (
          <>
            <div className="relative min-h-[420px] flex-1 bg-slate-50">
              <iframe
                key={paymentRef}
                src={payUrl}
                title="Secure payment"
                className="absolute inset-0 h-full w-full border-0"
                allow="payment; clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                Waiting for payment confirmation…
              </p>
              <button
                type="button"
                onClick={() => redirectToPayment(payUrl)}
                className="shrink-0 text-xs font-semibold text-blue-700 hover:underline"
              >
                Open in new tab
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
