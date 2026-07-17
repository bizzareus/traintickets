// Single source of truth for the sitemap-index buckets. Consumed by
// app/sitemap.ts (generateSitemaps → each child <urlset> at /sitemap/<id>.xml)
// and app/sitemap.xml/route.ts (the hand-built <sitemapindex> at /sitemap.xml).
//
// "pages"      — homepages, tool routes, glossary, train-route pages, blog
//                (index + posts): every content/money page and every URL that
//                carries hreflang alternates.
// "trains"     — the top-500 slugged /trains/<slug> detail pages.
// "chart-times"— every committed content/chart-times/*.json page.
// "food-menu"  — the /irctc-train-food-menu tree.
export const SITEMAP_BUCKETS = [
  "pages",
  "trains",
  "chart-times",
  "food-menu",
] as const;

export type SitemapBucket = (typeof SITEMAP_BUCKETS)[number];
