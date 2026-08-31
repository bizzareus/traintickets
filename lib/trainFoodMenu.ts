import fs from "node:fs";
import path from "node:path";
import { cache as reactCache } from "react";
const cache = (reactCache as <T>(fn: T) => T) || ((fn) => fn);
import {
  buildFoodMenuSlug,
  parseTrainNumberFromFoodSlug,
  slugifyTrainName,
} from "@/lib/foodMenuSlug";
import {
  synthesizeTrainFoodMenu,
  type TrainRegistryEntry,
  type TrainType,
  type TrainZone,
} from "@/lib/trainFoodMapping";

export { buildFoodMenuSlug, parseTrainNumberFromFoodSlug, slugifyTrainName };

export const FOOD_MENU_DIR = path.join(
  process.cwd(),
  "content",
  "irctc-train-food-menu",
);

export const FOOD_REGISTRY_FILE = path.join(
  process.cwd(),
  "content",
  "train-food-menu-registry.json",
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
  /** Class code as printed, e.g. "CC", "EC", "3A", "SL". */
  classCode: string;
  /** Human label, e.g. "Chair Car", "Executive Chair Car", "Sleeper Class". */
  className: string;
  services: FoodMenuService[];
};

export type TrainFoodMenu = {
  /** Canonical (lower) train number, e.g. "22439" or "12951". */
  trainNumber: string;
  /** Number pair as printed, e.g. "22439-40" or "12951-52". */
  trainNumberPair: string;
  /** Train name without the route prefix, e.g. "Vande Bharat Express" or "Mumbai Rajdhani Express". */
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
  trainType?: TrainType;
  zone?: TrainZone;
  status?: "done" | "mapped";
  hasCustomMenu?: boolean;
};

let cachedRegistryMap: {
  bySlug: Map<string, TrainRegistryEntry>;
  byNumber: Map<string, TrainRegistryEntry>;
  list: TrainRegistryEntry[];
} | null = null;

function loadRegistry(): {
  bySlug: Map<string, TrainRegistryEntry>;
  byNumber: Map<string, TrainRegistryEntry>;
  list: TrainRegistryEntry[];
} {
  if (cachedRegistryMap) return cachedRegistryMap;

  const bySlug = new Map<string, TrainRegistryEntry>();
  const byNumber = new Map<string, TrainRegistryEntry>();
  let list: TrainRegistryEntry[] = [];

  try {
    if (fs.existsSync(FOOD_REGISTRY_FILE)) {
      list = JSON.parse(
        fs.readFileSync(FOOD_REGISTRY_FILE, "utf8"),
      ) as TrainRegistryEntry[];
      for (const entry of list) {
        if (entry.slug) bySlug.set(entry.slug, entry);
        if (entry.trainNumber) byNumber.set(entry.trainNumber, entry);
      }
    }
  } catch {
    /* fallback to empty */
  }

  cachedRegistryMap = { bySlug, byNumber, list };
  return cachedRegistryMap;
}

function readCustomMenuFile(slug: string): TrainFoodMenu | null {
  try {
    const fp = path.join(FOOD_MENU_DIR, `${slug}.json`);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8")) as TrainFoodMenu;
  } catch {
    return null;
  }
}

/** Get registry entry by slug or train number. */
export function getTrainRegistryEntry(
  slugOrNumber: string,
): TrainRegistryEntry | null {
  const { bySlug, byNumber } = loadRegistry();
  const normalized = String(slugOrNumber || "").trim().toLowerCase();
  if (bySlug.has(normalized)) return bySlug.get(normalized)!;
  if (byNumber.has(normalized)) return byNumber.get(normalized)!;

  const parsedNumber = parseTrainNumberFromFoodSlug(normalized);
  if (parsedNumber && byNumber.has(parsedNumber)) {
    return byNumber.get(parsedNumber)!;
  }

  return null;
}

/**
 * Load one train's menu by slug or train number.
 * If a custom JSON exists in content/irctc-train-food-menu/, it loads it directly.
 * Otherwise, it maps the train from the registry into standard IRCTC catering.
 */
export const getTrainFoodMenu = cache(
  (slugOrNumber: string): TrainFoodMenu | null => {
    const normalized = String(slugOrNumber || "").trim().toLowerCase();

    // 1. Direct custom file lookup
    const customDirect = readCustomMenuFile(normalized);
    if (customDirect) return customDirect;

    // 2. Registry lookup
    const reg = getTrainRegistryEntry(normalized);
    if (reg) {
      if (reg.hasCustomMenu && reg.slug) {
        const custom = readCustomMenuFile(reg.slug);
        if (custom) return custom;
      }
      return synthesizeTrainFoodMenu(reg);
    }

    // 3. Fallback check by parsed train number
    const parsedNum = parseTrainNumberFromFoodSlug(normalized);
    if (parsedNum) {
      const customByNum = readCustomMenuFile(parsedNum);
      if (customByNum) return customByNum;
    }

    return null;
  },
);

/**
 * Top slugs to pre-render statically at build time.
 * Includes all 87 custom trains + top premium trains (Rajdhani, Shatabdi, Duronto, Vande Bharat).
 */
export function listTrainFoodMenuSlugs(): string[] {
  const { list } = loadRegistry();
  if (list.length === 0) {
    // Fallback to directory scan
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

  // Pre-render custom menus + all premium trains at build time
  const staticSlugs = new Set<string>();
  for (const t of list) {
    if (
      t.hasCustomMenu ||
      t.trainType === "rajdhani" ||
      t.trainType === "shatabdi" ||
      t.trainType === "duronto" ||
      t.trainType === "vande-bharat" ||
      t.trainType === "tejas" ||
      t.trainType === "gatimaan"
    ) {
      staticSlugs.add(t.slug);
    }
  }

  return [...staticSlugs];
}

/** Lightweight metadata for every menu page, sorted by number. */
export const listTrainFoodMenuIndex = cache((): TrainFoodMenuIndexRow[] => {
  const { list } = loadRegistry();
  if (list.length > 0) {
    return list.map((t) => ({
      slug: t.slug,
      trainNumber: t.trainNumber,
      trainNumberPair: t.trainNumberPair || t.trainNumber,
      trainName: t.trainName,
      route: t.route || "",
      trainType: t.trainType,
      zone: t.zone,
      status: t.status,
      hasCustomMenu: t.hasCustomMenu,
    }));
  }

  // Fallback if registry file is absent
  if (!fs.existsSync(FOOD_MENU_DIR)) return [];
  try {
    const rawRows: (TrainFoodMenuIndexRow | null)[] = fs
      .readdirSync(FOOD_MENU_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const slug = f.replace(/\.json$/, "");
        const m = readCustomMenuFile(slug);
        if (!m) return null;
        return {
          slug: m.slug || slug,
          trainNumber: m.trainNumber,
          trainNumberPair: m.trainNumberPair || m.trainNumber,
          trainName: m.trainName,
          route: m.route,
          status: "done",
          hasCustomMenu: true,
        };
      });
    const validRows = rawRows.filter((r): r is TrainFoodMenuIndexRow => r !== null);
    validRows.sort((a, b) =>
      a.trainNumber.localeCompare(b.trainNumber, undefined, { numeric: true }),
    );
    return validRows;
  } catch {
    return [];
  }
});
