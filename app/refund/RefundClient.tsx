"use client";

import { useState } from "react";
import Link from "next/link";
import { createRefundRequest } from "@/lib/refund-requests";
import { isValidIndianMobile } from "@/lib/validation";
import { getStoredContact, saveStoredContact } from "@/lib/contact";
import { trackAnalyticsEvent } from "@/lib/analytics";

type Status = "idle" | "done" | "error";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "block text-sm font-medium text-slate-700";

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
  const stored = getStoredContact();
  const [mobile, setMobile] = useState(stored.mobile ?? "");
  const [trainNumber, setTrainNumber] = useState("");
  const [journeyDate, setJourneyDate] = useState("");
  const [txnId, setTxnId] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [referenceId, setReferenceId] = useState("");
  const [wasDuplicate, setWasDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const cleanMobile = mobile.trim();
    const cleanTrain = trainNumber.replace(/\D/g, "");
    if (!isValidIndianMobile(cleanMobile)) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number.");
      setStatus("error");
      return;
    }
    if (!/^\d{4,5}$/.test(cleanTrain)) {
      setErrorMessage("Please enter a valid 4–5 digit train number.");
      setStatus("error");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
      setErrorMessage("Please pick your date of journey.");
      setStatus("error");
      return;
    }
    setPending(true);
    setErrorMessage("");
    try {
      const res = await createRefundRequest({
        mobile: cleanMobile,
        trainNumber: cleanTrain,
        journeyDate,
        txnId: txnId.trim() || undefined,
      });
      saveStoredContact({ mobile: cleanMobile });
      setReferenceId(res.id);
      setWasDuplicate(res.duplicate);
      setStatus("done");
      trackAnalyticsEvent({
        name: "refund_request_submitted",
        properties: {
          train_number: cleanTrain,
          journey_date: journeyDate,
          has_txn_id: Boolean(txnId.trim()),
          duplicate: res.duplicate,
        },
      });
    } catch (err) {
      setErrorMessage(extractError(err));
      setStatus("error");
    } finally {
      setPending(false);
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
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">
              Refund request received.
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {wasDuplicate
                ? "We already have a pending request for this journey — our team will review it."
                : "Our team will review it and update you on your mobile number."}{" "}
              Reference: <span className="font-mono">{referenceId}</span>
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm text-slate-600 hover:text-blue-600 hover:underline"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-slate-600">
              Paid for a chart alert but didn&apos;t get a confirmed end-to-end
              ticket? Share the details below and we&apos;ll review your refund.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="refund-mobile" className={labelClass}>
                  Mobile number
                </label>
                <input
                  id="refund-mobile"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="98765 43210"
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
                  placeholder="pay_ or rfnd_ ID from your payment"
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
                disabled={pending}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending ? "Submitting…" : "Submit refund request"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
