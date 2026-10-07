"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { isAxiosError } from "axios";
import moment from "moment";
import {
  X,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Train,
  ArrowRight,
} from "lucide-react";
import {
  createSplitBooking,
  fetchSplitBookingStatus,
  simulateSplitBookingPayment,
  type CreateSplitBookingPayload,
  type SplitBookingLeg,
  type SplitBookingPassenger,
  type SplitBookingPaymentResponse,
  type SplitBookingStatus,
} from "@/lib/split-booking";
import { trackAnalyticsEvent } from "@/lib/analytics/track";
import { MuzoboxPaymentFrame } from "@/components/payments/MuzoboxPaymentFrame";

export interface SplitTicketBookingModalProps {
  open: boolean;
  onClose: () => void;
  trainNumber: string;
  trainName?: string;
  journeyDate: string;
  fromStationCode: string;
  toStationCode: string;
  travelClass: string;
  quota?: string;
  totalFare: number;
  legs: SplitBookingLeg[];
}

type ModalStep = "passenger_details" | "payment" | "booking_in_progress";

const BERTH_OPTIONS = [
  "No Preference",
  "Lower",
  "Middle",
  "Upper",
  "Side Lower",
  "Side Upper",
  "Window Side",
];

const FOOD_OPTIONS = ["Veg", "Non-Veg", "No Food"] as const;

const createDefaultPassenger = (): SplitBookingPassenger => ({
  name: "",
  age: 30,
  gender: "Male",
  berthPreference: "No Preference",
  optBerth: true,
  foodChoice: "Veg",
  seniorCitizen: false,
});

export function SplitTicketBookingModal({
  open,
  onClose,
  trainNumber,
  trainName,
  journeyDate,
  fromStationCode,
  toStationCode,
  travelClass,
  quota = "GN",
  totalFare,
  legs,
}: SplitTicketBookingModalProps) {
  const [step, setStep] = useState<ModalStep>("passenger_details");

  // Step 1: Single passenger details state (booking engine supports 1 passenger)
  const [passengers, setPassengers] = useState<SplitBookingPassenger[]>([
    createDefaultPassenger(),
  ]);
  const [autoUpgrade, setAutoUpgrade] = useState(true);
  const [confirmBerthsOnly, setConfirmBerthsOnly] = useState(false);
  const [preferredCoach, setPreferredCoach] = useState("");
  const [travelInsurance, setTravelInsurance] = useState(true);
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 2: Payment state
  const [paymentData, setPaymentData] =
    useState<SplitBookingPaymentResponse | null>(null);

  // Step 3: Fulfillment status
  const [bookingStatus, setBookingStatus] = useState<SplitBookingStatus | null>(
    null,
  );
  const [bookingDelayed, setBookingDelayed] = useState(false);
  const activePaymentRef = useRef<string | null>(null);
  const pollingRef = useRef<string | null>(null);
  const bookingConfirmed = bookingStatus?.bookingStatus === "CONFIRMED";
  const bookingFailed = bookingStatus?.bookingStatus === "FAILED";
  const paymentFailed = bookingStatus?.paymentStatus === "FAILED";
  const recordedPnrs = bookingStatus?.pnrs ?? [
    bookingStatus?.pnrLeg1,
    bookingStatus?.pnrLeg2,
  ];
  const price = bookingStatus ?? paymentData;
  const selectedTravelClasses = [
    ...new Set(legs.map((leg) => leg.travelClass)),
  ];
  const paymentBreakdown = price && (
    <p className="text-sm text-slate-600">
      ₹{price.totalFare.toLocaleString("en-IN")} (tickets) + ₹
      {price.serviceFee.toLocaleString("en-IN")} (payment service charge) ={" "}
      <strong className="text-slate-900">
        ₹{price.amount.toLocaleString("en-IN")}
      </strong>
    </p>
  );

  const handleClose = useCallback(() => {
    trackAnalyticsEvent({
      name: "split_booking_modal_closed",
      properties: {
        train_number: trainNumber,
        step,
      },
    });
    onClose();
  }, [trainNumber, step, onClose]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setStep("passenger_details");
      setPassengers([createDefaultPassenger()]);
      setPaymentData(null);
      setBookingStatus(null);
      setBookingDelayed(false);
      setFormError(null);
      setIsSubmitting(false);
      setAutoUpgrade(true);
      setConfirmBerthsOnly(false);
      setPreferredCoach("");
      setTravelInsurance(true);
      trackAnalyticsEvent({
        name: "split_booking_modal_opened",
        properties: {
          train_number: trainNumber,
          train_name: trainName,
          journey_date: journeyDate,
          from_code: fromStationCode,
          to_code: toStationCode,
          travel_class: travelClass,
          total_fare: totalFare,
          leg_count: legs.length,
        },
      });
    }
  }, [
    open,
    trainNumber,
    trainName,
    journeyDate,
    fromStationCode,
    toStationCode,
    travelClass,
    totalFare,
    legs.length,
  ]);

  // Handle passenger input changes
  const updatePassenger = (
    index: number,
    field: keyof SplitBookingPassenger,
    value: unknown,
  ) => {
    setPassengers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Submit passenger details -> create payment
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validations
    const cleanMobile = mobile.replace(/\D/g, "").slice(-10);
    if (cleanMobile.length !== 10) {
      setFormError("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setFormError("Please enter a valid email address");
      return;
    }

    if (passengers.length !== 1) {
      setFormError("The booking engine currently supports only 1 passenger per booking.");
      return;
    }

    const p = passengers[0];
    if (!p.name.trim() || p.name.trim().length < 2) {
      setFormError("Please enter a valid name for the passenger");
      return;
    }
    if (!p.age || p.age < 1 || p.age > 125) {
      setFormError("Please enter a valid age (1-125) for the passenger");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateSplitBookingPayload = {
        trainNumber,
        trainName,
        fromStationCode,
        toStationCode,
        journeyDate,
        travelClass,
        quota,
        totalFare,
        legs,
        passengers: [p],
        childPassengers: [],
        autoUpgrade,
        confirmBerthsOnly,
        preferredCoach: preferredCoach.trim() || undefined,
        travelInsurance,
        contactMobile: cleanMobile,
        contactEmail: email.trim(),
      };

      trackAnalyticsEvent({
        name: "split_booking_details_submitted",
        properties: {
          train_number: trainNumber,
          passenger_count: 1,
          total_fare: totalFare,
        },
      });

      const payment = await createSplitBooking(payload);
      trackAnalyticsEvent({
        name: "split_booking_payment_initiated",
        properties: {
          bookingRef: payment.bookingRef,
          amount: payment.amount,
          service_fee: payment.serviceFee,
          total_fare: payment.totalFare,
        },
      });
      setPaymentData(payment);
      setStep("payment");
    } catch (err: unknown) {
      const msg = isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message ||
          "Unable to prepare checkout. Please try again."
        : err instanceof Error
          ? err.message
          : "Failed to create booking intent";
      trackAnalyticsEvent({
        name: "split_booking_intent_failed",
        properties: {
          train_number: trainNumber,
          error: msg,
        },
      });
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    activePaymentRef.current = open ? paymentData?.bookingRef ?? null : null;
    return () => {
      activePaymentRef.current = null;
    };
  }, [open, paymentData?.bookingRef]);

  // Ignore stale responses and avoid overlapping server-to-server verifications.
  const pollStatus = useCallback(async () => {
    const bookingRef = paymentData?.bookingRef;
    if (
      !bookingRef ||
      activePaymentRef.current !== bookingRef ||
      pollingRef.current === bookingRef
    ) return;
    pollingRef.current = bookingRef;
    try {
      const st = await fetchSplitBookingStatus(bookingRef);
      if (activePaymentRef.current !== bookingRef) return;
      setBookingStatus(st);

      if (st.paymentStatus === "PAID" && step === "payment") {
        setStep("booking_in_progress");
        trackAnalyticsEvent({
          name: "split_booking_payment_confirmed",
          properties: {
            bookingRef: st.bookingRef,
            amount: st.amount,
          },
        });
      }
    } catch {
      // transient polling error
    } finally {
      if (pollingRef.current === bookingRef) pollingRef.current = null;
    }
  }, [paymentData?.bookingRef, step]);

  useEffect(() => {
    if (
      !open || paymentFailed || bookingConfirmed || bookingFailed ||
      step === "passenger_details"
    ) return;
    void pollStatus();
    const interval = setInterval(() => void pollStatus(), 2500);
    return () => clearInterval(interval);
  }, [open, step, pollStatus, paymentFailed, bookingConfirmed, bookingFailed]);

  useEffect(() => {
    if (
      !open || step !== "booking_in_progress" || bookingConfirmed || bookingFailed
    ) return;
    // Use the saved payment time so repeated status polls do not reset the wait.
    const paidAt = moment(bookingStatus?.paidAt ?? undefined);
    const delayMs = paidAt.isValid()
      ? Math.max(0, paidAt.add(5, "minutes").diff(moment()))
      : 5 * 60 * 1000;
    const timer = setTimeout(() => setBookingDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [open, step, bookingConfirmed, bookingFailed, bookingStatus?.paidAt]);

  const trackedTerminalStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!bookingStatus?.bookingRef) {
      trackedTerminalStatus.current = null;
      return;
    }
    const terminalKey = `${bookingStatus.bookingRef}:${bookingStatus.bookingStatus}`;
    if (trackedTerminalStatus.current === terminalKey) return;

    if (bookingStatus.bookingStatus === "CONFIRMED") {
      trackedTerminalStatus.current = terminalKey;
      trackAnalyticsEvent({
        name: "split_booking_confirmed",
        properties: {
          bookingRef: bookingStatus.bookingRef,
          train_number: trainNumber,
          leg_count: legs.length,
        },
      });
    } else if (bookingStatus.bookingStatus === "FAILED") {
      trackedTerminalStatus.current = terminalKey;
      trackAnalyticsEvent({
        name: "split_booking_failed",
        properties: {
          bookingRef: bookingStatus.bookingRef,
          train_number: trainNumber,
          error: bookingStatus.bookingError || undefined,
        },
      });
    }
  }, [bookingStatus, trainNumber, legs.length]);

  // Dev simulation handler
  const handleSimulatePayment = async () => {
    if (!paymentData?.bookingRef) return;
    try {
      setIsSubmitting(true);
      trackAnalyticsEvent({
        name: "split_booking_simulation_triggered",
        properties: {
          bookingRef: paymentData.bookingRef,
        },
      });
      const st = await simulateSplitBookingPayment(paymentData.bookingRef);
      setBookingStatus(st);
      setStep("booking_in_progress");
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs overflow-hidden"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="relative flex w-full max-w-2xl max-h-[92dvh] sm:max-h-[85vh] h-[92dvh] sm:h-auto flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-300 sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="h-1.5 w-12 rounded-full bg-slate-300" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-blue-600 text-white shadow-sm">
              <Train className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Ticket Reservation & Booking
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                {trainName
                  ? `${trainName} (${trainNumber})`
                  : `Train ${trainNumber}`}{" "}
                • {journeyDate} •{" "}
                {selectedTravelClasses.length > 1 ? "Classes" : "Class"}{" "}
                {selectedTravelClasses.join(", ")}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps Progress Bar */}
        <div className="flex border-b border-slate-100 bg-white text-[11px] sm:text-xs font-semibold text-slate-500">
          <div
            className={`flex-1 py-2 px-1 text-center border-b-2 transition ${
              step === "passenger_details"
                ? "border-blue-600 text-blue-600 bg-blue-50/30"
                : "border-transparent"
            }`}
          >
            <span className="sm:hidden">1. Details</span>
            <span className="hidden sm:inline">1. Passenger Details</span>
          </div>
          <div
            className={`flex-1 py-2 px-1 text-center border-b-2 transition ${
              step === "payment"
                ? "border-blue-600 text-blue-600 bg-blue-50/30"
                : "border-transparent"
            }`}
          >
            <span className="sm:hidden">2. Payment</span>
            <span className="hidden sm:inline">2. Payment</span>
          </div>
          <div
            className={`flex-1 py-2 px-1 text-center border-b-2 transition ${
              step === "booking_in_progress"
                ? "border-emerald-600 text-emerald-600 bg-emerald-50/30"
                : "border-transparent"
            }`}
          >
            <span className="sm:hidden">3. Booking</span>
            <span className="hidden sm:inline">3. Reservation</span>
          </div>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* STEP 1: PASSENGER DETAILS FORM (Image 2 Parity) */}
          {step === "passenger_details" && (
            <form
              onSubmit={handleProceedToPayment}
              className="space-y-4 sm:space-y-6"
            >
              {/* Journey Route & Split Legs Banner */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600">
                    Split Journey Route
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-blue-900 tabular-nums">
                    Ticket Fare: ₹{totalFare}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {legs.map((leg, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg bg-white p-2 sm:p-2.5 border border-slate-200 shadow-2xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-700">
                          Leg {idx + 1}:{" "}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {leg.from} → {leg.to} · {leg.travelClass}
                        </span>
                      </div>
                      <span className="font-bold text-emerald-700 shrink-0">
                        ₹{leg.fare}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-2.5 sm:space-y-3">
                <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700">
                  Contact Information (For Tickets & PNR)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mobile Number (10 Digits) *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm min-h-[42px] sm:min-h-[38px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      inputMode="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. yourname@example.com"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm min-h-[42px] sm:min-h-[38px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Passenger Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700">
                    Passenger Details
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Single Passenger (1 Max)
                  </span>
                </div>

                <div className="space-y-3">
                  {passengers.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                            1
                          </span>
                          Passenger Details
                        </span>
                      </div>

                      {/* Primary Passenger Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                        {/* Name */}
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Full Name as per Govt ID"
                            value={p.name}
                            onChange={(e) =>
                              updatePassenger(idx, "name", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[40px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
                          />
                        </div>

                        {/* Age */}
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Age *
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            required
                            min={1}
                            max={125}
                            value={p.age || ""}
                            onChange={(e) =>
                              updatePassenger(
                                idx,
                                "age",
                                parseInt(e.target.value, 10) || 0,
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[40px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Gender */}
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Gender *
                          </label>
                          <select
                            value={p.gender}
                            onChange={(e) =>
                              updatePassenger(
                                idx,
                                "gender",
                                e.target
                                  .value as SplitBookingPassenger["gender"],
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[40px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Transgender">Transgender</option>
                          </select>
                        </div>

                        {/* Berth Preference */}
                        <div className="sm:col-span-6">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Berth Preference
                          </label>
                          <select
                            value={p.berthPreference || "No Preference"}
                            onChange={(e) =>
                              updatePassenger(
                                idx,
                                "berthPreference",
                                e.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[40px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            {BERTH_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Food Choice */}
                        <div className="sm:col-span-6">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Food Choice
                          </label>
                          <select
                            value={p.foodChoice ?? "Veg"}
                            onChange={(e) =>
                              updatePassenger(
                                idx,
                                "foodChoice",
                                e.target
                                  .value as SplitBookingPassenger["foodChoice"],
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[40px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            {FOOD_OPTIONS.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Passenger Options: Opt Berth & Senior Citizen Checkboxes */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 bg-slate-50/50 rounded-lg p-2.5">
                        <label
                          htmlFor={`opt_berth_${idx}`}
                          className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium select-none"
                        >
                          <input
                            type="checkbox"
                            id={`opt_berth_${idx}`}
                            checked={p.optBerth !== false}
                            onChange={(e) =>
                              updatePassenger(idx, "optBerth", e.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                          />
                          <span>Opt Berth (Allot seat/berth)</span>
                        </label>

                        <label
                          htmlFor={`sr_${idx}`}
                          className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium select-none"
                        >
                          <input
                            type="checkbox"
                            id={`sr_${idx}`}
                            checked={p.seniorCitizen || false}
                            onChange={(e) =>
                              updatePassenger(
                                idx,
                                "seniorCitizen",
                                e.target.checked,
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                          />
                          <span>Senior Citizen concession (if applicable)</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {/* Travel Insurance Section (IRCTC Parity) */}
              <div className="rounded-xl bg-amber-50/70 p-3.5 border border-amber-200/80 space-y-2 text-xs text-amber-950">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Travel Insurance (₹0.45 per passenger)</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-6 pt-0.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800 select-none">
                    <input
                      type="radio"
                      name="travel_insurance"
                      checked={travelInsurance}
                      onChange={() => setTravelInsurance(true)}
                      className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0"
                    />
                    <span>
                      Yes, accept insurance &amp; terms
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800 select-none">
                    <input
                      type="radio"
                      name="travel_insurance"
                      checked={!travelInsurance}
                      onChange={() => setTravelInsurance(false)}
                      className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0"
                    />
                    <span>No, do not add insurance</span>
                  </label>
                </div>
              </div>

              {/* Other Preferences: Auto Upgrade, Confirm Berths, Preferred Coach */}
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-3 text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                  Additional Reservation Preferences
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800 select-none">
                      <input
                        type="checkbox"
                        id="auto_upgradation"
                        checked={autoUpgrade}
                        onChange={(e) => setAutoUpgrade(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <span>Consider for Auto-Upgradation</span>
                    </label>

                    <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800 select-none">
                      <input
                        type="checkbox"
                        id="confirm_berths_only"
                        checked={confirmBerthsOnly}
                        onChange={(e) => setConfirmBerthsOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <span>Book only if confirm berths are allotted</span>
                    </label>
                  </div>

                  {/* Preferred Coach input */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Preferred Coach (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="e.g. S4, B1"
                      value={preferredCoach}
                      onChange={(e) =>
                        setPreferredCoach(e.target.value.toUpperCase())
                      }
                      className="w-full sm:w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase min-h-[40px] focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white placeholder:text-slate-400 placeholder:normal-case"
                    />
                  </div>
                </div>
              </div>

              {/* Error notification */}
              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition text-center min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition min-h-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Preparing Checkout...
                    </>
                  ) : (
                    <>
                      Proceed to Payment <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: MUZOBOX CHECKOUT */}
          {step === "payment" && paymentData && (
            <div className="space-y-6 text-center">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 mb-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Secure
                  Instant Checkout
                </span>
                <h4 className="text-xl font-extrabold text-slate-900">
                  Pay ₹{paymentData.amount.toLocaleString("en-IN")}
                </h4>
                {paymentBreakdown}
                <p className="text-xs text-slate-500 mt-0.5">
                  Ref: {paymentData.bookingRef}
                </p>
              </div>

              {paymentFailed ? (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  Payment failed. Your reservation has not started. Please close
                  this window and try again.
                </p>
              ) : (
                <MuzoboxPaymentFrame
                  payUrl={paymentData.payUrl}
                  onPaymentComplete={pollStatus}
                />
              )}

              {/* Polling Indicator */}
              {!paymentFailed && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>Waiting for payment confirmation...</span>
                </div>
              )}

              {/* Developer Test Mode Helper */}
              {process.env.NODE_ENV === "development" && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleSimulatePayment}
                    disabled={isSubmitting}
                    className="rounded-lg bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200 transition"
                  >
                    ⚡ Simulate Payment & Start Fulfillment (Dev Mode)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: BOOKING PROGRESS */}
          {step === "booking_in_progress" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  {bookingFailed ? (
                    <AlertCircle className="h-7 w-7 text-amber-600" />
                  ) : bookingConfirmed ? (
                    <CheckCircle2 className="h-7 w-7" />
                  ) : (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  )}
                </div>
                <h4 className="text-xl font-extrabold text-slate-900">
                  {bookingConfirmed
                    ? "Your tickets are confirmed"
                    : bookingFailed
                      ? "Booking needs attention"
                      : "Booking in progress"}
                </h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto mt-1">
                  {bookingConfirmed
                    ? "All reservations have been verified. Your PNRs are below."
                    : bookingFailed
                      ? "The booking process stopped. Review the details and any recorded PNRs below."
                      : "Payment confirmed. Your reservation is in progress. We'll show your tickets and PNRs here once confirmed."}
                </p>
                <span className="inline-block mt-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-mono font-bold text-slate-800">
                  Booking Ref: {paymentData?.bookingRef}
                </span>
              </div>

              {/* Live Steps Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                    ✓
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    Payment Received (₹{price?.amount.toLocaleString("en-IN")})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                    {bookingConfirmed ? (
                      "✓"
                    ) : bookingFailed ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    {bookingFailed
                      ? "Reservation Stopped"
                      : bookingConfirmed
                        ? "Booking completed"
                        : "Booking in progress"}
                  </span>
                </div>

                {bookingDelayed && !bookingConfirmed && !bookingFailed && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                  >
                    <p className="font-semibold">
                      It&apos;s taking longer than usual.
                    </p>
                    <p className="mt-1">
                      For any query, contact us on WhatsApp at{" "}
                      <a
                        href={`https://wa.me/919999224767?text=${encodeURIComponent(`Hi, I have a query about booking ${paymentData?.bookingRef}.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline underline-offset-2 hover:text-amber-700"
                      >
                        +919999224767
                      </a>{" "}
                      or email{" "}
                      <a
                        href={`mailto:support@lastberth.com?subject=${encodeURIComponent(`Query about booking ${paymentData?.bookingRef}`)}`}
                        className="font-bold underline underline-offset-2 hover:text-amber-700"
                      >
                        support@lastberth.com
                      </a>.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      bookingConfirmed
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-300 text-slate-600"
                    }`}
                  >
                    {bookingConfirmed ? "✓" : "3"}
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    Ticket Confirmation & PNR Generation
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                {paymentBreakdown}
                <p className="text-xs text-slate-500">
                  For cancellations, please{" "}
                  <a
                    href={`/cancel-booking${paymentData?.bookingRef ? `?ref=${encodeURIComponent(paymentData.bookingRef)}` : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
                  >
                    click here
                  </a>
                </p>
              </div>

              {/* Confirmation Details if Finished */}
              {bookingConfirmed && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-2 text-xs">
                  <div className="font-bold text-emerald-900 text-sm">
                    🎉 Booking Successful!
                  </div>
                  <p className="text-emerald-800">
                    Your split tickets have been secured. Save the PNRs below
                    for your journey.
                  </p>
                </div>
              )}

              {/* Error display if failed */}
              {bookingFailed && bookingStatus && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-1 text-xs text-red-800">
                  <div className="font-bold text-red-900">
                    Booking Encountered an Issue
                  </div>
                  <p>
                    {bookingStatus.bookingError ||
                      "We could not complete the reservation. Contact support with your booking reference."}
                  </p>
                </div>
              )}

              {recordedPnrs.some(Boolean) && (
                <div className="space-y-2 text-xs">
                  {!bookingConfirmed && (
                    <p className="text-amber-800">
                      The portal issued the PNRs below. The full booking is not
                      confirmed; check these reservations before booking again.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {recordedPnrs.map((pnr, index) =>
                      pnr ? (
                        <div
                          key={index}
                          className="rounded border border-slate-200 bg-white p-2"
                        >
                          <span className="block text-[10px] text-slate-500">
                            Leg {index + 1} PNR:
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {pnr}
                          </span>
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
                >
                  Close Window
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Official IRCTC Agent Trust Strip */}
        <div className="border-t border-slate-100 bg-slate-50/90 px-3.5 py-2 sm:px-5 sm:py-2.5">
          <div className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-slate-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              LastBerth is an official IRCTC Agent
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
