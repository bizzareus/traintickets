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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Longest consecutive repetition of a single token OR a two-token phrase. Catches
 * both "x x x x…" and "x y x y x y…" degeneration loops (the Tamil corruptions
 * repeated a *bigram*, which a unigram-only check misses).
 */
function longestLoopRun(text: string): number {
  const t = text.split(/\s+/).filter(Boolean);
  let worst = 0;

  // Unigram: run of identical adjacent tokens.
  for (let i = 0; i < t.length; ) {
    let j = i;
    while (j < t.length && t[j] === t[i]) j++;
    worst = Math.max(worst, j - i);
    i = j;
  }

  // Bigram: repeats of a two-token pattern (counts as # of pattern repeats).
  for (let i = 0; i + 1 < t.length; ) {
    let reps = 1;
    let j = i;
    while (
      j + 3 < t.length &&
      t[j] === t[j + 2] &&
      t[j + 1] === t[j + 3]
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
  const post = getBlogPost(slug, lang);
  if (!post) return false; // no such translation — nothing to gate

  // Broken frontmatter: title fell back to the raw slug, or empty description.
  if (!post.title || post.title === slug || !post.description) return true;

  const body = post.content ?? "";
  const wc = wordCount(body);
  if (wc < MIN_WORDS) return true; // truncated / near-empty
  if (longestLoopRun(body) >= LOOP_RUN_THRESHOLD) return true; // repetition loop

  // Bloat vs the English source (a healthy translation stays close in length).
  const en = getBlogPost(slug, "en");
  if (en?.content) {
    const enWc = wordCount(en.content);
    if (enWc > 0 && wc / enWc > BLOAT_RATIO) return true;
  }

  return false;
}

/**
 * Languages of `slug` that should be indexed/emitted: every available translation
 * minus the low-quality ones (English always kept). Single source of truth for
 * both the sitemap and hreflang alternates so a broken page is neither listed in
 * the sitemap nor advertised as an alternate.
 */
export function indexableTranslations(slug: string): string[] {
  return getAvailableTranslations(slug).filter(
    (l) => l === "en" || !isLowQualityTranslation(slug, l),
  );
}
