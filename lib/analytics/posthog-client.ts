import posthog from "posthog-js";
import { isAnalyticsEnabled, posthogApiHost } from "./config";

/**
 * Lazy browser init: call from a client `useEffect` after the first commit so
 * PostHog does not inject scripts (e.g. surveys) while React is still hydrating
 * server HTML — that DOM churn caused mismatches next to JSON-LD in layout.
 * Events before init queue on the shared client.
 */
const POSTHOG_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? ""
    : "";

declare global {
  interface Window {
    /** Set after init so DevTools can run `posthog.debug()` like the snippet does. */
    posthog?: typeof posthog;
  }
}

let initCalled = false;

export function initPosthogBrowser(): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled() || !POSTHOG_KEY)
    return;
  if (initCalled) return;
  initCalled = true;

  try {
    if (!(posthog as { __loaded?: boolean }).__loaded) {
      posthog.init(POSTHOG_KEY, {
        api_host: posthogApiHost(),
        capture_pageview: false,
        capture_pageleave: true,
        enable_recording_console_log: true,
        persistence: "localStorage+cookie",
      });
    }
    window.posthog = posthog;
  } catch (err) {
    initCalled = false;
    console.warn("[analytics] PostHog init failed", err);
  }
}

export { posthog };
