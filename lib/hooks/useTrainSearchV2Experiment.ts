"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { useState } from "react";

const EXPERIMENT_FLAG_KEY = "train-search-v2";

/**
 * Hook to evaluate PostHog experiment for the new Skyscanner-style Train Search V2 UI.
 *
 * Supports URL param override (`?exp=train-search-v2`, `?exp=variant-a`, or `?exp=control`) and
 * `localStorage.getItem("exp_train_search_v2")` for local development & testing.
 */
export function useTrainSearchV2Experiment() {
  const posthogVariant = useFeatureFlagVariantKey(EXPERIMENT_FLAG_KEY);
  const [overrideVariant] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    const expParam = urlParams.get("exp");
    if (expParam) return expParam;
    return window.localStorage.getItem("exp_train_search_v2");
  });

  const activeVariant = overrideVariant ?? posthogVariant;
  const isTrainSearchV2 =
    activeVariant === "train-search-v2" ||
    activeVariant === "train_search_v2" ||
    activeVariant === "v2" ||
    activeVariant === "test" ||
    activeVariant === "true" ||
    activeVariant === true;

  return {
    isTrainSearchV2,
    variant: activeVariant ?? "control",
  };
}
