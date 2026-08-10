import fs from "node:fs";
import path from "node:path";
import { cache as reactCache } from "react";
const cache = (reactCache as <T>(fn: T) => T) || ((fn) => fn);
import type { Metadata } from "next";

/**
 * IRCTC standard class/zone catering menus (Rajdhani/premium 1AC-EC, AC
 * 2A-3A-CC, Duronto sleeper, Zone-specific AC & Sleeper menus, and Train Category pages).
 * Rendered under /irctc-train-food-menu/<slug>.
 */

export type StandardService = {
  service: string;
  price: number | null;
  sets: string[];
};

export type StandardZoneMenu = {
  zone: string;
  key: string;
  services: StandardService[];
  sourcePdfUrl: string;
};

export type StandardMenuGroup = {
  classGroup: string;
  classGroupName: string;
  slug: string;
  covers: string;
  zones: StandardZoneMenu[];
};

export type StandardMenuConfig = {
  slug: string;
  classGroup: string;
  classGroupName: string;
  covers: string;
  heading: string;
  metaTitle: string;
  zoneFilter?: string;
};

const DIR = path.join(process.cwd(), "content", "standard-menu");

/** Standard menu page configurations under /irctc-train-food-menu/. */
export const STANDARD_MENU_PAGES: StandardMenuConfig[] = [
  {
    slug: "ac-coach-food-menu-prices",
    classGroup: "2A-3A-CC",
    classGroupName: "AC 2-Tier, 3-Tier & Chair Car",
    covers: "Rajdhani, Shatabdi and AC Mail/Express, in AC 2-Tier (2A), 3-Tier (3A) and Chair Car (CC)",
    heading: "AC 2A / 3A / Chair Car Food Menu & Meal Prices",
    metaTitle: "AC 2A/3A/Chair Car Food Menu & Meal Prices",
  },
  {
    slug: "north-zone-2ac-3ac-cc-food-menu",
    classGroup: "2A-3A-CC",
    classGroupName: "North Zone AC 2A, 3A & Chair Car",
    covers: "Northern Zone trains (NR, NCR, NWR, NER) in AC 2-Tier (2A), 3-Tier (3A) and Chair Car (CC)",
    heading: "North Zone AC 2A / 3A / Chair Car Food Menu",
    metaTitle: "North Zone AC 2A/3A/CC Food Menu & Prices",
    zoneFilter: "North",
  },
  {
    slug: "south-zone-2ac-3ac-cc-food-menu",
    classGroup: "2A-3A-CC",
    classGroupName: "South Zone AC 2A, 3A & Chair Car",
    covers: "Southern Zone trains (SR, SWR, SCR) in AC 2-Tier (2A), 3-Tier (3A) and Chair Car (CC)",
    heading: "South Zone AC 2A / 3A / Chair Car Food Menu",
    metaTitle: "South Zone AC 2A/3A/CC Food Menu & Prices",
    zoneFilter: "South",
  },
  {
    slug: "east-zone-2ac-3ac-cc-food-menu",
    classGroup: "2A-3A-CC",
    classGroupName: "East Zone AC 2A, 3A & Chair Car",
    covers: "Eastern Zone trains (ER, ECR, SER, NFR) in AC 2-Tier (2A), 3-Tier (3A) and Chair Car (CC)",
    heading: "East Zone AC 2A / 3A / Chair Car Food Menu",
    metaTitle: "East Zone AC 2A/3A/CC Food Menu & Prices",
    zoneFilter: "East",
  },
  {
    slug: "west-zone-2ac-3ac-cc-food-menu",
    classGroup: "2A-3A-CC",
    classGroupName: "West Zone AC 2A, 3A & Chair Car",
    covers: "Western Zone trains (WR, CR, WCR) in AC 2-Tier (2A), 3-Tier (3A) and Chair Car (CC)",
    heading: "West Zone AC 2A / 3A / Chair Car Food Menu",
    metaTitle: "West Zone AC 2A/3A/CC Food Menu & Prices",
    zoneFilter: "West",
  },
  {
    slug: "duronto-sleeper-class-food-menu-prices",
    classGroup: "duronto-sleeper",
    classGroupName: "Duronto Express Sleeper Class",
    covers: "Duronto Express trains in Sleeper Class (SL)",
    heading: "Duronto Sleeper Class Food Menu & Meal Charges",
    metaTitle: "Duronto Sleeper Class Food Menu & Meal Prices",
  },
  {
    slug: "north-zone-duronto-sleeper-food-menu",
    classGroup: "duronto-sleeper",
    classGroupName: "North Zone Duronto Sleeper Class",
    covers: "Northern Zone Duronto trains in Sleeper Class (SL)",
    heading: "North Zone Duronto Sleeper Class Food Menu",
    metaTitle: "North Zone Duronto Sleeper Food Menu & Prices",
    zoneFilter: "North",
  },
  {
    slug: "south-zone-duronto-sleeper-food-menu",
    classGroup: "duronto-sleeper",
    classGroupName: "South Zone Duronto Sleeper Class",
    covers: "Southern Zone Duronto trains in Sleeper Class (SL)",
    heading: "South Zone Duronto Sleeper Class Food Menu",
    metaTitle: "South Zone Duronto Sleeper Food Menu & Prices",
    zoneFilter: "South",
  },
  {
    slug: "east-zone-duronto-sleeper-food-menu",
    classGroup: "duronto-sleeper",
    classGroupName: "East Zone Duronto Sleeper Class",
    covers: "Eastern Zone Duronto trains in Sleeper Class (SL)",
    heading: "East Zone Duronto Sleeper Class Food Menu",
    metaTitle: "East Zone Duronto Sleeper Food Menu & Prices",
    zoneFilter: "East",
  },
  {
    slug: "west-zone-duronto-sleeper-food-menu",
    classGroup: "duronto-sleeper",
    classGroupName: "West Zone Duronto Sleeper Class",
    covers: "Western Zone Duronto trains in Sleeper Class (SL)",
    heading: "West Zone Duronto Sleeper Class Food Menu",
    metaTitle: "West Zone Duronto Sleeper Food Menu & Prices",
    zoneFilter: "West",
  },
  {
    slug: "duronto-ac-3tier-food-menu-prices",
    classGroup: "2A-3A-CC",
    classGroupName: "Duronto Express AC 3-Tier (3A)",
    covers: "Duronto Express trains in AC 3-Tier (3A) coaches",
    heading: "Duronto Express 3AC Food Menu & Catering Prices",
    metaTitle: "Duronto 3AC Food Menu & Meal Prices",
  },
  {
    slug: "duronto-ac-2tier-food-menu-prices",
    classGroup: "2A-3A-CC",
    classGroupName: "Duronto Express AC 2-Tier (2A)",
    covers: "Duronto Express trains in AC 2-Tier (2A) coaches",
    heading: "Duronto Express 2AC Food Menu & Catering Prices",
    metaTitle: "Duronto 2AC Food Menu & Meal Prices",
  },
  {
    slug: "duronto-ac-1st-class-food-menu-prices",
    classGroup: "1AC-EC",
    classGroupName: "Duronto Express AC First Class (1A)",
    covers: "Duronto Express trains in First AC (1A) coaches",
    heading: "Duronto Express First AC (1A) Food Menu",
    metaTitle: "Duronto First AC Food Menu & Meal Prices",
  },
  {
    slug: "rajdhani-express-food-menu-prices",
    classGroup: "1AC-EC",
    classGroupName: "Rajdhani Express (1AC, 2A, 3A, EC)",
    covers: "All Rajdhani Express trains across First AC (1A), 2-Tier (2A), 3-Tier (3A) and Executive Chair Car (EC)",
    heading: "Rajdhani Express Food Menu & Meal Charges",
    metaTitle: "Rajdhani Express Food Menu & Meal Prices",
  },
  {
    slug: "shatabdi-express-food-menu-prices",
    classGroup: "2A-3A-CC",
    classGroupName: "Shatabdi Express (Executive & Chair Car)",
    covers: "Shatabdi Express trains in Executive Chair Car (EC) and AC Chair Car (CC)",
    heading: "Shatabdi Express Food Menu & Catering Prices",
    metaTitle: "Shatabdi Express Food Menu & Meal Prices",
  },
  {
    slug: "duronto-express-food-menu-prices",
    classGroup: "duronto-sleeper",
    classGroupName: "Duronto Express (1AC, 2A, 3A & Sleeper)",
    covers: "Duronto Express trains across Sleeper Class, AC 3-Tier, 2-Tier and First AC",
    heading: "Duronto Express Food Menu & Catering Prices",
    metaTitle: "Duronto Express Food Menu & Meal Prices",
  },
  {
    slug: "vande-bharat-express-food-menu-prices",
    classGroup: "2A-3A-CC",
    classGroupName: "Vande Bharat Express (Executive & Chair Car)",
    covers: "Vande Bharat Express trains in Executive Class (EC) and AC Chair Car (CC)",
    heading: "Vande Bharat Express Food Menu & Catering Charges",
    metaTitle: "Vande Bharat Express Food Menu & Meal Prices",
  },
  {
    slug: "ac-express-trains-food-menu-prices",
    classGroup: "2A-3A-CC",
    classGroupName: "AC Express & Garib Rath Trains",
    covers: "AC Express, Garib Rath, Humsafar and Superfast AC trains",
    heading: "AC Express Trains Food Menu & Catering Prices",
    metaTitle: "AC Express Trains Food Menu & Meal Prices",
  },
  {
    slug: "rajdhani-1ac-executive",
    classGroup: "1AC-EC",
    classGroupName: "AC First Class & Executive Chair Car",
    covers: "Rajdhani and premium trains, First AC (1A) and Executive Chair Car (EC)",
    heading: "Rajdhani (1AC & Executive Chair Car) Food Menu",
    metaTitle: "Rajdhani Food Menu & Price: What's Included?",
  },
  {
    slug: "duronto-sleeper",
    classGroup: "duronto-sleeper",
    classGroupName: "Duronto Sleeper Class",
    covers: "Duronto Express trains, sleeper class",
    heading: "Duronto Sleeper Class Food Menu",
    metaTitle: "Duronto Food Menu & Price: What's Included?",
  },
];

const ZONE_ORDER = [
  "North",
  "East",
  "West",
  "South",
  "South Central",
  "Jain Meal",
  "Diabetic Meal",
  "Continental Menu",
];

type RawMenu = StandardZoneMenu & { classGroup: string; classGroupName: string };

function readAll(): RawMenu[] {
  if (!fs.existsSync(DIR)) return [];
  const out: RawMenu[] = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as RawMenu);
    } catch {
      /* skip bad file */
    }
  }
  return out;
}

function resolveSlugAlias(slug: string): string {
  if (slug === "ac-2a-3a-cc") return "ac-coach-food-menu-prices";
  if (slug === "duronto-sleeper") return "duronto-sleeper-class-food-menu-prices";
  return slug;
}

export const getStandardMenuGroup = cache(
  (slug: string): StandardMenuGroup | null => {
    const resolvedSlug = resolveSlugAlias(slug);
    const cfg = STANDARD_MENU_PAGES.find((p) => p.slug === resolvedSlug);
    if (!cfg) return null;

    let rawMenus = readAll().filter((m) => m.classGroup === cfg.classGroup);

    if (cfg.zoneFilter) {
      const zf = cfg.zoneFilter.toLowerCase();
      rawMenus = rawMenus.filter((m) => m.zone.toLowerCase().includes(zf));
    }

    const zones = rawMenus
      .map((m) => ({
        zone: m.zone,
        key: m.key,
        services: m.services,
        sourcePdfUrl: m.sourcePdfUrl,
      }))
      .sort(
        (a, b) =>
          (ZONE_ORDER.indexOf(a.zone) + 1 || 99) -
          (ZONE_ORDER.indexOf(b.zone) + 1 || 99),
      );

    if (zones.length === 0) {
      // Fallback to all zones for classGroup if zone-filtered list is empty
      const fallbackZones = readAll()
        .filter((m) => m.classGroup === cfg.classGroup)
        .map((m) => ({
          zone: m.zone,
          key: m.key,
          services: m.services,
          sourcePdfUrl: m.sourcePdfUrl,
        }));
      if (fallbackZones.length === 0) return null;
      return {
        classGroup: cfg.classGroup,
        classGroupName: cfg.classGroupName,
        slug: cfg.slug,
        covers: cfg.covers,
        zones: fallbackZones,
      };
    }

    return {
      classGroup: cfg.classGroup,
      classGroupName: cfg.classGroupName,
      slug: cfg.slug,
      covers: cfg.covers,
      zones,
    };
  },
);

const REDIRECT_SLUGS = new Set(["ac-2a-3a-cc", "duronto-sleeper"]);

export function listStandardMenuSlugs(): string[] {
  return STANDARD_MENU_PAGES.filter(
    (p) => !REDIRECT_SLUGS.has(p.slug) && getStandardMenuGroup(p.slug),
  ).map((p) => p.slug);
}

/** Metadata for a standard-menu page (title deduped: layout adds "| LastBerth"). */
export function standardMenuMetadata(slug: string): Metadata {
  const resolvedSlug = resolveSlugAlias(slug);
  const cfg = STANDARD_MENU_PAGES.find((p) => p.slug === resolvedSlug);
  const group = getStandardMenuGroup(resolvedSlug);
  if (!cfg || !group) return { title: "Train Food Menu" };
  const prices = group.zones
    .flatMap((z) => z.services.map((s) => s.price))
    .filter((p): p is number => typeof p === "number");
  const min = prices.length ? Math.min(...prices) : null;
  const description = `Official IRCTC food menu and catering prices for ${cfg.classGroupName} on ${cfg.covers}. Morning tea, breakfast, lunch, dinner and snacks with per-meal charges${
    min != null ? `, starting at ₹${min}` : ""
  }, inclusive of taxes.`;
  return {
    title: cfg.metaTitle,
    description,
    keywords: [
      `${cfg.classGroupName} food menu`,
      `duronto sleeper food menu price`,
      `duronto sleeper meal charges`,
      `irctc ${cfg.slug} menu`,
      `train meal price ${cfg.classGroup}`,
    ],
    alternates: { canonical: `/irctc-train-food-menu/${cfg.slug}` },
    openGraph: { title: cfg.metaTitle, description },
  };
}
