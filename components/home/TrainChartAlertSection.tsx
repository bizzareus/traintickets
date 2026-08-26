"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, ShieldCheck, Sparkles, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { trackAlertRequested, trackAnalyticsEvent } from "@/lib/analytics/track";
import { useChartAlertPricingExperiment } from "@/lib/hooks/useChartAlertPricingExperiment";

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
  const { isPaidVariant, variant } = useChartAlertPricingExperiment();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("3A");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPaidStep, setShowPaidStep] = useState(false);

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
    setSuccess(false);
    setShowPaidStep(false);
    trackAnalyticsEvent({
      name: "chart_alert_opened",
      properties: {
        source: "search_panel",
        train_number: trainNumber,
        from_code: fromCode,
        to_code: toCode,
        journey_date: journeyDate || "",
        variant,
      },
    });
  };

  const executeSubscription = async (em: string, mob: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await apiClient.post("/api/availability/journey", {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: fromCode.trim().toUpperCase(),
        toStationCode: toCode.trim().toUpperCase(),
        journeyDate: journeyDate?.trim().slice(0, 10),
        classCode: selectedClass.trim().toUpperCase(),
        stationCodesToMonitor: [fromCode.trim().toUpperCase()],
        email: em || undefined,
        mobile: mob || undefined,
      });

      setSuccess(true);
      trackAlertRequested({
        success: true,
        source: "search_panel",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: fromCode.trim().toUpperCase(),
        toCode: toCode.trim().toUpperCase(),
        journeyDate: journeyDate?.trim().slice(0, 10) || "",
        classCode: selectedClass.trim().toUpperCase(),
        hasEmail: Boolean(em),
        hasMobile: Boolean(mob),
      });
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { message?: string; errors?: Array<{ message?: string }> } };
      };
      const msg =
        e?.response?.data?.errors?.[0]?.message ||
        e?.response?.data?.message ||
        "Could not set up chart alert. Please check your inputs and try again.";
      const errMsg = typeof msg === "string" ? msg : JSON.stringify(msg);
      setError(errMsg);
      trackAlertRequested({
        success: false,
        source: "search_panel",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: fromCode.trim().toUpperCase(),
        toCode: toCode.trim().toUpperCase(),
        journeyDate: journeyDate?.trim().slice(0, 10) || "",
        classCode: selectedClass.trim().toUpperCase(),
        hasEmail: Boolean(em),
        hasMobile: Boolean(mob),
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

    if (!em && !mob) {
      setError("Please enter your email or mobile number so we can notify you.");
      return;
    }

    if (!journeyDate?.trim()) {
      setError("Journey date is missing. Please select a valid date.");
      return;
    }

    // In paid variant, the first click reveals the fake-door refund banner and ₹5 CTA
    if (isPaidVariant && !showPaidStep) {
      setError(null);
      setShowPaidStep(true);
      trackAnalyticsEvent({
        name: "chart_alert_paid_step_shown",
        properties: {
          train_number: trainNumber.trim(),
          from_code: fromCode.trim().toUpperCase(),
          to_code: toCode.trim().toUpperCase(),
          journey_date: journeyDate.trim().slice(0, 10),
          class_code: selectedClass.trim().toUpperCase(),
          price: 5,
          has_email: Boolean(em),
          has_mobile: Boolean(mob),
        },
      });
      return;
    }

    // If in paid variant and user clicks "Pay ₹5 & Subscribe to Alert", track the conversion event
    if (isPaidVariant && showPaidStep) {
      trackAnalyticsEvent({
        name: "chart_alert_paid_cta_clicked",
        properties: {
          train_number: trainNumber.trim(),
          from_code: fromCode.trim().toUpperCase(),
          to_code: toCode.trim().toUpperCase(),
          journey_date: journeyDate.trim().slice(0, 10),
          class_code: selectedClass.trim().toUpperCase(),
          price: 5,
          has_email: Boolean(em),
          has_mobile: Boolean(mob),
        },
      });
    }

    await executeSubscription(em, mob);
  };

  return (
    <>
      {/* Right Side Vertical Alert Box on Train Card */}
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
            {!isPaidVariant && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100/70 px-1.5 py-0.2 text-[9px] font-bold text-blue-700">
                <Sparkles className="h-2.5 w-2.5 text-blue-600" />
                Free
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Get notified on WhatsApp or Email when chart is prepared & vacant seats open on this train.
          </p>
        </div>

        <div className="mt-3.5">
          <button
            type="button"
            onClick={handleOpenModal}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-600 hover:border-blue-600 hover:text-white focus:outline-none focus:ring-4 focus:ring-blue-500/20 active:scale-[0.98] transition-all"
          >
            <BellRing className="h-3.5 w-3.5" />
            Subscribe to Alert
          </button>
        </div>
      </div>

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

            {/* Modal Body */}
            {success ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h4 className="mt-3 text-base font-bold text-slate-900">
                  Alert Subscribed Successfully!
                </h4>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  We&apos;ll monitor <strong className="text-slate-800">{trainNumber}</strong> from{" "}
                  <strong className="text-slate-800">{fromCode}</strong> to{" "}
                  <strong className="text-slate-800">{toCode}</strong> and immediately alert you
                  via WhatsApp/Email when the chart is prepared.
                </p>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25"
                >
                  Done
                </button>
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

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700">
                    {error}
                  </p>
                )}

                {showPaidStep && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-900 font-extrabold text-xs mt-0.5">
                        ₹
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-900 text-xs tracking-tight">
                            Alert Activation: <span className="text-amber-950 font-extrabold text-sm">₹5</span>
                          </p>
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            100% Refundable
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-700">
                          <strong>Money-Back Guarantee:</strong> If confirmed tickets or vacant seats are not found when chart is prepared, your <strong>₹5 will be refunded back to you</strong> automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60 transition"
                  >
                    {loading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Setting up alert…
                      </>
                    ) : showPaidStep ? (
                      <>
                        <ShieldCheck className="h-4 w-4 text-emerald-300" />
                        Pay ₹5 &amp; Subscribe to Alert
                      </>
                    ) : (
                      <>
                        <BellRing className="h-4 w-4" />
                        Subscribe to Alert
                      </>
                    )}
                  </button>
                  {showPaidStep && (
                    <p className="mt-1.5 text-center text-[10px] font-medium text-slate-500">
                      Instant setup · Zero-risk money back guarantee
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
