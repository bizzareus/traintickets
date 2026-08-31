import type { MetadataRoute } from "next";
import { listBlogPosts } from "@/lib/blog";
import { indexableTranslations } from "@/lib/blog-quality";
import { getAllGlossaryTerms, listAvailableGlossaryLangs } from "@/lib/seo/glossary-db";
import { getTopRoutes } from "@/lib/seo/routes-db";
import { listChartTimesIndex } from "@/lib/chartTimes";
import { listTrainFoodMenuIndex } from "@/lib/trainFoodMenu";
import { listStandardMenuSlugs } from "@/lib/standardMenu";
import { HOME_LANGS } from "@/lib/home/home-langs";
import type { SitemapBucket } from "@/lib/seo/sitemap-buckets";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://lastberth.com");

export const SITEMAP_BASE_URL =
  typeof siteUrl === "string" && siteUrl.startsWith("http")
    ? siteUrl
    : "https://lastberth.com";

function url(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITEMAP_BASE_URL}${p}`;
}

// The "pages" bucket: homepages, tool routes, glossary, train-route pages, and
// the localized blog (index + posts) — everything content/money-page and every
// URL that carries hreflang alternates.
async function pagesBucket(now: Date): Promise<MetadataRoute.Sitemap> {
  // Static core routes.
  // NOTE: /search and /booking/v2 are intentionally excluded — both are legacy
  // aliases that permanently redirect to "/", so listing them in the sitemap
  // would tell Google to index redirect/duplicate URLs.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url("/chart-times"), lastModified: now },
    { url: url("/chart-vacancy"), lastModified: now },
    { url: url("/pnr-status"), lastModified: now },
    { url: url("/tatkal-planner"), lastModified: now },
  ];

  // Localized homepage (/ for English, /<lang> for the rest) with hreflang.
  const homeRoutes: MetadataRoute.Sitemap = HOME_LANGS.map((lang) => {
    const alternates: Record<string, string> = {};
    for (const l of HOME_LANGS) {
      const u = l === "en" ? url("/") : url(`/${l}`);
      alternates[l] = u;
      alternates[`${l}-IN`] = u;
    }
    alternates["x-default"] = url("/");

    return {
      url: lang === "en" ? url("/") : url(`/${lang}`),
      lastModified: now,
      alternates: { languages: alternates },
    };
  });

  // Glossary: index + term pages, per language that has a translation file.
  const glossaryTerms = getAllGlossaryTerms();
  const glossaryLangs = listAvailableGlossaryLangs(); // ["en", ...translated]
  const glossaryRoutes: MetadataRoute.Sitemap = [];
  for (const lang of glossaryLangs) {
    const indexPath = lang === "en" ? "/glossary" : `/glossary/${lang}`;
    glossaryRoutes.push({ url: url(indexPath), lastModified: now });
    for (const term of glossaryTerms) {
      const termPath =
        lang === "en" ? `/glossary/${term.id}` : `/glossary/${lang}/${term.id}`;
      glossaryRoutes.push({ url: url(termPath), lastModified: now });
    }
  }

  // Train route pages.
  const routes = await getTopRoutes();
  const trainRouteRoutes: MetadataRoute.Sitemap = routes.map((r) => ({
    url: url(`/routes/${r.origin}-to-${r.dest}`),
    lastModified: now,
  }));

  // Localized blog index routes (e.g. /blog, /blog/hi, etc.)
  const langs = ["en", "mr", "hi", "bn", "ta", "te", "ml"];
  const blogIndexRoutes: MetadataRoute.Sitemap = langs.map((lang) => {
    const alternates: Record<string, string> = {};
    for (const l of langs) {
      const u = l === "en" ? url("/blog") : url(`/blog/${l}`);
      alternates[l] = u;
      alternates[`${l}-IN`] = u;
    }
    alternates["x-default"] = url("/blog");

    return {
      url: lang === "en" ? url("/blog") : url(`/blog/${lang}`),
      lastModified: now,
      alternates: { languages: alternates },
    };
  });

  // Localized blog post routes.
  const posts = listBlogPosts();
  const postRoutes: MetadataRoute.Sitemap = [];
  for (const p of posts) {
    // Only emit indexable languages — broken machine translations are dropped
    // from both the sitemap and the hreflang alternates (see lib/blog-quality).
    const availableLangs = indexableTranslations(p.slug);
    const alternates: Record<string, string> = {};
    for (const l of availableLangs) {
      const u = l === "en" ? url(`/blog/${p.slug}`) : url(`/blog/${l}/${p.slug}`);
      alternates[l] = u;
      alternates[`${l}-IN`] = u;
    }
    alternates["x-default"] = url(`/blog/${p.slug}`);

    for (const l of availableLangs) {
      postRoutes.push({
        url: l === "en" ? url(`/blog/${p.slug}`) : url(`/blog/${l}/${p.slug}`),
        lastModified: new Date(`${(p.updated ?? p.date).slice(0, 10)}T00:00:00Z`),
        alternates: { languages: alternates },
      });
    }
  }

  return [
    ...homeRoutes,
    ...staticRoutes,
    ...glossaryRoutes,
    ...trainRouteRoutes,
    ...blogIndexRoutes,
    ...postRoutes,
  ];
}

// The "trains" bucket: the top-500 slugged train detail pages that
// generateStaticParams pre-renders (/trains/12015-ajmer-shatabdi).
async function trainsBucket(now: Date): Promise<MetadataRoute.Sitemap> {
  const { getTopTrainSlugs } = await import("@/lib/trainSlug");
  return getTopTrainSlugs(500).map((slug) => ({
    url: url(`/trains/${slug}`),
    lastModified: now,
  }));
}

// The "chart-times" bucket: every committed content/chart-times/*.json page.
function chartTimesBucket(now: Date): MetadataRoute.Sitemap {
  return listChartTimesIndex().map((t) => ({
    url: url(`/chart-times/${t.slug}`),
    lastModified: now,
  }));
}

// The "food-menu" bucket: index + every committed food-menu page.
function foodMenuBucket(now: Date): MetadataRoute.Sitemap {
  return [
    { url: url("/irctc-train-food-menu"), lastModified: now },
    { url: url("/irctc-train-food-menu/mail-express-humsafar"), lastModified: now },
    ...listStandardMenuSlugs().map((slug) => ({
      url: url(`/irctc-train-food-menu/${slug}`),
      lastModified: now,
    })),
    ...listTrainFoodMenuIndex().map((m) => ({
      url: url(`/irctc-train-food-menu/${m.slug}`),
      lastModified: now,
    })),
  ];
}

/** Build the URL entries for one sitemap bucket. */
export async function buildSitemapBucket(
  id: SitemapBucket,
): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  switch (id) {
    case "pages":
      return pagesBucket(now);
    case "trains":
      return trainsBucket(now);
    case "chart-times":
      return chartTimesBucket(now);
    case "food-menu":
      return foodMenuBucket(now);
    default:
      return [];
  }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serialize sitemap entries to a <urlset> document. Matches the shape Next's
 * built-in metadata sitemap emits: xhtml:link alternates (when present) before
 * <lastmod>, and the xhtml namespace declared on the root element.
 */
export function serializeUrlset(entries: MetadataRoute.Sitemap): string {
  const hasAlternates = entries.some((e) => e.alternates?.languages);
  const openTag = hasAlternates
    ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
    : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  const body = entries
    .map((e) => {
      const parts: string[] = [`<loc>${xmlEscape(e.url)}</loc>`];
      const langs = e.alternates?.languages;
      if (langs) {
        for (const [hreflang, href] of Object.entries(langs)) {
          parts.push(
            `<xhtml:link rel="alternate" hreflang="${xmlEscape(hreflang)}" href="${xmlEscape(String(href))}" />`,
          );
        }
      }
      if (e.lastModified) {
        const iso =
          e.lastModified instanceof Date
            ? e.lastModified.toISOString()
            : new Date(e.lastModified).toISOString();
        parts.push(`<lastmod>${iso}</lastmod>`);
      }
      return `<url>${parts.join("")}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n${openTag}${body}</urlset>\n`;
}
