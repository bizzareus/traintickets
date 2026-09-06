"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { posthog } from "@/lib/analytics/posthog-client";

const EXPERIMENT_FLAG_KEY = "skyscanner-search";

/**
 * Hook to evaluate PostHog experiment for the new Skyscanner-style Train Search V2 UI.
 *
 * PostHog Evaluation:
 * posthog.onFeatureFlags(function() {
 *   if (posthog.getFeatureFlag('skyscanner-search') == 'new-search') {
 *     // do something
 *   }
 * });
 *
 * Scoping: Only active on the homepage ('/').
 * Supports overrides for testing:
 * - URL query: ?exp=new-search or ?skyscanner-search=new-search
 * - localStorage: localStorage.setItem("exp_train_search_v2", "new-search")
 * - Console: posthog.featureFlags.override({'skyscanner-search': 'new-search'})
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
      urlParams.get("skyscanner-search") ||
      urlParams.get("variant");
    if (expParam) return expParam;

    return (
      window.localStorage.getItem("exp_train_search_v2") ||
      window.localStorage.getItem("skyscanner-search")
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
      activeVariant === "new-search" ||
      activeVariant === "true" ||
      activeVariant === true;

    return {
      isTrainSearchV2,
      variant:
        typeof activeVariant === "string"
          ? activeVariant
          : activeVariant
            ? "new-search"
            : "control",
    };
  }, [pathname, overrideVariant, directVariant, reactPosthogVariant]);
}
