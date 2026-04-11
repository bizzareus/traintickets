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
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", event.name, event.properties);
    }
  } catch {
    /* ignore */
  }
}
