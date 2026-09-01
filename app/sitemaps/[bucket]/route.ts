import { NextResponse } from "next/server";
import { SITEMAP_BUCKETS, type SitemapBucket } from "@/lib/seo/sitemap-buckets";
import { buildSitemapBucket, serializeUrlset } from "@/lib/seo/sitemap-data";

// Child sitemaps for the sitemap index (app/sitemap.xml/route.ts). Each bucket
// is served as a <urlset> at /sitemaps/<bucket>.xml — e.g. /sitemaps/pages.xml.
//
// These live under /sitemaps/ (plural), NOT /sitemap/: Next's metadata sitemap
// convention reserves the /sitemap.xml and /sitemap/[__metadata_id__] paths, so
// a custom /sitemap/[bucket] route collides with it. Serving the whole sitemap
// from custom handlers (index + children) sidesteps that entirely.

export const dynamic = "force-static";

export function generateStaticParams(): { bucket: string }[] {
  return SITEMAP_BUCKETS.map((id) => ({ bucket: `${id}.xml` }));
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bucket: string }> },
): Promise<Response> {
  const { bucket } = await ctx.params;
  const id = bucket.endsWith(".xml") ? bucket.slice(0, -4) : bucket;

  if (!SITEMAP_BUCKETS.includes(id as SitemapBucket)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const entries = await buildSitemapBucket(id as SitemapBucket);
  const xml = serializeUrlset(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate",
    },
  });
}
