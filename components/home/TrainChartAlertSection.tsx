"use client";

import { useEffect, useState } from "react";
import { BellRing, Sparkles, X } from "lucide-react";
import {
  trackAlertRequested,
  trackAnalyticsEvent,
} from "@/lib/analytics/track";
import { isValidIndianMobile, isValidEmail } from "@/lib/validation";
import { useContactFields } from "@/lib/contact";
import { isAdminUser } from "@/lib/admin";
import {
  CHART_ALERT_PRICE_RUPEES,
  createFreeChartAlert,
  getChartAlertErrorMessage,
  startChartAlertPayment,
} from "@/lib/chart-alert-payments";
import {
  ChartAlertPaymentModal,
  type ChartAlertPaymentModalJourney,
} from "@/components/payments/ChartAlertPaymentModal";
import { ChartAlertSuccessBox } from "@/components/payments/ChartAlertSuccessBox";

const DEFAULT_CLASSES = ["SL", "3E", "3A", "2A", "1A", "CC", "2S"] as const;

interface TrainChartAlertSectionProps {
  trainNumber: string;
  trainName?: string | null;
  fromCode: string;
  toCode: string;
  journeyDate?: string | null;
  avlClasses?: string[];
  className?: string;
}

export function TrainChartAlertSection({
  trainNumber,
  trainName,
  fromCode,
  toCode,
  journeyDate,
  avlClasses,
  className = "",
}: TrainChartAlertSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("3A");
  const { email, setEmail, mobile, setMobile, persistContact } =
    useContactFields();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminFree, setAdminFree] = useState(false);
  useEffect(() => {
    setAdminFree(isAdminUser());
  }, []);
  const [subscribedJourney, setSubscribedJourney] =
    useState<ChartAlertPaymentModalJourney | null>(null);
  const [payment, setPayment] = useState<{
    payUrl: string;
    ref: string;
    journey: ChartAlertPaymentModalJourney;
  } | null>(null);

  const availableClasses =
    avlClasses && avlClasses.length > 0 ? avlClasses : DEFAULT_CLASSES;

  // Initialize selected class to first available class if present
  useEffect(() => {
    if (availableClasses.length > 0) {
      setSelectedClass(availableClasses[0]);
    }
  }, [availableClasses]);

  // Close modal on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const handleOpenModal = () => {
    setModalOpen(true);
    setError(null);
    trackAnalyticsEvent({
      name: "chart_alert_opened",
      properties: {
        source: "search_panel",
        train_number: trainNumber,
        from_code: fromCode,
        to_code: toCode,
        journey_date: journeyDate || "",
      },
    });
  };

  const executeSubscription = async (em: string, mob: string) => {
    setLoading(true);
    setError(null);

    try {
      persistContact();
      const journey: ChartAlertPaymentModalJourney = {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: fromCode.trim().toUpperCase(),
        toStationCode: toCode.trim().toUpperCase(),
        journeyDate: journeyDate?.trim().slice(0, 10) || "",
        classCode: selectedClass.trim().toUpperCase(),
      };
      // Admins (localStorage admin flag) skip the payment popup and create
      // the alert directly; everyone else pays via the in-page iframe modal.
      if (adminFree) {
        await createFreeChartAlert({
          ...journey,
          stationCodesToMonitor: [fromCode.trim().toUpperCase()],
          email: em || undefined,
          mobile: mob || undefined,
        });
        setModalOpen(false);
        setSubscribedJourney(journey);
        trackAlertRequested({
          success: true,
          source: "search_panel",
          trainNumber: journey.trainNumber,
          trainName: journey.trainName,
          fromCode: journey.fromStationCode,
          toCode: journey.toStationCode,
          journeyDate: journey.journeyDate,
          classCode: journey.classCode,
          email: em || undefined,
          mobile: mob || undefined,
        });
        return;
      }
      const link = await startChartAlertPayment(
        {
          ...journey,
          stationCodesToMonitor: [fromCode.trim().toUpperCase()],
          email: em || undefined,
          mobile: mob || undefined,
        },
        "search_panel",
      );
      setModalOpen(false);
      setPayment({ payUrl: link.payUrl, ref: link.ref, journey });
    } catch (err: unknown) {
      const errMsg = getChartAlertErrorMessage(
        err,
        "Could not set up chart alert. Please check your inputs and try again.",
      );
      setError(errMsg);
      trackAnalyticsEvent({
        name: "chart_alert_payment_link_failed",
        properties: {
          source: "search_panel",
          train_number: trainNumber.trim(),
          error: errMsg.slice(0, 200),
        },
      });
      trackAlertRequested({
        success: false,
        source: "search_panel",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: fromCode.trim().toUpperCase(),
        toCode: toCode.trim().toUpperCase(),
        journeyDate: journeyDate?.trim().slice(0, 10) || "",
        classCode: selectedClass.trim().toUpperCase(),
        email: em || undefined,
        mobile: mob || undefined,
        error: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim();
    const mob = mobile.trim();

    if (!em) {
      setError("Please enter your email address so we can notify you.");
      return;
    }

    if (em && !isValidEmail(em)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (mob && !isValidIndianMobile(mob)) {
      setError(
        "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).",
      );
      return;
    }

    if (!journeyDate?.trim()) {
      setError("Journey date is missing. Please select a valid date.");
      return;
    }

    await executeSubscription(em, mob);
  };

  return (
    <>
      {/* Success replaces the fields box once the alert is set up */}
      {subscribedJourney ? (
        <ChartAlertSuccessBox
          journey={subscribedJourney}
          compact
          className={`h-full ${className}`}
        />
      ) : (
        <div
          className={`flex h-full flex-col justify-between rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-slate-50/50 to-white p-3.5 shadow-2xs transition-all hover:border-blue-200 hover:shadow-sm ${className}`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
                <BellRing className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Chart Alert
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100/70 px-1.5 py-0.2 text-[9px] font-bold text-blue-700">
                <Sparkles className="h-2.5 w-2.5 text-blue-600" />₹
                {CHART_ALERT_PRICE_RUPEES}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              We&apos;ll provide you with {fromCode} &lt;&gt; {toCode} new
              tickets that come up when the chart is prepared — with a 100%
              automated refund guarantee if no full ticket is available.
            </p>
          </div>

          <div className="mt-3.5">
            <button
              type="button"
              onClick={handleOpenModal}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-600 hover:border-blue-600 hover:text-white focus:outline-none focus:ring-4 focus:ring-blue-500/20 active:scale-[0.98] transition-all touch-manipulation"
            >
              <BellRing className="h-3.5 w-3.5" />
              Subscribe to Alert
            </button>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4 backdrop-blur-2xs animate-fade-in"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chartAlertModalTitle"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <BellRing className="h-5 w-5" />
                </span>
                <div>
                  <h3
                    id="chartAlertModalTitle"
                    className="text-base font-bold text-slate-900"
                  >
                    Subscribe to Chart Alert
                  </h3>
                  <p className="text-xs font-medium text-slate-500">
                    {trainNumber} {trainName ? `· ${trainName}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body — success replaces fields once alert is set up */}
            {subscribedJourney ? (
              <div className="mt-4">
                <ChartAlertSuccessBox journey={subscribedJourney} compact />
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="alertClassSelect"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
                  >
                    Travel Class
                  </label>
                  <select
                    id="alertClassSelect"
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {availableClasses.map((c) => (
                      <option key={c} value={c}>
                        {c} Class
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="alertEmailInput"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="alertEmailInput"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Mobile number input commented out - taking email only */}
                {/*
                <div>
                  <label
                    htmlFor="alertMobileInput"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
                  >
                    Mobile Number (WhatsApp Alert)
                  </label>
                  <input
                    id="alertMobileInput"
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="10-digit mobile number"
                    autoComplete="tel"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                */}

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700">
                    {error}
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60 transition touch-manipulation"
                  >
                    {loading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {adminFree ? "Setting up…" : "Opening payment…"}
                      </>
                    ) : (
                      <>
                        <BellRing className="h-4 w-4" />
                        {adminFree
                          ? "Set alert free (admin)"
                          : `Pay ₹${CHART_ALERT_PRICE_RUPEES} & subscribe`}
                      </>
                    )}
                  </button>
                  {adminFree && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Admin mode — no charge, the alert is created directly.
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {payment && (
        <ChartAlertPaymentModal
          open
          onClose={() => setPayment(null)}
          payUrl={payment.payUrl}
          paymentRef={payment.ref}
          journey={payment.journey}
          source="search_panel"
          onPaid={(j) => {
            setSubscribedJourney(j);
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
