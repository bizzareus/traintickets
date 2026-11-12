"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createRefundRequest,
  getRefundQuote,
} from "@/lib/refund-requests";
import { isValidEmail } from "@/lib/validation";
import { getStoredContact, saveStoredContact } from "@/lib/contact";
import { trackAnalyticsEvent } from "@/lib/analytics";

type Status = "idle" | "done" | "error";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "block text-sm font-medium text-slate-700";
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  return typeof raw === "string" ? raw : "Could not submit. Please try again.";
}

export function RefundClient() {
  const searchParams = useSearchParams();
  const stored = getStoredContact();
  const queryDate = searchParams.get("date") ?? "";
  const [email, setEmail] = useState(
    searchParams.get("email")?.trim().toLowerCase() ||
      stored.email ||
      "",
  );
  const [trainNumber, setTrainNumber] = useState(
    searchParams.get("train")?.replace(/\D/g, "") ?? "",
  );
  const [journeyDate, setJourneyDate] = useState(
    YMD_RE.test(queryDate) ? queryDate : "",
  );
  const [txnId, setTxnId] = useState(searchParams.get("txn") ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [referenceId, setReferenceId] = useState("");
  const [wasDuplicate, setWasDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Popup & Auto-refund states
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState<number>(10);
  const [autoRefundResult, setAutoRefundResult] = useState<{
    autoRefunded?: boolean;
    amount?: number;
    refundId?: string | null;
  } | null>(null);

  /** Initial click on "Submit refund request" -> fetch quote amount and display popup. */
  async function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loadingQuote || submitting) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setErrorMessage("Please enter a valid email address.");
      setStatus("error");
      return;
    }
    const cleanTrain = trainNumber.replace(/\D/g, "");
    if (!/^\d{4,5}$/.test(cleanTrain)) {
      setErrorMessage("Please enter a valid 4–5 digit train number.");
      setStatus("error");
      return;
    }
    if (!YMD_RE.test(journeyDate)) {
      setErrorMessage("Please pick your date of journey.");
      setStatus("error");
      return;
    }

    setLoadingQuote(true);
    setErrorMessage("");

    try {
      const quote = await getRefundQuote({
        email: cleanEmail,
        trainNumber: cleanTrain,
        journeyDate,
        txnId: txnId.trim() || undefined,
      });
      setQuoteAmount(typeof quote.amount === "number" ? quote.amount : 10);
      setShowConfirmModal(true);
    } catch {
      // Fallback quote of 10 if quote endpoint fails so the user can still proceed
      setQuoteAmount(10);
      setShowConfirmModal(true);
    } finally {
      setLoadingQuote(false);
    }
  }

  /** Final confirmation click inside popup -> shows loader and auto initiates refund. */
  async function handleConfirmSubmit() {
    if (submitting) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanTrain = trainNumber.replace(/\D/g, "");

    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await createRefundRequest({
        email: cleanEmail,
        trainNumber: cleanTrain,
        journeyDate,
        txnId: txnId.trim() || undefined,
      });

      saveStoredContact({ email: cleanEmail });
      setReferenceId(res.id);
      setWasDuplicate(res.duplicate);
      setAutoRefundResult({
        autoRefunded: res.autoRefunded,
        amount: res.amount ?? quoteAmount,
        refundId: res.refundId,
      });
      setShowConfirmModal(false);
      setStatus("done");

      trackAnalyticsEvent({
        name: "refund_request_submitted",
        properties: {
          train_number: cleanTrain,
          journey_date: journeyDate,
          has_txn_id: Boolean(txnId.trim()),
          duplicate: res.duplicate,
          auto_refunded: Boolean(res.autoRefunded),
          amount: res.amount ?? quoteAmount,
        },
      });
    } catch (err) {
      setErrorMessage(extractError(err));
      setStatus("error");
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Request Refund</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900">
          Request a Refund
        </h1>

        {status === "done" ? (
          autoRefundResult?.autoRefunded ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                  ✓
                </span>
                <p className="text-lg font-bold text-emerald-950">
                  Refund Issued Automatically 💸
                </p>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-emerald-900">
                We have verified your payment and automatically initiated a refund of{" "}
                <strong className="font-semibold text-emerald-950">
                  ₹{autoRefundResult.amount ?? quoteAmount}
                </strong>{" "}
                to your original payment method via Razorpay.
              </p>

              {autoRefundResult.refundId && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 font-mono text-xs text-slate-700">
                  <span className="font-medium text-slate-500">Razorpay Refund ID:</span>{" "}
                  <span className="font-semibold text-slate-900">
                    {autoRefundResult.refundId}
                  </span>
                </div>
              )}

              <p className="mt-3 text-xs text-emerald-800">
                A confirmation email with the alert details has been sent to{" "}
                <strong>{email}</strong>. Refunds typically reflect in your bank account within{" "}
                <strong>5–7 business days</strong>.
              </p>

              <div className="mt-4 pt-3 border-t border-emerald-200/60 text-xs text-emerald-800">
                Request Reference: <span className="font-mono font-semibold">{referenceId}</span>
              </div>

              <Link
                href="/"
                className="mt-5 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Back to home
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">
                Refund request received.
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                {wasDuplicate
                  ? "We already have a pending request for this journey — our team will review it."
                  : `Our team will review your refund of ₹${quoteAmount} and update you on your email.`}{" "}
                Reference: <span className="font-mono">{referenceId}</span>
              </p>
              <Link
                href="/"
                className="mt-4 inline-block text-sm text-slate-600 hover:text-blue-600 hover:underline"
              >
                Back to home
              </Link>
            </div>
          )
        ) : (
          <>
            <p className="mb-6 text-slate-600">
              Paid for a chart alert but didn&apos;t get a confirmed end-to-end
              ticket? Share the details below and we&apos;ll review your refund.
            </p>
            <form onSubmit={handleInitialSubmit} className="space-y-4">
              <div>
                <label htmlFor="refund-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="refund-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="refund-train" className={labelClass}>
                    Train number
                  </label>
                  <input
                    id="refund-train"
                    type="text"
                    inputMode="numeric"
                    value={trainNumber}
                    onChange={(e) => setTrainNumber(e.target.value)}
                    placeholder="12951"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="refund-date" className={labelClass}>
                    Date of journey
                  </label>
                  <input
                    id="refund-date"
                    type="date"
                    value={journeyDate}
                    onChange={(e) => setJourneyDate(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="refund-txn" className={labelClass}>
                  Transaction ID{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="refund-txn"
                  type="text"
                  value={txnId}
                  onChange={(e) => setTxnId(e.target.value)}
                  placeholder="pay_ or payment reference ID from your receipt"
                  className={inputClass}
                />
              </div>
              {status === "error" && errorMessage && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}
              <button
                type="submit"
                disabled={loadingQuote || submitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loadingQuote ? "Checking details…" : "Submit refund request"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Confirmation & Validation Popup Modal */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all">
            {submitting ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
                <p className="mt-4 text-base font-semibold text-slate-900">
                  Validating your refund amount...
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Checking transaction eligibility and auto-initiating your refund.
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  Confirm Refund Request
                </h3>

                <div className="my-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                    Refund Amount
                  </span>
                  <div className="mt-1 text-3xl font-extrabold text-blue-900">
                    ₹{quoteAmount}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
                  <p className="font-semibold">
                    You will be refunded this amount.
                  </p>
                  <p className="mt-1 text-amber-800">
                    Payment gateway amount will not be refunded.
                  </p>
                </div>

                <div className="mt-4 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Train:</span>
                    <span className="font-mono font-medium text-slate-900">{trainNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span className="font-medium text-slate-900">{journeyDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Email:</span>
                    <span className="font-medium text-slate-900">{email}</span>
                  </div>
                  {txnId.trim() && (
                    <div className="flex justify-between">
                      <span>Txn ID:</span>
                      <span className="max-w-[200px] truncate font-mono text-slate-900">
                        {txnId.trim()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSubmit}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    Confirm &amp; Request Refund
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
