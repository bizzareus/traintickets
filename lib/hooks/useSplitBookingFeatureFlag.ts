"use client";

import { useSyncExternalStore } from "react";
import { useFeatureFlagEnabled } from "@posthog/react";

export const SPLIT_BOOKING_FEATURE_FLAG = "split-ticket-assisted-booking";

function getOverride(): boolean | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const value =
      params.get("assisted_booking") ??
      params.get("split_booking") ??
      window.localStorage.getItem("exp_split_booking");
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  } catch {
    // Storage can be unavailable; the PostHog flag still controls rollout.
  }
  return null;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
  };
}

const getServerSnapshot = () => null;

/** PostHog rollout with explicit testing overrides; independent of admin state. */
export function useSplitBookingFeatureFlag(): boolean {
  const enabled = useFeatureFlagEnabled(SPLIT_BOOKING_FEATURE_FLAG);
  const override = useSyncExternalStore(
    subscribe,
    getOverride,
    getServerSnapshot,
  );
  return override ?? enabled === true;
}
