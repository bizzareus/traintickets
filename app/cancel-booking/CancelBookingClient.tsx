"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  Loader2,
  ShieldAlert,
  Train,
} from "lucide-react";
import {
  lookupBookingForCancellation,
  submitBookingCancellation,
  type CancellationBookingDetails,
} from "@/lib/split-booking";
import { isValidIndianMobile } from "@/lib/validation";
import { getStoredContact, saveStoredContact } from "@/lib/contact";
import { trackAnalyticsEvent } from "@/lib/analytics";

function extractError(err: unknown): string {
  const ax = err as {
    response?: { data?: { message?: string | string[]; error?: string } };
    message?: string;
  };
  const raw =
    (Array.isArray(ax?.response?.data?.message)
      ? ax.response.data.message[0]
      : ax?.response?.data?.message) ??
    ax?.response?.data?.error ??
    ax?.message;
  return typeof raw === "string"
    ? raw
    : "Could not process request. Please check your details and try again.";
}

export function CancelBookingClient() {
  const searchParams = useSearchParams();
  const initialRef = (searchParams.get("ref") || "").trim().toUpperCase();
  const stored = getStoredContact();

  const [bookingRef, setBookingRef] = useState(initialRef);
  const [mobile, setMobile] = useState(stored.mobile ?? "");
  const [reason, setReason] = useState("");
  const [confirmUnderstood, setConfirmUnderstood] = useState(false);

  const [step, setStep] = useState<"lookup" | "review" | "success">("lookup");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [booking, setBooking] = useState<CancellationBookingDetails | null>(
    null,
  );
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    if (initialRef && !bookingRef) {
      setBookingRef(initialRef);
    }
  }, [initialRef, bookingRef]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const cleanRef = bookingRef.trim().toUpperCase();
    const cleanMobile = mobile.replace(/\D/g, "").slice(-10);

    if (!cleanRef) {
      setErrorMessage("Please enter your Booking Reference (e.g. LB-XXXXX).");
      return;
    }
    if (!isValidIndianMobile(cleanMobile)) {
      setErrorMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await lookupBookingForCancellation({
        bookingRef: cleanRef,
        mobile: cleanMobile,
      });
      saveStoredContact({ mobile: cleanMobile });
      setBooking(data);
      setStep("review");
      trackAnalyticsEvent({
        name: "split_booking_cancellation_looked_up",
        properties: {
          booking_ref: cleanRef,
          train_number: data.trainNumber,
          has_existing: Boolean(data.existingCancellation),
        },
      });
    } catch (err) {
      setErrorMessage(extractError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCancellation() {
    if (!booking || submitting) return;
    if (!confirmUnderstood) {
      setErrorMessage(
        "Please check the confirmation box to acknowledge Indian Railways cancellation terms.",
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await submitBookingCancellation({
        bookingRef: booking.bookingRef,
        mobile: mobile.replace(/\D/g, "").slice(-10),
        reason: reason.trim() || undefined,
      });

      setRequestId(res.requestId);
      setStep("success");
      trackAnalyticsEvent({
        name: "split_booking_cancellation_submitted",
        properties: {
          booking_ref: booking.bookingRef,
          train_number: booking.trainNumber,
        },
      });
    } catch (err) {
      setErrorMessage(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[80vh] bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Search
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Cancel Train Booking
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
            Request cancellation for your LastBerth split-ticket reservation
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        {/* STEP 1: LOOKUP FORM */}
        {step === "lookup" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Booking Reference *
                </label>
                <input
                  type="text"
                  required
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value.toUpperCase())}
                  placeholder="e.g. LB-DUZAW"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono uppercase focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Provided in your booking confirmation popup, email, and
                  WhatsApp message.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Mobile Number *
                </label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm text-slate-600">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full rounded-r-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <span className="mt-1 block text-[11px] text-slate-500">
                  Must match the mobile number used when reserving tickets.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking Booking...</span>
                    </>
                  ) : (
                    <span>Find Ticket Details</span>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <p className="text-xs text-slate-500">
                Need urgent help? WhatsApp us directly at{" "}
                <a
                  href="https://wa.me/919999224767?text=Hi%2C%20I%20need%20help%20with%20booking%20cancellation."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 underline hover:text-blue-800"
                >
                  +91 99992 24767
                </a>{" "}
                or email{" "}
                <a
                  href="mailto:support@lastberth.com?subject=Help%20with%20booking%20cancellation"
                  className="font-semibold text-blue-600 underline hover:text-blue-800"
                >
                  support@lastberth.com
                </a>
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW TICKET DETAILS & CONFIRM */}
        {step === "review" && booking && (
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            {/* Booking Header Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <Train className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {booking.trainNumber} {booking.trainName || ""}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {booking.fromStationCode} → {booking.toStationCode} •{" "}
                      {booking.travelClass} ({booking.quota})
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-slate-800">
                    {booking.bookingRef}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Date: {booking.journeyDate}
                  </p>
                </div>
              </div>

              {/* Passengers */}
              <div className="pt-3">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Passengers
                </span>
                <ul className="space-y-1 text-xs text-slate-700">
                  {booking.passengers.adults.map((p, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-500">
                        {p.gender}, Age {p.age}
                        {p.berthPreference ? ` • ${p.berthPreference}` : ""}
                      </span>
                    </li>
                  ))}
                  {booking.passengers.children?.map((c, idx) => (
                    <li key={`c-${idx}`} className="flex justify-between">
                      <span className="font-medium">{c.name} (Child)</span>
                      <span className="text-slate-500">
                        {c.gender}, Age {c.age}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* PNR Details if issued */}
              {(booking.pnrLeg1 ||
                booking.pnrLeg2 ||
                booking.pnrs?.length > 0) && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Issued PNRs
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      booking.pnrLeg1,
                      booking.pnrLeg2,
                      ...(booking.pnrs || []),
                    ]
                      .filter(Boolean)
                      .map((pnr, idx) => (
                        <span
                          key={idx}
                          className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-800"
                        >
                          {pnr}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Price Paid */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs">
                <span className="text-slate-600">Total Paid:</span>
                <span className="font-bold text-slate-900 text-sm">
                  ₹{booking.amount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Existing Request Warning if already submitted */}
            {booking.existingCancellation && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ShieldAlert className="h-4 w-4 text-amber-700" />
                  <span>Cancellation Request Already Received</span>
                </div>
                <p>
                  A cancellation request for this booking was submitted on{" "}
                  <strong>
                    {new Date(
                      booking.existingCancellation.createdAt,
                    ).toLocaleDateString("en-IN")}
                  </strong>{" "}
                  and is currently marked as{" "}
                  <strong className="uppercase">
                    {booking.existingCancellation.status}
                  </strong>
                  .
                </p>
                <p className="mt-1">
                  Our support team is processing it. If you need urgent status,
                  please contact WhatsApp support at +91 99992 24767 or email{" "}
                  support@lastberth.com.
                </p>
              </div>
            )}

            {!booking.existingCancellation && (
              <>
                {/* Cancellation policy advisory */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs text-slate-700 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <HelpCircle className="h-4 w-4 text-blue-600" />
                    <span>Indian Railways Cancellation & Refund Policy</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>
                      Ticket cancellations are governed by official Indian
                      Railways / IRCTC cancellation rules.
                    </li>
                    <li>
                      Statutory IRCTC clerkage and cancellation fees depend on
                      the time before scheduled train departure.
                    </li>
                    <li>
                      The refundable balance will be refunded directly to your
                      original payment account within 3–5 working days after
                      IRCTC processing.
                    </li>
                  </ul>
                </div>

                {/* Reason Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Reason for Cancellation (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Change in travel plans, emergency, etc."
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                  />
                </div>

                {/* Confirmation Checkbox */}
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmUnderstood}
                    onChange={(e) => setConfirmUnderstood(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs text-slate-700 leading-snug">
                    I confirm that I want to cancel booking{" "}
                    <strong>{booking.bookingRef}</strong> and acknowledge that
                    IRCTC cancellation charges and refund deductions apply.
                  </span>
                </label>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("lookup");
                      setErrorMessage("");
                    }}
                    className="w-full sm:w-1/3 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    disabled={!confirmUnderstood || submitting}
                    onClick={handleConfirmCancellation}
                    className="w-full sm:w-2/3 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <span>Confirm Cancellation Request</span>
                    )}
                  </button>
                </div>
              </>
            )}

            {booking.existingCancellation && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setStep("lookup")}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Look Up Another Booking
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: SUCCESS CONFIRMATION */}
        {step === "success" && (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8 shadow-sm text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Cancellation Request Received
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
              We have received your cancellation request for booking reference{" "}
              <strong className="font-mono text-slate-800">
                {booking?.bookingRef}
              </strong>
              .
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-left max-w-md mx-auto space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Request ID:</span>
                <span className="font-mono font-bold text-slate-800">
                  {requestId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Train:</span>
                <span className="font-bold text-slate-800">
                  {booking?.trainNumber} ({booking?.fromStationCode} →{" "}
                  {booking?.toStationCode})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-amber-700">
                  Pending Admin Processing
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Our team has been notified and will process the cancellation on
              IRCTC. You will receive confirmation via Email and WhatsApp once
              the refund has been credited.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
              <Link
                href="/"
                className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
