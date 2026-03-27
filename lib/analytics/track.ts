import posthog from "posthog-js";
import { isAnalyticsEnabled } from "./config";
import type { AnalyticsEvent } from "./events";

/**
 * Send a typed product event to PostHog. Safe to call before init (queued) or
 * when analytics is disabled (no-op).
 */
export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  posthog.capture(
    event.name,
    event.properties as Record<string, unknown>,
  );
}
