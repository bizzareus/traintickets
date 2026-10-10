"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import {
  chartAlertClassPriceLabel,
  chartAlertPriceForClass,
  createFreeChartAlert,
  getChartAlertErrorMessage,
  startChartAlertPayment,
  type ChartAlertPaymentLink,
} from "@/lib/chart-alert-payments";
import {
  ChartAlertPaymentModal,
  type ChartAlertPaymentModalJourney,
} from "@/components/payments/ChartAlertPaymentModal";
import { ChartAlertSuccessBox } from "@/components/payments/ChartAlertSuccessBox";
import { ChartAlertDiscountPrice } from "@/components/payments/ChartAlertDiscountPrice";
import { ChartAlertTrustFooter } from "@/components/payments/ChartAlertTrustFooter";
import { useChartAlertPayments } from "@/lib/hooks/useChartAlertPayments";
import { trackAlertRequested, trackAnalyticsEvent } from "@/lib/analytics/track";
import { isValidEmail } from "@/lib/validation";
import { useContactFields } from "@/lib/contact";

const DEFAULT_CLASSES = ["3A", "SL", "2A", "1A", "3E", "CC", "2S", "ANY"] as const;

const CLASS_LABELS: Record<string, string> = {
  ANY: "ANY (Any Available Class)",
  "1A": "1A (AC First Class)",
  "2A": "2A (AC 2 Tier)",
  "3A": "3A (AC 3 Tier)",
  "3E": "3E (AC 3 Economy)",
  SL: "SL (Sleeper)",
  CC: "CC (AC Chair Car)",
  EC: "EC (Exec Chair Car)",
  EA: "EA (Exec Anubhuti)",
  "2S": "2S (Second Sitting)",
  FC: "FC (First Class)",
};

export interface EntireJourneyAlertCTAProps {
  trainNumber: string;
  trainName?: string;
  trainStartDate?: string;
  journeyDate: string;
  classCode: string;
  defaultOrigin: string;
  defaultDestination: string;
  originChartTime: string;
  initialExpanded?: boolean;
  onPaymentCreated?: (paymentData: {
    link: ChartAlertPaymentLink;
    ref: string;
    journey: ChartAlertPaymentModalJourney;
  }) => void;
  onSuccess?: (journey: ChartAlertPaymentModalJourney) => void;
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
  initialExpanded = false,
  onPaymentCreated,
  onSuccess,
}: EntireJourneyAlertCTAProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [selectedClass, setSelectedClass] = useState<string>(() =>
    (classCode || "SL").trim().toUpperCase(),
  );
  const alertPrice = chartAlertPriceForClass(selectedClass);
  const { email, setEmail, mobile, persistContact } = useContactFields();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isFreeAlerts, isAdmin, getButtonLabel } = useChartAlertPayments();
  const [subscribedJourney, setSubscribedJourney] =
    useState<ChartAlertPaymentModalJourney | null>(null);
  const [payment, setPayment] = useState<{
    link: ChartAlertPaymentLink;
    ref: string;
    journey: ChartAlertPaymentModalJourney;
  } | null>(null);

  const availableClasses = useMemo(() => {
    const norm = (classCode || "").trim().toUpperCase();
    if (!norm) return Array.from(DEFAULT_CLASSES);
    return Array.from(new Set([norm, ...DEFAULT_CLASSES]));
  }, [classCode]);

  useEffect(() => {
    if (classCode) {
      setSelectedClass(classCode.trim().toUpperCase());
    }
  }, [classCode]);

  const subscribe = async () => {
    const em = email.trim();
    const mob = mobile?.trim() || undefined;

    if (!em) {
      setError("Please enter your email address.");
      return;
    }

    if (!isValidEmail(em)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      persistContact();
      const journey: ChartAlertPaymentModalJourney = {
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromStationCode: defaultOrigin.trim().toUpperCase(),
        toStationCode: defaultDestination.trim().toUpperCase(),
        journeyDate: journeyDate.trim().slice(0, 10),
        classCode: selectedClass.trim().toUpperCase(),
      };

      if (isFreeAlerts) {
        await createFreeChartAlert({
          ...journey,
          trainStartDate: trainStartDate || undefined,
          stationCodesToMonitor: [defaultOrigin.trim().toUpperCase()],
          email: em,
          mobile: mob,
        });
        setSubscribedJourney(journey);
        onSuccess?.(journey);
        trackAlertRequested({
          success: true,
          source: "search_entire_journey",
          trainNumber: journey.trainNumber,
          trainName: journey.trainName,
          fromCode: journey.fromStationCode,
          toCode: journey.toStationCode,
          journeyDate: journey.journeyDate,
          classCode: journey.classCode,
          email: em,
          mobile: mob,
        });
        return;
      }

      const link = await startChartAlertPayment(
        {
          ...journey,
          trainStartDate: trainStartDate || undefined,
          stationCodesToMonitor: [defaultOrigin.trim().toUpperCase()],
          email: em,
          mobile: mob,
        },
        "search_panel",
      );

      if (onPaymentCreated) {
        onPaymentCreated({ link, ref: link.ref, journey });
      } else {
        setPayment({ link, ref: link.ref, journey });
      }
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
        source: "search_entire_journey",
        trainNumber: trainNumber.trim(),
        trainName: trainName?.trim() || undefined,
        fromCode: defaultOrigin.trim().toUpperCase(),
        toCode: defaultDestination.trim().toUpperCase(),
        journeyDate: journeyDate.trim(),
        classCode: selectedClass.trim().toUpperCase(),
        email: em,
        mobile: mob,
        error: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  if (subscribedJourney) {
    return (
      <div className="mt-2 w-full">
        <ChartAlertSuccessBox journey={subscribedJourney} compact />
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="mt-4 bg-white shadow-sm ring-1 ring-gray-900/5 rounded-xl">
        <div className="px-4 py-5 sm:p-6">
          <div className="sm:flex sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Entire Journey Chart Alert
              </h3>
              <div className="mt-1 max-w-xl text-sm text-gray-500">
                <p>Waitlisted? We&apos;ll alert you at {originChartTime}</p>
              </div>
            </div>
            <div className="mt-4 sm:ml-6 sm:mt-0 sm:flex sm:shrink-0 sm:items-center">
              <button
                type="button"
                onClick={() => {
                  setExpanded(true);
                  trackAnalyticsEvent({
                    name: "chart_alert_opened",
                    properties: {
                      source: "search_panel",
                      train_number: trainNumber,
                      from_code: defaultOrigin,
                      to_code: defaultDestination,
                    },
                  });
                }}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
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
    <div className="mt-2 w-full rounded-xl border border-blue-200 bg-blue-50/70 p-3 sm:p-4 shadow-2xs">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-900">
          Get notified when new seats open at {originChartTime}
        </p>
        <ChartAlertDiscountPrice price={alertPrice} />
      </div>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="entireJourneyClassSelect"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-700"
          >
            Travel Class
          </label>
          <select
            id="entireJourneyClassSelect"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {availableClasses.map((c) => (
              <option key={c} value={c}>
                {chartAlertClassPriceLabel(
                  CLASS_LABELS[c] || `${c} Class`,
                  c,
                )}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="entireJourneyEmailInput"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-700"
          >
            Email Address (required)
          </label>
          <input
            id="entireJourneyEmailInput"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={subscribe}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60 transition touch-manipulation uppercase tracking-wider"
          >
            {loading ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {isFreeAlerts ? "Setting up…" : "Opening payment…"}
              </>
            ) : (
              <>
                <BellRing className="h-3.5 w-3.5" />
                {getButtonLabel({
                  loading: false,
                  price: alertPrice,
                  verb: "subscribe",
                })}
              </>
            )}
          </button>
          {isAdmin && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 text-center">
              Admin mode — no charge, the alert is created directly.
            </p>
          )}
        </div>

        <ChartAlertTrustFooter />
      </div>

      {payment && !onPaymentCreated && (
        <ChartAlertPaymentModal
          open={Boolean(payment)}
          onClose={() => setPayment(null)}
          payment={payment.link}
          paymentRef={payment.ref}
          journey={payment.journey}
          source="search_panel"
          onPaid={(paidJourney) => {
            setSubscribedJourney(paidJourney);
            setPayment(null);
            onSuccess?.(paidJourney);
          }}
        />
      )}
    </div>
  );
}
