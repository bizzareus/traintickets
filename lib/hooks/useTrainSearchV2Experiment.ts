"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

const EXPERIMENT_FLAG_KEY = "skyscanner-led-ui-search";

/**
 * Hook to evaluate PostHog experiment for the new Skyscanner-style Train Search V2 UI.
 *
 * PostHog Evaluation:
 * Evaluates 'skyscanner-led-ui-search' === 'skyscanner-search' ONLY on the homepage ('/').
 *
 * Supports URL param override (`?exp=skyscanner-search`, `?exp=control`) and
 * `localStorage.getItem("exp_train_search_v2")` for local development & testing.
 */
export function useTrainSearchV2Experiment() {
  const pathname = usePathname();
  const posthogVariant = useFeatureFlagVariantKey(EXPERIMENT_FLAG_KEY);
  const [overrideVariant] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    const expParam = urlParams.get("exp");
    if (expParam) return expParam;
    return window.localStorage.getItem("exp_train_search_v2");
  });

  return useMemo(() => {
    // Only run on the homepage
    const isHomepage =
      pathname === "/" ||
      (typeof window !== "undefined" && window.location.pathname === "/");

    // Check allowed hostnames (lastberth.com, subdomains, or localhost for dev)
    const isAllowedHost =
      typeof window === "undefined" ||
      window.location.hostname === "lastberth.com" ||
      window.location.hostname.endsWith(".lastberth.com") ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // If not on homepage or disallowed host (and no explicit override), fallback safely to control
    if ((!isHomepage || !isAllowedHost) && !overrideVariant) {
      return {
        isTrainSearchV2: false,
        variant: "control",
      };
    }

    const activeVariant = overrideVariant ?? posthogVariant;
    const isTrainSearchV2 =
      activeVariant === "skyscanner-search" ||
      activeVariant === "skyscanner-led-ui-search" ||
      activeVariant === "v2" ||
      activeVariant === "test" ||
      activeVariant === "true" ||
      activeVariant === true;

    return {
      isTrainSearchV2,
      variant: activeVariant ?? "control",
    };
  }, [pathname, posthogVariant, overrideVariant]);
}
