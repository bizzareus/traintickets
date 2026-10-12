"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CREDIT_PACK_QUANTITY,
  verifyPurchase,
  type PurchaseStatus,
} from "@/lib/search-credits";

export function PaymentCompleteClient({
  purchaseRef,
}: {
  purchaseRef: string;
}) {
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchaseRef) return;
    let active = true;
    const check = async () => {
      try {
        // Explicit verify triggers server-to-server confirmation while pending.
        const next = await verifyPurchase(purchaseRef);
        if (!active) return;
        setStatus(next);
        setError(null);
        if (next.status !== "PENDING") clearInterval(timer);
      } catch {
        if (active) setError("Could not check your payment yet. Retrying…");
      }
    };
    const timer = setInterval(() => void check(), 3000);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [purchaseRef]);

  const paid = status?.status === "PAID";
  const failed = status?.status === "FAILED";
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-2xl font-bold text-slate-900">
        {!purchaseRef
          ? "Missing purchase reference"
          : paid
            ? "Credits added"
            : failed
              ? "Payment failed"
              : "Confirming your payment"}
      </h1>
      {purchaseRef && (
        <p className="text-sm text-slate-600">Purchase Ref: {purchaseRef}</p>
      )}
      <p role="status" className="text-sm text-slate-600">
        {paid
          ? `${CREDIT_PACK_QUANTITY} search credits are now on your account${status?.balance != null ? ` (${status.balance} available)` : ""}. Credits never expire.`
          : failed
            ? "No credits were added. Return to LastBerth to try again."
            : (error ?? "Waiting for confirmation from the payment provider…")}
      </p>
      <Link
        href="/"
        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Return to LastBerth
      </Link>
    </main>
  );
}
