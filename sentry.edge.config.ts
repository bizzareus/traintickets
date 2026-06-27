// Sentry for Next.js Edge runtime (middleware, edge routes).
import * as Sentry from "@sentry/nextjs";
import { isLocalhostHostname, isLocalhostUrl } from "@/lib/observability";

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
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,
    beforeSend: (event) => (isLocalhostEvent(event) ? null : event),
    beforeSendTransaction: (event) =>
      isLocalhostEvent(event) ? null : event,
  });
}
