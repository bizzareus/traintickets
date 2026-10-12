"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MuzoboxPaymentFrame } from "@/components/payments/MuzoboxPaymentFrame";
import {
  CREDIT_PACK_PRICE_INR,
  CREDIT_PACK_QUANTITY,
  FREE_SEARCHES_PER_IP,
  createCreditPurchase,
  verifyPurchase,
  type CreditBalance,
  type ExhaustionInfo,
} from "@/lib/search-credits";

type Phase = "info" | "paying" | "verifying" | "done" | "error";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * Paywall shown when free searches / credits run out. Flow: mobile-OTP
 * sign-in (Auth0 Universal Login) → ₹100 checkout → server-verified grant.
 */
export function SearchCreditsPaywall({
  open,
  balance,
  exhaustion,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  balance: CreditBalance | null;
  exhaustion: ExhaustionInfo | null;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("info");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [purchaseRef, setPurchaseRef] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleClose = useCallback(() => {
    stopPolling();
    setPhase("info");
    setPayUrl(null);
    setPurchaseRef(null);
    setError(null);
    onClose();
  }, [onClose, stopPolling]);

  const pollUntilPaid = useCallback(
    (ref: string) => {
      const startedAt = Date.now();
      stopPolling();
      pollTimer.current = setInterval(() => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPolling();
          setPhase("error");
          setError("Payment verification timed out. Reopen to check status.");
          return;
        }
        void verifyPurchase(ref)
          .then((s) => {
            if (s.status === "PAID") {
              stopPolling();
              setPhase("done");
              onUnlocked();
            } else if (s.status === "FAILED") {
              stopPolling();
              setPhase("error");
              setError("Payment failed. Please try again.");
            }
          })
          .catch(() => {
            // Transient verification errors: keep polling until timeout.
          });
      }, POLL_INTERVAL_MS);
    },
    [onUnlocked, stopPolling],
  );

  const startCheckout = useCallback(async () => {
    setError(null);
    setPhase("paying");
    try {
      const purchase = await createCreditPurchase({
        ...(email.trim() ? { contactEmail: email.trim() } : {}),
        ...(mobile.trim() ? { contactMobile: mobile.trim() } : {}),
      });
      setPurchaseRef(purchase.purchaseRef);
      setPayUrl(purchase.payUrl);
      setPhase("verifying");
      pollUntilPaid(purchase.purchaseRef);
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error ? err.message : "Could not start checkout.",
      );
    }
  }, [email, mobile, pollUntilPaid]);

  if (!open) return null;

  const paidBalance = exhaustion?.paidBalance ?? balance?.paidBalance ?? 0;
  const authenticated = balance?.authenticated ?? false;
  const loginHref = `/auth/login?connection=sms&returnTo=${encodeURIComponent(pathname ?? "/")}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl sm:border sm:border-gray-200"
        role="dialog"
        aria-modal="true"
        aria-label="Search credits"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            You&apos;ve used your {FREE_SEARCHES_PER_IP} free searches
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-gray-600">
            Get{" "}
            <span className="font-semibold text-gray-900">
              {CREDIT_PACK_QUANTITY} search credits for ₹{CREDIT_PACK_PRICE_INR}
            </span>{" "}
            (introductory price). Credits never expire — buy another pack when
            they run out. No automatic billing.
          </p>

          {paidBalance > 0 && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              You have {paidBalance} credit{paidBalance === 1 ? "" : "s"} left.
              Sign in to use them.
            </p>
          )}

          {phase === "info" && (
            <>
              {!authenticated ? (
                <a
                  href={loginHref}
                  className="block w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Continue with mobile number (OTP)
                </a>
              ) : (
                <>
                  <div className="grid gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email for receipt (optional)"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                    />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="Mobile for receipt (optional)"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void startCheckout()}
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Pay ₹{CREDIT_PACK_PRICE_INR} for {CREDIT_PACK_QUANTITY}{" "}
                    credits
                  </button>
                </>
              )}
              <p className="text-xs text-gray-500">
                Signed in on another device? Sign in with the same mobile
                number to use your credits there.
              </p>
            </>
          )}

          {(phase === "paying" || phase === "verifying") && payUrl && (
            <MuzoboxPaymentFrame
              payUrl={payUrl}
              onPaymentComplete={() => {
                if (purchaseRef) void verifyPurchase(purchaseRef).then((s) => {
                  if (s.status === "PAID") {
                    stopPolling();
                    setPhase("done");
                    onUnlocked();
                  }
                });
              }}
            />
          )}
          {phase === "paying" && !payUrl && (
            <p className="text-center text-sm text-gray-500">
              Starting secure checkout…
            </p>
          )}

          {phase === "done" && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Payment confirmed — {CREDIT_PACK_QUANTITY} credits added. Happy
              searching!
            </div>
          )}

          {phase === "error" && error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {error && phase !== "error" && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {phase === "done" ? "Start searching" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}
