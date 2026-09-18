"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import {
  fetchChartAlertPaymentStatus,
  type ChartAlertPaymentLink,
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
  payment: ChartAlertPaymentLink;
  paymentRef: string;
  journey: ChartAlertPaymentModalJourney;
  source: "page" | "row" | "search_panel";
  onPaid?: (journey: ChartAlertPaymentModalJourney) => void;
}

type ModalStatus = "paying" | "paid" | "failed";

const POLL_INTERVAL_MS = 3000;

/**
 * Own-checkout for chart alerts: renders the single-use UPI QR plus
 * per-app intent CTAs (Google Pay / PhonePe / any UPI app) instead of an
 * externally hosted payment page. While open, polls our backend status
 * endpoint (which re-verifies server-to-server with Razorpay and queues
 * the alert on first paid sighting).
 */
export function ChartAlertPaymentModal({
  open,
  onClose,
  payment,
  paymentRef,
  journey,
  source,
  onPaid,
}: ChartAlertPaymentModalProps) {
  const [status, setStatus] = useState<ModalStatus>("paying");
  const trackedRef = useRef(false);
  const failedTrackedRef = useRef(false);

  const check = useCallback(async () => {
    if (!paymentRef) return;
    try {
      const res = await fetchChartAlertPaymentStatus(paymentRef);
      if (res.status === "paid" && res.journeyCreated) {
        setStatus("paid");
        if (!trackedRef.current) {
          trackedRef.current = true;
          onPaid?.(journey);
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
        if (!failedTrackedRef.current) {
          failedTrackedRef.current = true;
          trackAnalyticsEvent({
            name: "chart_alert_payment_failed",
            properties: { place: "modal", train_number: journey.trainNumber },
          });
        }
      }
      // paid-but-not-queued and pending both keep polling; the next check
      // retries fulfilment server-side.
    } catch {
      // Transient — keep polling; the user can close and retry.
    }
  }, [paymentRef, journey, onPaid]);

  useEffect(() => {
    if (!open) return;
    setStatus("paying");
    trackedRef.current = false;
    failedTrackedRef.current = false;
    trackAnalyticsEvent({
      name: "chart_alert_payment_modal_opened",
      properties: { source, train_number: journey.trainNumber },
    });
    const t = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [open, paymentRef, check, source, journey.trainNumber]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const appButtons = [
    payment.gpayIntent
      ? { label: "Google Pay", href: payment.gpayIntent }
      : null,
    payment.phonepeIntent
      ? { label: "PhonePe", href: payment.phonepeIntent }
      : null,
    payment.upiIntent ? { label: "UPI App", href: payment.upiIntent } : null,
  ].filter((b): b is { label: string; href: string } => b !== null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Complete payment"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
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
              close and try again.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pay ₹{payment.amount} with any UPI app
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={payment.qrImageUrl}
                alt={`UPI QR code to pay ₹${payment.amount}`}
                className="mt-3 h-52 w-52 rounded-xl border border-slate-200 bg-white p-2"
              />
              <p className="mt-2 text-center text-xs text-slate-500">
                Scan the QR, or pay directly from your phone:
              </p>
              <div className="mt-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                {appButtons.map((b) => (
                  <a
                    key={b.label}
                    href={b.href}
                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                  >
                    {b.label}
                  </a>
                ))}
              </div>
              {appButtons.length === 0 && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Open your UPI app and scan the QR above to pay.
                </p>
              )}
              <p className="mt-3 hidden text-center text-xs text-slate-400 sm:block">
                On desktop? Scan the QR with your phone&apos;s camera or any
                UPI app.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-5 py-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                Waiting for payment confirmation…
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
