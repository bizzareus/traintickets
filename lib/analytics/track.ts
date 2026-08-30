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

/**
 * Identify a user in PostHog when contact information is provided (e.g. on alert request).
 * Sets person properties so all subsequent and previous session events are attributed to this user.
 * Browser-only and admin-suppressed; never throws.
 */
export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;

  const isAdminPath = window.location.pathname.startsWith("/admin");
  const isAdminUser = window.localStorage.getItem("admin") === "true";
  if (isAdminPath || isAdminUser) return;

  try {
    const trimmedId = distinctId.trim();
    if (!trimmedId) return;

    posthog.identify(trimmedId, properties);
  } catch {
    /* ignore */
  }
}

/**
 * Convenience helper to identify user from email and/or mobile.
 * Uses email (lowercase) if available, otherwise mobile as distinct_id.
 */
export function identifyFromContact(params: {
  email?: string;
  mobile?: string;
  name?: string;
}): void {
  const email = params.email?.trim().toLowerCase();
  const mobile = params.mobile?.trim();
  const distinctId = email || mobile;

  if (!distinctId) return;

  const personProperties: Record<string, unknown> = {};
  if (email) personProperties.email = email;
  if (mobile) {
    personProperties.phone = mobile;
    personProperties.mobile = mobile;
  }
  if (params.name?.trim()) {
    personProperties.name = params.name.trim();
  }

  identifyUser(distinctId, personProperties);
}

/**
 * Convenience helper to track an alert requested event to PostHog asynchronously.
 */
export function trackAlertRequested(params: {
  success: boolean;
  source:
    | "shortlink_subscribe"
    | "chart_times_cta"
    | "chart_times_row"
    | "gap_leg_modal"
    | "search_entire_journey"
    | "search_train_card_right"
    | "search_panel"
    | "live_scraper_cockpit"
    | "v1_page";
  trainNumber: string;
  trainName?: string;
  fromCode: string;
  toCode: string;
  journeyDate: string;
  classCode?: string;
  email?: string;
  mobile?: string;
  hasEmail?: boolean;
  hasMobile?: boolean;
  sourcePage?: string;
  error?: string;
}): void {
  if (params.email || params.mobile) {
    identifyFromContact({
      email: params.email,
      mobile: params.mobile,
    });
  }

  trackAnalyticsEvent({
    name: "alert_requested",
    properties: {
      success: params.success,
      source: params.source,
      source_page:
        params.sourcePage ||
        (typeof window !== "undefined" ? window.location.pathname : undefined),
      train_number: params.trainNumber,
      train_name: params.trainName,
      from_code: params.fromCode,
      to_code: params.toCode,
      journey_date: params.journeyDate,
      class_code: params.classCode,
      has_email: params.hasEmail ?? Boolean(params.email),
      has_mobile: params.hasMobile ?? Boolean(params.mobile),
      error: params.error,
    },
  });
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
