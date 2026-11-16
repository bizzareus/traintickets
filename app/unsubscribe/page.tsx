"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { getStoredContact, saveStoredContact } from "@/lib/contact";

type Status =
  | "loading"
  | "unsubscribed"
  | "subscribed"
  | "error"
  | "request-link"
  | "link-sent";

function UnsubscribePageContent() {
  const searchParams = useSearchParams();
  const paramRecipient = searchParams.get("r")?.trim() ?? "";
  const paramToken = searchParams.get("t")?.trim() ?? "";
  const stored = getStoredContact();
  const initialRecipient =
    paramRecipient || stored.email || stored.mobile || "";
  const hasToken = Boolean(paramToken && initialRecipient);

  const [recipient, setRecipient] = useState(initialRecipient);
  const [status, setStatus] = useState<Status>(
    hasToken ? "loading" : "request-link",
  );
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get<{ unsubscribed: boolean }>(
          `/api/notifications/unsubscribe/status`,
          { params: { recipient: initialRecipient, token: paramToken } },
        );
        if (cancelled) return;
        setStatus(data.unsubscribed ? "unsubscribed" : "subscribed");
      } catch {
        if (cancelled) return;
        // Invalid/expired token (e.g. after a secret rotation) — fall back to
        // requesting a fresh link instead of showing a dead end.
        setStatus("request-link");
        setErrorMessage(
          "This link is no longer valid. Request a fresh one below.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, initialRecipient, paramToken]);

  /** No token in the URL: email the recipient a fresh signed link. */
  async function handleRequestLink(e: React.FormEvent) {
    e.preventDefault();
    const email = recipient.trim().toLowerCase();
    if (!email || pending) return;
    setPending(true);
    setErrorMessage("");
    try {
      await apiClient.post(`/api/notifications/unsubscribe/link`, {
        recipient: email,
      });
      setStatus("link-sent");
      trackAnalyticsEvent({
        name: "notification_unsubscribe_link_requested",
        properties: {},
      });
    } catch {
      setErrorMessage("Could not send the link. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleUnsubscribe() {
    if (!recipient.trim() || pending || !paramToken) return;
    setPending(true);
    setErrorMessage("");
    try {
      await apiClient.post(`/api/notifications/unsubscribe`, {
        recipient: recipient.trim(),
        token: paramToken,
      });
      saveStoredContact(
        detectChannel(recipient) === "email"
          ? { email: recipient }
          : { mobile: recipient },
      );
      setStatus("unsubscribed");
      trackAnalyticsEvent({
        name: "notification_unsubscribe_completed",
        properties: { channel: detectChannel(recipient) },
      });
    } catch {
      setErrorMessage("Could not unsubscribe. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleResubscribe() {
    if (!recipient.trim() || pending || !paramToken) return;
    setPending(true);
    setErrorMessage("");
    try {
      await apiClient.post(`/api/notifications/resubscribe`, {
        recipient: recipient.trim(),
        token: paramToken,
      });
      saveStoredContact(
        detectChannel(recipient) === "email"
          ? { email: recipient }
          : { mobile: recipient },
      );
      setStatus("subscribed");
      trackAnalyticsEvent({
        name: "notification_resubscribe_completed",
        properties: { channel: detectChannel(recipient) },
      });
    } catch {
      setErrorMessage("Could not re-subscribe. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const channelLabel = detectChannel(recipient);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Unsubscribe</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900">
          Manage Notifications
        </h1>

        {status === "loading" && (
          <p className="text-slate-600">Checking your subscription…</p>
        )}

        {status === "error" && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage || "Something went wrong."}
          </div>
        )}

        {status === "request-link" && (
          <>
            <p className="mb-6 text-slate-600">
              To stop (or restart) alert emails, enter the email address you
              subscribe with and we&apos;ll send you a secure one-click link.
            </p>
            <form onSubmit={handleRequestLink} className="space-y-4">
              <div>
                <label
                  htmlFor="recipient"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="recipient"
                  type="email"
                  autoComplete="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
              {errorMessage && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}
              <button
                type="submit"
                disabled={pending || !recipient.trim()}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending ? "Sending link…" : "Email me a manage link"}
              </button>
            </form>
          </>
        )}

        {status === "link-sent" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">Check your inbox.</p>
            <p className="mt-1 text-sm text-emerald-800">
              We&apos;ve sent a link to{" "}
              <span className="font-mono">{recipient}</span> that lets you
              unsubscribe from or re-subscribe to alert emails.
            </p>
          </div>
        )}

        {status === "subscribed" && (
          <>
            <p className="mb-6 text-slate-600">
              You are currently subscribed to receive alerts on{" "}
              <span className="font-mono text-slate-900">{recipient}</span>.
            </p>
            {errorMessage && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={pending}
              className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {pending ? "Unsubscribing…" : "Unsubscribe me"}
            </button>
          </>
        )}

        {status === "unsubscribed" && (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">
                You are unsubscribed.
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                No further alerts will be sent to{" "}
                <span className="font-mono">{recipient}</span> ({channelLabel}).
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleResubscribe}
                disabled={pending}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending ? "Re-subscribing…" : "Re-subscribe"}
              </button>
              <Link
                href="/"
                className="text-center text-sm text-slate-600 hover:text-blue-600 hover:underline"
              >
                Back to home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function detectChannel(recipient: string): "email" | "whatsapp" {
  return /^\d+$|^\+/.test(recipient.trim()) ? "whatsapp" : "email";
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          Loading…
        </div>
      }
    >
      <UnsubscribePageContent />
    </Suspense>
  );
}
