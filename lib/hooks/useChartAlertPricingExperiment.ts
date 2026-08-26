"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { useState } from "react";

const EXPERIMENT_FLAG_KEY = "chart-alert-pricing-experiment";

/**
 * Hook to evaluate PostHog A/B experiment for Chart Alert Pricing (Paid Fake Door vs Free).
 *
 * Supports:
 * - URL param override (`?alert_exp=paid`, `?alert_exp=control`, or `?exp=paid`)
 * - `localStorage.getItem("exp_chart_alert_pricing")`
 * - PostHog feature flag (`chart-alert-pricing-experiment`)
 * - Deterministic client-side 50/50 fallback if flag is not set yet.
 */
export function useChartAlertPricingExperiment() {
  const posthogVariant = useFeatureFlagVariantKey(EXPERIMENT_FLAG_KEY);
  const [overrideVariant] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    const urlParams = new URLSearchParams(window.location.search);
    const expParam =
      urlParams.get("alert_exp") ||
      urlParams.get("alert_pricing") ||
      urlParams.get("exp");

    if (expParam) {
      return expParam;
    }

    const stored = window.localStorage.getItem("exp_chart_alert_pricing");
    if (stored) {
      return stored;
    }

    // Stable 50/50 fallback bucket if flag is unassigned
    let userBucket = window.localStorage.getItem("chart_alert_exp_bucket");
    if (!userBucket) {
      userBucket = Math.random() < 0.5 ? "control" : "paid";
      try {
        window.localStorage.setItem("chart_alert_exp_bucket", userBucket);
      } catch {
        /* ignore localStorage quota/disabled errors */
      }
    }
    return userBucket;
  });

  const activeVariant = overrideVariant ?? posthogVariant;
  const isPaidVariant =
    activeVariant === "paid" ||
    activeVariant === "variant-a" ||
    activeVariant === "variant_a" ||
    activeVariant === "test" ||
    activeVariant === "true";

  return {
    isPaidVariant,
    variant: isPaidVariant ? ("paid" as const) : ("control" as const),
  };
}
