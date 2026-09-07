/**
 * Hook providing Train Search V2 UI state.
 * Permanently enabled as the default search experience.
 */
export function useTrainSearchV2Experiment() {
  return {
    isTrainSearchV2: true,
    variant: "new-search",
  };
}

