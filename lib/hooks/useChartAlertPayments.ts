"use client";

import { useSyncExternalStore } from "react";
import { useFeatureFlagEnabled } from "@posthog/react";
import { isAdminUser } from "@/lib/admin";

export const CHART_ALERT_PAYMENTS_FLAG_KEY = "chart-alert-payments";

export interface UseChartAlertPaymentsResult {
  /**
   * Whether payments are required for chart alerts.
   * True by default in normal production rollout.
   * False when the PostHog kill switch is disabled (false), or for admins/overrides.
   */
  paymentsEnabled: boolean;
  /**
   * Whether chart alerts should be created for free.
   * True if paymentsEnabled is false.
   */
  isFreeAlerts: boolean;
  /**
   * True if current user is an admin.
   */
  isAdmin: boolean;
  /**
   * True if the kill switch specifically triggered the free alert mode
   * (via PostHog flag disabled or query/localStorage override).
   */
  isKillSwitchActive: boolean;
  /**
   * Helper to format the submit/action button label cleanly.
   */
  getButtonLabel: (options: {
    loading: boolean;
    price: number;
    verb?: "set" | "subscribe";
  }) => string;
}

function checkUrlOrStorageOverrides(): boolean | null {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const paymentsParam =
      params.get("payments")?.toLowerCase() ||
      params.get("chart_payments")?.toLowerCase();

    if (
      paymentsParam === "false" ||
      paymentsParam === "0" ||
      paymentsParam === "off"
    ) {
      return true; // kill switch forced ON (free alerts)
    }
    if (
      paymentsParam === "true" ||
      paymentsParam === "1" ||
      paymentsParam === "on"
    ) {
      return false; // payments forced ON
    }

    const freeParam =
      params.get("free_alerts")?.toLowerCase() ||
      params.get("free_alert")?.toLowerCase();

    if (freeParam === "true" || freeParam === "1") {
      return true; // kill switch forced ON (free alerts)
    }

    if (
      window.localStorage.getItem("kill_chart_payments") === "true" ||
      window.localStorage.getItem("free_chart_alerts") === "true"
    ) {
      return true;
    }
  } catch {
    // Ignore storage/URL parsing issues
  }
  return null;
}

function subscribeStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getAdminSnapshot(): boolean {
  return isAdminUser();
}

function getOverrideSnapshot(): boolean | null {
  return checkUrlOrStorageOverrides();
}

function getFalseServerSnapshot(): boolean {
  return false;
}

function getNullServerSnapshot(): null {
  return null;
}

export function useChartAlertPayments(): UseChartAlertPaymentsResult {
  const admin = useSyncExternalStore(
    subscribeStorage,
    getAdminSnapshot,
    getFalseServerSnapshot,
  );

  const override = useSyncExternalStore(
    subscribeStorage,
    getOverrideSnapshot,
    getNullServerSnapshot,
  );

  // Read the PostHog feature flag:
  // - Returns `true` when active (payments enabled, normal rollout)
  // - Returns `false` when disabled in PostHog (kill switch active -> FREE alerts)
  // - Returns `undefined` while loading or uninitialized
  const flagEnabled = useFeatureFlagEnabled(CHART_ALERT_PAYMENTS_FLAG_KEY);

  // Kill switch is active if URL/storage override enabled it OR if PostHog flag is explicitly false
  const isKillSwitchActive = override === true || flagEnabled === false;

  // Force payments if URL/storage override explicitly specified payments=true
  const forcePayments = override === false;

  // Alerts are free if admin or if kill switch is active (and not explicitly forced to paid)
  const isFreeAlerts = admin || (!forcePayments && isKillSwitchActive);

  const paymentsEnabled = !isFreeAlerts;

  const getButtonLabel = ({
    loading,
    price,
    verb = "set",
  }: {
    loading: boolean;
    price: number;
    verb?: "set" | "subscribe";
  }): string => {
    if (loading) {
      return isFreeAlerts ? "Setting up…" : "Opening payment…";
    }

    if (admin) {
      return "Set alert free (admin)";
    }

    if (isFreeAlerts) {
      return verb === "subscribe" ? "Set free alert" : "Set alert (free)";
    }

    return verb === "subscribe"
      ? `Pay ₹${price} & subscribe`
      : `Pay ₹${price} & set alert`;
  };

  return {
    paymentsEnabled,
    isFreeAlerts,
    isAdmin: admin,
    isKillSwitchActive,
    getButtonLabel,
  };
}
