"use client";

import { useMemo } from "react";
import { useFeatureFlagEnabled, useFeatureFlagPayload } from "@posthog/react";
import {
  CHART_ALERT_PRICES_FLAG_KEY,
  chartAlertPriceForClass,
  parseChartAlertPriceOverrides,
  type ChartAlertPriceOverrides,
} from "@/lib/chart-alert-payments";

/**
 * Per-class chart-alert price overrides from the PostHog
 * `chart-alert-prices` flag payload, or null when the flag is off /
 * still loading / malformed (hardcoded defaults apply).
 */
export function useChartAlertPriceOverrides(): ChartAlertPriceOverrides | null {
  const enabled = useFeatureFlagEnabled(CHART_ALERT_PRICES_FLAG_KEY);
  const payload = useFeatureFlagPayload(CHART_ALERT_PRICES_FLAG_KEY);
  return useMemo(
    () => (enabled ? parseChartAlertPriceOverrides(payload) : null),
    [enabled, payload],
  );
}

/**
 * Display price for a chart alert in the given class (backend enforces the
 * actual charge). Falls back to ₹100 while flags load or when unconfigured.
 */
export function useChartAlertPrice(classCode?: string | null): number {
  const overrides = useChartAlertPriceOverrides();
  return chartAlertPriceForClass(classCode, overrides);
}
