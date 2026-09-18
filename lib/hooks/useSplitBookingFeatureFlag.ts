"use client";

import { useSyncExternalStore } from "react";
import { isAdminUser } from "@/lib/admin";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  return isAdminUser();
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Hook to evaluate whether the split ticket assisted booking flow (unified "Book Now"
 * + passenger form + Razorpay checkout + Playwright TripMgt automation) is enabled.
 *
 * RESTRICTION: Enabled ONLY if `localStorage.getItem("admin") === "true"` (or ?admin=1).
 * Otherwise, the app continues to display the original IRCTC per-leg booking redirects.
 */
export function useSplitBookingFeatureFlag(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
