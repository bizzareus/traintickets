import { isAnalyticsEnabled } from "./config";
import type { AnalyticsEvent } from "./events";
import { posthog } from "./posthog-client";

/**
 * Send a typed product event to PostHog. Uses the shared client; events queue
 * until `initPosthogBrowser` runs. Never throws — uncaught errors here would
 * break the page.
 */
export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;

  const isAdminPath = window.location.pathname.startsWith("/admin");
  const isAdminUser = window.localStorage.getItem("admin") === "true";
  if (isAdminPath || isAdminUser) return;
  try {
    posthog.capture(
      event.name,
      event.properties as Record<string, unknown>,
    );
    // Also track to Google Analytics if gtag is defined
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag === "function") {
      gtag("event", event.name, event.properties);
    }
  } catch {
    /* ignore */
  }
}

/** Context attached to a captured backend/API error. */
export type ApiExceptionContext = {
  method?: string;
  url?: string;
  status?: number;
  message?: string;
  responseMessage?: string;
};

/**
 * Report a backend/API failure to PostHog error tracking (`captureException`,
 * falling back to a `$exception` event on older clients). Browser-only and
 * admin-suppressed, like product events; never throws.
 */
export function captureApiException(
  error: unknown,
  context: ApiExceptionContext = {},
): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;

  const isAdminPath = window.location.pathname.startsWith("/admin");
  const isAdminUser = window.localStorage.getItem("admin") === "true";
  if (isAdminPath || isAdminUser) return;

  try {
    const err =
      error instanceof Error
        ? error
        : new Error(
            context.responseMessage ||
              context.message ||
              `API error${context.status ? ` ${context.status}` : ""}`,
          );
    const properties: Record<string, unknown> = {
      source: "backend_api",
      api_method: context.method,
      api_url: context.url,
      api_status: context.status ?? 0,
      api_message: context.responseMessage || context.message,
      is_server_error: (context.status ?? 0) >= 500 || !context.status,
    };
    const ph = posthog as unknown as {
      captureException?: (e: unknown, p?: Record<string, unknown>) => void;
      capture: (name: string, p?: Record<string, unknown>) => void;
    };
    if (typeof ph.captureException === "function") {
      ph.captureException(err, properties);
    } else {
      ph.capture("$exception", {
        $exception_message: err.message,
        $exception_type: "ApiError",
        ...properties,
      });
    }
  } catch {
    /* ignore */
  }
}
