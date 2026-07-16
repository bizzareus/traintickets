import { cache } from "react";
import { listChartTimesIndex, slugifyTrainName } from "./chartTimes";

/**
 * Server-only helpers for SEO-friendly train detail URLs
 * (`/trains/12015-ajmer-shatabdi` instead of `/trains/12015`).
 *
 * Train names come from the committed chart-times dataset
 * (content/chart-times/*.json — ~1.4k trains), so slugs resolve at build
 * time without depending on the backend API being reachable.
 */

export type TrainIndexEntry = {
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
  /** Slug of the matching /chart-times/ page (e.g. `12015-ajmer-shatabdi-chart-times`). */
  chartTimesSlug: string;
};

/** Cached map of trainNumber -> local train metadata. */
export const getTrainIndex = cache((): Map<string, TrainIndexEntry> => {
  const map = new Map<string, TrainIndexEntry>();
  for (const t of listChartTimesIndex()) {
    if (!t.trainNumber) continue;
    map.set(String(t.trainNumber), {
      trainNumber: String(t.trainNumber),
      trainName: t.trainName,
      originStation: t.originStation,
      destinationStation: t.destinationStation,
      chartTimesSlug: t.slug,
    });
  }
  return map;
});

/** `12015` + `Ajmer Shatabdi` -> `12015-ajmer-shatabdi`. */
export function buildTrainSlug(trainNumber: string, trainName?: string | null): string {
  const num = String(trainNumber || "").trim();
  const namePart = trainName ? slugifyTrainName(trainName) : "";
  return namePart ? `${num}-${namePart}` : num;
}

/** Extract the leading train number from a `/trains/[id]` param (`12015-ajmer-shatabdi` -> `12015`). */
export function parseTrainNumberFromParam(id: string): string | null {
  const m = String(id || "").match(/^(\d{3,6})(?:-|$)/);
  return m ? m[1] : null;
}
