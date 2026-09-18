"use client";

import { useFeatureFlagEnabled } from "@posthog/react";
import { useState } from "react";

export const SPLIT_BOOKING_FEATURE_FLAG = "split-ticket-assisted-booking";

/**
 * Hook to evaluate whether the split ticket assisted booking flow (unified "Book Now"
 * + passenger form + Razorpay checkout + Playwright TripMgt automation) is enabled.
 *
 * Supports query params (`?assisted_booking=1` / `?split_booking=true`) and
 * `localStorage.getItem("exp_split_booking")` for local development & manual testing.
 */
export function useSplitBookingFeatureFlag(): boolean {
  const posthogEnabled = useFeatureFlagEnabled(SPLIT_BOOKING_FEATURE_FLAG);

  const [override] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    const param =
      urlParams.get("assisted_booking") ?? urlParams.get("split_booking");
    if (param === "true" || param === "1") return true;
    if (param === "false" || param === "0") return false;

    const stored = window.localStorage.getItem("exp_split_booking");
    if (stored === "true" || stored === "1") return true;
    if (stored === "false" || stored === "0") return false;

    return null;
  });

  return override ?? Boolean(posthogEnabled);
}
