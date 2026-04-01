// This file configures the Sentry browser SDK. It runs in the client bundle only.
import * as Sentry from "@sentry/nextjs";

function clientTracesSampleRate(): number {
  const raw = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  return process.env.NODE_ENV === "production" ? 0.2 : 1;
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
      process.env.NODE_ENV ||
      "development",
    tracesSampleRate: clientTracesSampleRate(),
  });
}
