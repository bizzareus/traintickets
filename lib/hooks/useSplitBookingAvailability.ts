"use client";

import { useEffect, useState } from "react";
import type { AlternateLeg } from "@/components/booking-v2/alternatePathsTypes";
import { checkSplitBookingAvailability } from "@/lib/split-booking";
import {
  applyLegAvailability,
  getLegClassOptions,
} from "@/lib/splitBookingSelection";

export function useSplitBookingAvailability({
  trainNumber,
  journeyDate,
  legs,
  enabled,
}: {
  trainNumber: string;
  journeyDate: string;
  legs: AlternateLeg[];
  enabled: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([trainNumber, journeyDate, legs]);
  const [state, setState] = useState<{
    key: string;
    results: Record<
      number,
      ReturnType<typeof applyLegAvailability> & { attempt: number }
    >;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // Each leg starts independently; the existing API checks its classes concurrently.
    void Promise.allSettled(
      legs.map(async (leg, index) => {
        const options = getLegClassOptions(leg);
        if (!options.length) return;
        const legTrain = leg.trainNumber || trainNumber;
        const boardingDate = leg.boardingDate || journeyDate;
        const response = await checkSplitBookingAvailability(
          {
            trainNumber: legTrain,
            quota: "GN",
            legs: options.map((option) => ({
              from: leg.from,
              to: leg.to,
              trainNumber: legTrain,
              travelClass: option.travelClass,
              boardingDate,
            })),
          },
          controller.signal,
        ).catch(() => null);
        if (!controller.signal.aborted) {
          setState((current) => {
            const results = current?.key === key ? current.results : {};
            const previousLeg = results[index]?.leg ?? leg;
            const result = response && Array.isArray(response.legs)
              ? applyLegAvailability(
                  previousLeg,
                  legTrain,
                  boardingDate,
                  response.legs,
                )
              : { leg: previousLeg, failed: true };
            return {
              key,
              results: { ...results, [index]: { ...result, attempt } },
            };
          });
        }
      }),
    );
    return () => controller.abort();
  }, [enabled, key, legs, trainNumber, journeyDate, attempt]);

  const results = state?.key === key ? state.results : {};
  const refreshingLegs = new Set<number>();
  const failedLegs = new Set<number>();
  const liveLegs = legs.map((leg, index) => {
    const current = results[index]?.attempt === attempt;
    if (enabled && getLegClassOptions(leg).length && !current) {
      refreshingLegs.add(index);
    }
    if (current && results[index]?.failed) failedLegs.add(index);
    return results[index]?.leg ?? leg;
  });
  return {
    legs: liveLegs,
    refreshingLegs,
    failedLegs,
    retry: () => setAttempt((current) => current + 1),
  };
}
