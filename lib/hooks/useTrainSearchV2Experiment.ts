"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { useState } from "react";

const EXPERIMENT_FLAG_KEY = "skyscanner-led-ui-search";

/**
 * Hook to evaluate PostHog experiment for the new Skyscanner-style Train Search V2 UI.
 *
 * PostHog Evaluation:
 * posthog.getFeatureFlag('skyscanner-led-ui-search') === 'skyscanner-search'
 *
 * Supports URL param override (`?exp=skyscanner-search`, `?exp=skyscanner-led-ui-search`, `?exp=control`) and
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
}
