import { SITEMAP_BUCKETS } from "@/lib/seo/sitemap-buckets";
import { getBaseUrl } from "@/lib/site-url";

// Sitemap index served at /sitemap.xml.
//
// The child buckets are served as <urlset> documents at /sitemaps/<id>.xml by
// app/sitemaps/[bucket]/route.ts. Next 16 does NOT generate a <sitemapindex>
// (its metadata sitemap only ever emits <urlset>, and it reserves the
// /sitemap/[__metadata_id__] path), so both the index here and the children
// live on custom routes. Since robots.ts and the sitemap submitted in Search
// Console both point at /sitemap.xml, hand-building the index here keeps that
// canonical URL returning a valid sitemap index that references every child —
// giving the split (per-bucket GSC indexing visibility, content pages separated
// from the ~1,900 programmatic trains/chart-times URLs) with no GSC migration.

const baseUrl = getBaseUrl();

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const lastmod = new Date().toISOString();
  const entries = SITEMAP_BUCKETS.map(
    (id) =>
      `<sitemap><loc>${baseUrl}/sitemaps/${id}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
  ).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate",
    },
  });
}
