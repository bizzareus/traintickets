"use client";

import { PostHogProvider } from "@posthog/react";
import { type ReactNode, useEffect } from "react";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { initPosthogBrowser, posthog } from "@/lib/analytics/posthog-client";
import { PostHogPageView } from "./PostHogPageView";

const POSTHOG_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? ""
    : "";

/**
 * Init runs in useEffect (after hydration) so injected SDK scripts do not alter
 * the DOM mid-hydrate. Parent effects run before child effects, so pageview
 * capture still sees an initialized client. `client={posthog}` avoids a second init from the provider.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPosthogBrowser();
  }, []);

  if (!isAnalyticsEnabled() || !POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PostHogProvider>
  );
}
