"use client";

import { PostHogProvider } from "@posthog/react";
import { type ReactNode, useMemo } from "react";
import { isAnalyticsEnabled, posthogApiHost } from "@/lib/analytics";
import { PostHogPageView } from "./PostHogPageView";

const POSTHOG_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? ""
    : "";

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const options = useMemo(
    () => ({
      api_host: posthogApiHost(),
      capture_pageview: false,
      capture_pageleave: true,
      enable_recording_console_log: true,
      persistence: "localStorage+cookie" as const,
    }),
    [],
  );

  if (!isAnalyticsEnabled() || !POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider apiKey={POSTHOG_KEY} options={options}>
      <PostHogPageView />
      {children}
    </PostHogProvider>
  );
}
