// Single source of truth for the sitemap-index buckets. Consumed by
// app/sitemap.ts (generateSitemaps → each child <urlset> at /sitemap/<id>.xml)
// and app/sitemap.xml/route.ts (the hand-built <sitemapindex> at /sitemap.xml).
//
// "pages"             — homepages, tool routes, glossary, train-route pages, blog
//                       (index + posts): every content/money page and every URL that
//                       carries hreflang alternates.
// "chart-times"       — every committed content/chart-times/*.json page.
// "food-menu"         — the /irctc-train-food-menu tree.
// Note: "trains" and "confirmed-tickets" are temporarily excluded from the sitemap index
// during AdSense site review to guide Google's reviewer directly to rich editorial articles and core tools.
export const SITEMAP_BUCKETS = ["pages", "chart-times", "food-menu"] as const;

export type SitemapBucket =
  (typeof SITEMAP_BUCKETS)[number] | "trains" | "confirmed-tickets";
