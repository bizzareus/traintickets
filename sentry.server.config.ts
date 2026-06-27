// This file configures Sentry for the Node.js server (SSR, RSC, route handlers).
import * as Sentry from "@sentry/nextjs";
import { isLocalhostHostname, isLocalhostUrl } from "@/lib/observability";

function serverTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  return process.env.NODE_ENV === "production" ? 0.2 : 1;
}

/** Drop events/traces for requests served from a localhost host. */
function isLocalhostEvent(event: { request?: { url?: string }; server_name?: string }): boolean {
  return (
    isLocalhostUrl(event.request?.url) || isLocalhostHostname(event.server_name)
  );
}

const dsn =
  process.env.SENTRY_DSN?.trim() ||
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.NODE_ENV ||
      "development",
    tracesSampleRate: serverTracesSampleRate(),
    beforeSend: (event) => (isLocalhostEvent(event) ? null : event),
    beforeSendTransaction: (event) =>
      isLocalhostEvent(event) ? null : event,
  });
}
