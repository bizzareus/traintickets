import { cache } from "react";
const reactCache =
  typeof cache === "function"
    ? cache
    : <T extends (...args: unknown[]) => unknown>(fn: T): T => fn;
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
export const getTrainIndex = reactCache((): Map<string, TrainIndexEntry> => {
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

/**
 * The original 89 pre-rendered train numbers. Kept first in the top-N list so
 * their (already indexed) URLs remain stable across builds.
 */
export const CORE_TRAIN_NUMBERS = [
  "1080", "11013", "11301", "1144",
  "12001", "12002", "12003", "12004", "12005", "12006", "12007", "12008",
  "12009", "12010", "12011", "12012", "12013", "12014", "12015", "12016",
  "12017", "12018", "12019", "12020", "12025", "12026", "12027", "12028",
  "12029", "12030", "12031", "12032", "12033", "12034", "12035", "12036",
  "12037", "12038", "12039", "12040", "12041", "12042", "12043", "12044",
  "12045", "12046", "12047", "12048", "12049", "12050", "12085", "12086",
  "12087", "12088", "12243", "12244", "12262", "12277", "12278", "12301",
  "12302", "12310", "12314", "12381", "12394", "12425", "12445", "12607",
  "12608", "12616", "12847", "12848", "12931", "12952", "12954", "12958",
  "13107", "13108", "13109", "13110", "13129", "13130", "19020", "20977",
  "20978", "22119", "22120", "22439", "22637",
];

/** Temporary/seasonal special trains — poor evergreen SEO pages, excluded from top-N. */
const SPECIAL_TRAIN_RE = /\bspl\b|special|festive|kumbh|suvidha/i;

/** Higher = more searched-for train category. Deterministic, name-based. */
function trainCategoryScore(trainName: string): number {
  const n = trainName.toLowerCase();
  if (SPECIAL_TRAIN_RE.test(n)) return 0;
  if (n.includes("vande bharat")) return 100;
  if (n.includes("rajdhani")) return 95;
  if (n.includes("jan shatabdi")) return 82;
  if (n.includes("shatabdi")) return 90;
  if (n.includes("duronto")) return 85;
  if (n.includes("tejas")) return 85;
  if (n.includes("garib")) return 80;
  if (n.includes("humsafar")) return 78;
  if (n.includes("amrit")) return 78;
  if (n.includes("sampark")) return 75;
  if (n.includes("double deck")) return 72;
  if (n.includes("intercity")) return 65;
  if (/\bexp\b|express/.test(n)) return 50;
  return 20;
}

/**
 * Deterministic "top N trains" list of slugged `/trains/[id]` params:
 * the stable core set first, then the local dataset ranked by category
 * (premium named trains, then superfast expresses), ties broken by number.
 */
export const getTopTrainSlugs = reactCache((limit: number = 500): string[] => {
  const index = getTrainIndex();
  const slugs: string[] = [];
  const seen = new Set<string>();

  for (const num of CORE_TRAIN_NUMBERS) {
    seen.add(num);
    slugs.push(buildTrainSlug(num, index.get(num)?.trainName));
  }

  const ranked = [...index.values()]
    .filter((t) => !seen.has(t.trainNumber) && trainCategoryScore(t.trainName) > 0)
    .sort((a, b) => {
      const diff = trainCategoryScore(b.trainName) - trainCategoryScore(a.trainName);
      if (diff !== 0) return diff;
      // Superfast series (12xxx/22xxx) ahead of others within a category
      const sf = (n: string) => (/^(12|22)/.test(n) ? 0 : 1);
      if (sf(a.trainNumber) !== sf(b.trainNumber)) return sf(a.trainNumber) - sf(b.trainNumber);
      return a.trainNumber.localeCompare(b.trainNumber, undefined, { numeric: true });
    });

  for (const t of ranked) {
    if (slugs.length >= limit) break;
    slugs.push(buildTrainSlug(t.trainNumber, t.trainName));
  }
  return slugs;
});
