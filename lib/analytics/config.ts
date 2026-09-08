/**
 * Set NEXT_PUBLIC_POSTHOG_KEY in .env for analytics.
 * Optional: NEXT_PUBLIC_POSTHOG_HOST (default US ingest: https://us.i.posthog.com).
 * EU: https://eu.i.posthog.com
 */
export function isAnalyticsEnabled(): boolean {
  return Boolean(
    typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim(),
  );
}

export function posthogApiHost(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
    "https://us.i.posthog.com"
  );
}

const ANALYTICS_DEBUG_KEY = "analytics_debug";

/**
 * Console debug mode for analytics. Enable once via `?analytics_debug=1`
 * (persists in localStorage); disable with `?analytics_debug=0` or by
 * removing the key. When on, every tracked event — and every silently
 * dropped one, with its reason — is logged as `[analytics] ...`.
 */
export function isAnalyticsDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get(
      "analytics_debug",
    );
    if (param === "1") {
      window.localStorage.setItem(ANALYTICS_DEBUG_KEY, "1");
      return true;
    }
    if (param === "0") {
      window.localStorage.removeItem(ANALYTICS_DEBUG_KEY);
      return false;
    }
    return window.localStorage.getItem(ANALYTICS_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** console.info wrapper that only emits when analytics debug mode is on. */
export function debugLogAnalytics(...args: unknown[]): void {
  if (!isAnalyticsDebug()) return;
  try {
    console.info("[analytics]", ...args);
  } catch {
    /* ignore */
  }
}
