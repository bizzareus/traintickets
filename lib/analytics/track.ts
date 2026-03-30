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
  try {
    posthog.capture(
      event.name,
      event.properties as Record<string, unknown>,
    );
  } catch {
    /* ignore */
  }
}
