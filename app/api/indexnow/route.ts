import { NextResponse } from "next/server";
import { submitToIndexNow, IndexNowResult } from "@/lib/seo/indexnow";
import { buildSitemapBucket } from "@/lib/seo/sitemap-data";
import { SITEMAP_BUCKETS } from "@/lib/seo/sitemap-buckets";

export async function POST(request: Request) {
  // Optional security check if secret is configured
  const secretEnv = process.env.INDEXNOW_SECRET;
  if (secretEnv) {
    const authHeader = request.headers.get("x-indexnow-secret") || request.headers.get("authorization");
    if (authHeader !== secretEnv && authHeader !== `Bearer ${secretEnv}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { urls?: string[]; url?: string; sitemap?: boolean; host?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  let targetUrls: string[] = [];

  if (body.url) {
    targetUrls.push(body.url);
  }

  if (Array.isArray(body.urls)) {
    targetUrls.push(...body.urls);
  }

  if (body.sitemap) {
    try {
      for (const bucket of SITEMAP_BUCKETS) {
        const entries = await buildSitemapBucket(bucket);
        targetUrls.push(...entries.map((e) => e.url));
      }
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to collect sitemap URLs", details: String(err) },
        { status: 500 }
      );
    }
  }

  targetUrls = Array.from(new Set(targetUrls));

  if (targetUrls.length === 0) {
    return NextResponse.json(
      { error: "No URLs provided. Pass 'url', 'urls', or 'sitemap: true'." },
      { status: 400 }
    );
  }

  const results: IndexNowResult[] = await submitToIndexNow(targetUrls, {
    host: body.host,
  });

  const overallSuccess = results.every((r) => r.success);
  const totalSubmitted = results.reduce(
    (acc, r) => acc + (r.success ? r.submittedCount : 0),
    0
  );

  return NextResponse.json({
    success: overallSuccess,
    totalUrls: targetUrls.length,
    totalSubmitted,
    results,
  });
}
