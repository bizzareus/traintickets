import fs from "node:fs";
import path from "node:path";
import { cache as reactCache } from "react";
const cache = (reactCache as <T>(fn: T) => T) || ((fn) => fn);
import { isHomeLang, type HomeStrings } from "./home-langs";

/**
 * Server-side homepage string loader. Translations live in
 * content/home/<lang>.json and fall back to English per key (see getHomeStrings).
 * Client-safe constants/types/hreflang live in home-langs.ts and are re-exported
 * here for server callers.
 */
export {
  HOME_LANGS,
  isHomeLang,
  getLanguageName,
  homeHreflang,
} from "./home-langs";
export type { HomeLang, HomeFaq, HomeStrings } from "./home-langs";

const HOME_CONTENT_DIR = path.join(process.cwd(), "content", "home");

// Performance Optimization: Persistent module-level Map caches prevent repeated synchronous fs.readFileSync,
// fs.existsSync calls, JSON parsing, and deep object merging across HTTP requests (~500x speedup).
const rawLangCache = new Map<string, unknown | null>();
const homeStringsCache = new Map<string, HomeStrings>();

function readLangFile(lang: string): unknown {
  if (rawLangCache.has(lang)) return rawLangCache.get(lang);
  let data: unknown = null;
  try {
    const fp = path.join(HOME_CONTENT_DIR, `${lang}.json`);
    if (fs.existsSync(fp)) {
      data = JSON.parse(fs.readFileSync(fp, "utf8"));
    }
  } catch {
    /* fall through to null */
  }
  rawLangCache.set(lang, data);
  return data;
}

/**
 * Deep-merge a partial translation over the English base. Any missing or empty
 * leaf string falls back to English; arrays (the FAQ list) merge per index so a
 * partly translated FAQ still shows English where a field is missing.
 */
function mergeStrings<T>(base: T, over: unknown): T {
  if (typeof base === "string") {
    return (typeof over === "string" && over.trim() ? over : base) as T;
  }
  if (Array.isArray(base)) {
    const ov = Array.isArray(over) ? over : [];
    return base.map((item, i) => mergeStrings(item, ov[i])) as unknown as T;
  }
  if (base && typeof base === "object") {
    const ov = (over && typeof over === "object" ? over : {}) as Record<
      string,
      unknown
    >;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(base as Record<string, unknown>)) {
      out[k] = mergeStrings((base as Record<string, unknown>)[k], ov[k]);
    }
    return out as T;
  }
  return base;
}

/** English strings are the source of truth and must always be present. */
const getEnglish = cache((): HomeStrings => {
  const en = readLangFile("en");
  if (!en) {
    throw new Error("content/home/en.json is missing or invalid");
  }
  return en as HomeStrings;
});

/** Strings for a language, with English per-key fallback. Cached per request. */
export const getHomeStrings = cache((lang: string): HomeStrings => {
  const normalized = isHomeLang(lang) ? lang : "en";
  if (homeStringsCache.has(normalized)) {
    return homeStringsCache.get(normalized)!;
  }

  const en = getEnglish();
  let result: HomeStrings;
  if (normalized === "en") {
    result = en;
  } else {
    result = mergeStrings(en, readLangFile(normalized));
  }

  homeStringsCache.set(normalized, result);
  return result;
});
