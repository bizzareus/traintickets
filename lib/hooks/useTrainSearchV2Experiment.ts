"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { posthog } from "@/lib/analytics/posthog-client";

const EXPERIMENT_FLAG_KEY = "skyscanner-led-ui-search";

/**
 * Hook to evaluate PostHog experiment for the new Skyscanner-style Train Search V2 UI.
 *
 * PostHog Evaluation:
 * if (posthog.getFeatureFlag('skyscanner-led-ui-search') === 'skyscanner-search') {
 *   // Enable Skyscanner-style train search
 * } else {
 *   // Default to safe control variant
 * }
 *
 * Scoping: Only active on the homepage ('/').
 * Supports overrides for testing:
 * - URL query: ?exp=skyscanner-search or ?skyscanner-led-ui-search=skyscanner-search
 * - localStorage: localStorage.setItem("exp_train_search_v2", "skyscanner-search")
 * - Console: posthog.featureFlags.override({'skyscanner-led-ui-search': 'skyscanner-search'})
 */
export function useTrainSearchV2Experiment() {
  const pathname = usePathname();
  const reactPosthogVariant = useFeatureFlagVariantKey(EXPERIMENT_FLAG_KEY);
  const [directVariant, setDirectVariant] = useState<string | boolean | null>(
    () => {
      if (typeof window === "undefined") return null;
      try {
        const val = posthog.getFeatureFlag(EXPERIMENT_FLAG_KEY);
        return val !== undefined ? val : null;
      } catch {
        return null;
      }
    },
  );

  const [overrideVariant] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    const expParam =
      urlParams.get("exp") ||
      urlParams.get("skyscanner-led-ui-search") ||
      urlParams.get("variant");
    if (expParam) return expParam;

    return (
      window.localStorage.getItem("exp_train_search_v2") ||
      window.localStorage.getItem("skyscanner-led-ui-search")
    );
  });

  // Re-read flag when PostHog receives or re-evaluates flags from the network
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readFlag = () => {
      try {
        const val = posthog.getFeatureFlag(EXPERIMENT_FLAG_KEY);
        if (val !== undefined) {
          setDirectVariant(val);
        }
      } catch {
        /* ignore */
      }
    };

    readFlag();
    const unsub = posthog.onFeatureFlags(() => {
      readFlag();
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  return useMemo(() => {
    // Only run on the homepage
    const isHomepage =
      pathname === "/" ||
      (typeof window !== "undefined" &&
        (window.location.pathname === "/" || window.location.pathname === ""));

    // If not on homepage (and no explicit URL override), fallback safely to control
    if (!isHomepage && !overrideVariant) {
      return {
        isTrainSearchV2: false,
        variant: "control",
      };
    }

    const activeVariant =
      overrideVariant ?? directVariant ?? reactPosthogVariant;

    const isTrainSearchV2 =
      activeVariant === "skyscanner-search" ||
      activeVariant === "skyscanner-led-ui-search" ||
      activeVariant === "v2" ||
      activeVariant === "test" ||
      activeVariant === "true" ||
      activeVariant === true;

    return {
      isTrainSearchV2,
      variant:
        typeof activeVariant === "string" ? activeVariant : activeVariant ? "skyscanner-search" : "control",
    };
  }, [pathname, overrideVariant, directVariant, reactPosthogVariant]);
}
