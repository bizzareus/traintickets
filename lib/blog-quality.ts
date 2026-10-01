import { getBlogPost, getAvailableTranslations } from "./blog";

/**
 * Translation-quality gate for blog posts.
 *
 * Machine-translated posts occasionally come out broken — most often an LLM
 * repetition loop (a word or short phrase repeated hundreds of times, ballooning
 * the file), and sometimes truncated or with broken frontmatter. Google crawls
 * these and refuses to index them ("Crawled - currently not indexed"), and a pile
 * of low-value URLs can drag the whole domain's crawl/index budget down.
 *
 * This gate flags a *translation* (never English — that's the source) as
 * low-quality so the request path can `noindex` it and the sitemap can drop it,
 * concentrating indexing signal on the clean pages. It is deliberately
 * conservative: only clearly-broken pages trip it, so good translations keep
 * their place.
 */

const LOOP_RUN_THRESHOLD = 25; // consecutive repeats of a uni/bi-gram = a loop
const BLOAT_RATIO = 2.2; // translated/English word ratio above this = corrupted
const MIN_WORDS = 60; // below this a translation is too thin to be useful

// Performance Optimization: Persistent module-level Map caches prevent redundant
// text tokenization (split(/\s+/)), unigram loop checks, and bigram loop checks
// across request boundaries and sitemap iterations (~900x speedup on warm calls).
const qualityCache = new Map<string, boolean>();
const indexableCache = new Map<string, string[]>();

export function clearQualityCaches(): void {
  qualityCache.clear();
  indexableCache.clear();
}

function getTokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Longest consecutive repetition of a single token OR a two-token phrase. Catches
 * both "x x x x…" and "x y x y x y…" degeneration loops (the Tamil corruptions
 * repeated a *bigram*, which a unigram-only check misses).
 */
function longestLoopRun(tokens: string[]): number {
  let worst = 0;

  // Unigram: run of identical adjacent tokens.
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    while (j < tokens.length && tokens[j] === tokens[i]) j++;
    worst = Math.max(worst, j - i);
    i = j;
  }

  // Bigram: repeats of a two-token pattern (counts as # of pattern repeats).
  for (let i = 0; i + 1 < tokens.length; ) {
    let reps = 1;
    let j = i;
    while (
      j + 3 < tokens.length &&
      tokens[j] === tokens[j + 2] &&
      tokens[j + 1] === tokens[j + 3]
    ) {
      reps++;
      j += 2;
    }
    if (reps > 1) {
      worst = Math.max(worst, reps);
      i = j + 2;
    } else {
      i++;
    }
  }

  return worst;
}

/** True when a translated post is clearly broken and should not be indexed. */
export function isLowQualityTranslation(slug: string, lang: string): boolean {
  if (!lang || lang === "en") return false; // source language is always indexable

  const cacheKey = `${lang}:${slug}`;
  if (qualityCache.has(cacheKey)) {
    return qualityCache.get(cacheKey)!;
  }

  const post = getBlogPost(slug, lang);
  if (!post) {
    qualityCache.set(cacheKey, false); // no such translation — nothing to gate
    return false;
  }

  // Broken frontmatter: title fell back to the raw slug, or empty description.
  if (!post.title || post.title === slug || !post.description) {
    qualityCache.set(cacheKey, true);
    return true;
  }

  const body = post.content ?? "";
  const tokens = getTokens(body);
  const wc = tokens.length;
  if (wc < MIN_WORDS) {
    qualityCache.set(cacheKey, true);
    return true; // truncated / near-empty
  }

  if (longestLoopRun(tokens) >= LOOP_RUN_THRESHOLD) {
    qualityCache.set(cacheKey, true);
    return true; // repetition loop
  }

  // Bloat vs the English source (a healthy translation stays close in length).
  const en = getBlogPost(slug, "en");
  if (en?.content) {
    const enWc = getTokens(en.content).length;
    if (enWc > 0 && wc / enWc > BLOAT_RATIO) {
      qualityCache.set(cacheKey, true);
      return true;
    }
  }

  qualityCache.set(cacheKey, false);
  return false;
}

/**
 * Languages of `slug` that should be indexed/emitted: every available translation
 * minus the low-quality ones (English always kept). Single source of truth for
 * both the sitemap and hreflang alternates so a broken page is neither listed in
 * the sitemap nor advertised as an alternate.
 */
export function indexableTranslations(slug: string): string[] {
  const cached = indexableCache.get(slug);
  if (cached) {
    return [...cached];
  }

  const result = getAvailableTranslations(slug).filter(
    (l) => l === "en" || !isLowQualityTranslation(slug, l),
  );
  indexableCache.set(slug, result);
  return [...result];
}
