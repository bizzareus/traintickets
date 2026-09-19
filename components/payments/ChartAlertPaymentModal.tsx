"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import {
  fetchChartAlertPaymentStatus,
  verifyChartAlertBrowserPayment,
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
 * Checkout.js-based payment modal for chart alerts:
 * - Shows the single-use UPI QR
 * - Provides a "Pay Now" button that opens Razorpay Checkout.js overlay
 * - Verifies payment via server-side signature verification
 * - Polls backend for payment status until completion
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
  const checkoutScriptLoaded = useRef(false);
  const razorpayInstanceRef = useRef<any>(null);

  // Load Razorpay Checkout.js script once
  useEffect(() => {
    if (typeof window === "undefined" || checkoutScriptLoaded.current) return;
    checkoutScriptLoaded.current = true;
    
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      // Script loaded successfully
    };
    script.onerror = () => {
      console.error("Failed to load Razorpay Checkout.js");
      setStatus("failed");
    };
    document.body.appendChild(script);
    
    return () => {
      document.body.removeChild(script);
      checkoutScriptLoaded.current = false;
    };
  }, []);

  const startCheckout = useCallback(() => {
    if (typeof window === "undefined" || !(window as any).Razorpay) {
      console.error("Razorpay Checkout.js not loaded");
      setStatus("failed");
      return;
    }

    // Initialize Razorpay Checkout
    const options = {
      key: payment.keyId,
      amount: payment.amount * 100, // amount in paise
      currency: "INR",
      name: "LastBerth",
      description: `Chart alert ${journey.trainNumber}`,
      order_id: payment.orderId,
      handler: function (response: any) {
        // Payment successful - verify with backend
        verifyChartAlertBrowserPayment({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        })
          .then((result) => {
            if (result.status === "paid") {
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
            } else {
              setStatus("failed");
            }
          })
          .catch((error) => {
            console.error("Payment verification failed:", error);
            setStatus("failed");
          });
      },
      modal: {
        ondismiss: () => {
          // User closed the modal - keep polling for payment status
          // (payment might still be processing)
        },
      },
      prefill: {
        name: "Passenger",
        email: journey.trainName || undefined,
        contact: journey.trainNumber || undefined, // This is not ideal but we don't have contact in journey
      },
      theme: {
        color: "#3b82f6", // blue-500
      },
    };
    
    razorpayInstanceRef.current = new (window as any).Razorpay(options);
    razorpayInstanceRef.current.open();
  }, [payment, journey, onPaid]);

  const checkPaymentStatus = useCallback(async () => {
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
      // Transient error - keep polling; the user can close and retry.
    }
  }, [paymentRef, journey, onPaid]);

  // Start payment flow when modal opens
  useEffect(() => {
    if (!open) return;
    setStatus("paying");
    trackedRef.current = false;
    failedTrackedRef.current = false;
    
    // Start polling for payment status
    const statusCheckInterval = setInterval(() => {
      void checkPaymentStatus();
    }, POLL_INTERVAL_MS);
    
    // Initialize Checkout.js (will open the modal)
    void startCheckout();
    
    return () => {
      clearInterval(statusCheckInterval);
      // Close Razorpay modal if open
      if (razorpayInstanceRef.current && typeof razorpayInstanceRef.current.close === "function") {
        try {
          razorpayInstanceRef.current.close();
        } catch (e) {
          // Ignore errors on close
        }
      }
    };
  }, [open, checkPaymentStatus, startCheckout]);

  // Close modal on Escape key
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
              {/* UPI QR code */}
              <img
                src={payment.qrImageUrl}
                alt={`UPI QR code to pay ₹${payment.amount}`}
                className="mt-3 h-52 w-52 rounded-xl border border-slate-200 bg-white p-2"
              />
              <p className="mt-2 text-center text-xs text-slate-500">
                Scan the QR, or pay directly from your phone:
              </p>
              <div className="mt-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                {/* Primary CTA: Checkout.js button */}
                <button
                  type="button"
                  onClick={startCheckout}
                  className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                >
                  Pay Now with UPI
                </button>
                <p className="mt-1 text-center text-xs text-slate-500">
                  (Opens secure UPI payment screen)
                </p>
              </div>
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