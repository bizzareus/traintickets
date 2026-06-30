import type { MetadataRoute } from "next";
import { listBlogPosts, getAvailableTranslations } from "@/lib/blog";
import { getAllGlossaryTerms, listAvailableGlossaryLangs } from "@/lib/seo/glossary-db";
import { getTopRoutes } from "@/lib/seo/routes-db";
import { listChartTimesIndex } from "@/lib/chartTimes";
import { HOME_LANGS } from "@/lib/home/home-langs";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://lastberth.com");

const baseUrl =
  typeof siteUrl === "string" && siteUrl.startsWith("http")
    ? siteUrl
    : "https://lastberth.com";

function url(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${p}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // 1. Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url("/search"), lastModified: now },
    { url: url("/booking/v2"), lastModified: now },
    { url: url("/chart-times"), lastModified: now },
    { url: url("/chart-vacancy"), lastModified: now },
    { url: url("/pnr-status"), lastModified: now },
  ];

  // 1b. Localized homepage (/ for English, /<lang> for the rest) with hreflang.
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

  // 2. Glossary: index + term pages, per language that has a translation file.
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

  // 3. Train route pages
  const routes = await getTopRoutes();
  const trainRouteRoutes: MetadataRoute.Sitemap = routes.map((r) => ({
    url: url(`/routes/${r.origin}-to-${r.dest}`),
    lastModified: now,
  }));

  // 4. Train detail pages (matching pre-rendered static train IDs)
  const trainNumbers = [
    "12952", "12954", "12310", "12394", "11301", "11013", "12007", "12607", 
    "12301", "12381", "12008", "12608", "12425", "12445", "12009", "12931", 
    "12302", "12314", "12958", "12001", "12002", "12003", "12004", "12005", 
    "12006", "12010", "12011", "12012", "12013", "12014", "22439", "1080",
    "22637", "12616", "20977", "20978", "19020", "1144", "12262"
  ];
  const trainRoutes: MetadataRoute.Sitemap = trainNumbers.map((id) => ({
    url: url(`/trains/${id}`),
    lastModified: now,
  }));

  // 4b. Chart-preparation-time pages (every committed content/chart-times/*.json)
  const chartTimesRoutes: MetadataRoute.Sitemap = listChartTimesIndex().map((t) => ({
    url: url(`/chart-times/${t.slug}`),
    lastModified: now,
  }));

  // 5. Localized blog index routes (e.g. /blog, /blog/hi, etc.)
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
      alternates: {
        languages: alternates,
      },
    };
  });

  // 6. Localized blog post routes
  const posts = listBlogPosts();
  const postRoutes: MetadataRoute.Sitemap = [];
  
  for (const p of posts) {
    const availableLangs = getAvailableTranslations(p.slug);
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
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  return [
    ...homeRoutes,
    ...staticRoutes,
    ...glossaryRoutes,
    ...trainRouteRoutes,
    ...trainRoutes,
    ...chartTimesRoutes,
    ...blogIndexRoutes,
    ...postRoutes,
  ];
}
