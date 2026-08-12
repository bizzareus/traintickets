"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { useState } from "react";

const EXPERIMENT_FLAG_KEY = "auto-search-all-classes";

/**
 * Hook to evaluate PostHog experiment for the new Auto-Search train UI.
 *
 * Supports URL param override (`?exp=variant-a` or `?exp=control`) and
 * `localStorage.getItem("exp_auto_search")` for local development & testing.
 */
export function useAutoSearchExperiment() {
  const posthogVariant = useFeatureFlagVariantKey(EXPERIMENT_FLAG_KEY);
  const [overrideVariant] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    const expParam = urlParams.get("exp");
    if (expParam) return expParam;
    return window.localStorage.getItem("exp_auto_search");
  });

  const activeVariant = overrideVariant ?? posthogVariant;
  const isVariantA =
    activeVariant === "variant-a" ||
    activeVariant === "variant_a" ||
    activeVariant === "test" ||
    activeVariant === "true" ||
    activeVariant === true;

  return {
    isVariantA,
    variant: activeVariant ?? "control",
  };
}
