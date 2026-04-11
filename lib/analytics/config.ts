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
