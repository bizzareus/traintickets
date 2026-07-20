import fs from "node:fs";
import path from "node:path";
import { cache as reactCache } from "react";
const cache = (reactCache as <T>(fn: T) => T) || ((fn) => fn);
import {
  buildFoodMenuSlug,
  parseTrainNumberFromFoodSlug,
  slugifyTrainName,
} from "@/lib/foodMenuSlug";

export { buildFoodMenuSlug, parseTrainNumberFromFoodSlug, slugifyTrainName };

/**
 * IRCTC train food-menu pages: a per-train SEO/AEO page rendering the catering
 * menu and per-service prices that IRCTC otherwise publishes only as PDFs.
 *
 * Data is generated offline by `scripts/ingest-train-food-menus.ts` (download
 * the IRCTC PDF -> extract -> structure) and committed under
 * `content/irctc-train-food-menu/`. Pages render straight from the committed
 * JSON (fully static, no runtime fetch).
 */

export const FOOD_MENU_DIR = path.join(
  process.cwd(),
  "content",
  "irctc-train-food-menu",
);

export type FoodMenuItem = {
  /** Item group, e.g. "Hot Beverage", "Rice dish". */
  item: string;
  /** What is served, verbatim from the menu. */
  description: string;
};

export type FoodMenuService = {
  /** Meal/service, e.g. "Morning Tea", "Breakfast", "Lunch/Dinner". */
  service: string;
  /** Price in INR (taxes inclusive), or null if the PDF omits it. */
  price: number | null;
  items: FoodMenuItem[];
};

export type FoodMenuClass = {
  /** Class code as printed, e.g. "CC", "EC". */
  classCode: string;
  /** Human label, e.g. "Chair Car", "Executive Chair Car". */
  className: string;
  services: FoodMenuService[];
};

export type TrainFoodMenu = {
  /** Canonical (lower) train number, e.g. "22439". */
  trainNumber: string;
  /** Number pair as printed, e.g. "22439-40". */
  trainNumberPair: string;
  /** Train name without the route prefix, e.g. "Vande Bharat Express". */
  trainName: string;
  /** Route as printed, e.g. "NDLS-SVDK". */
  route: string;
  originCode?: string | null;
  destinationCode?: string | null;
  slug: string;
  classes: FoodMenuClass[];
  notes: string[];
  sourcePdfUrl: string;
  generatedAt: string;
};

export type TrainFoodMenuIndexRow = {
  slug: string;
  trainNumber: string;
  trainNumberPair: string;
  trainName: string;
  route: string;
};

function readMenuFile(slug: string): TrainFoodMenu | null {
  try {
    const fp = path.join(FOOD_MENU_DIR, `${slug}.json`);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8")) as TrainFoodMenu;
  } catch {
    return null;
  }
}

/** Load one train's menu by slug. Cached per request. */
export const getTrainFoodMenu = cache((slug: string): TrainFoodMenu | null => {
  return readMenuFile(slug);
});

/** All committed menu slugs (for generateStaticParams). */
export function listTrainFoodMenuSlugs(): string[] {
  if (!fs.existsSync(FOOD_MENU_DIR)) return [];
  try {
    return fs
      .readdirSync(FOOD_MENU_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/** Lightweight metadata for every menu page (index + sitemap), sorted by number. */
export const listTrainFoodMenuIndex = cache((): TrainFoodMenuIndexRow[] => {
  const rows = listTrainFoodMenuSlugs()
    .map((slug) => {
      const m = readMenuFile(slug);
      if (!m) return null;
      return {
        slug: m.slug || slug,
        trainNumber: m.trainNumber,
        trainNumberPair: m.trainNumberPair || m.trainNumber,
        trainName: m.trainName,
        route: m.route,
      } satisfies TrainFoodMenuIndexRow;
    })
    .filter((r): r is TrainFoodMenuIndexRow => r !== null);
  rows.sort((a, b) => a.trainNumber.localeCompare(b.trainNumber));
  return rows;
});
