import { submitToIndexNow, getHostFromUrl } from "../lib/seo/indexnow";
import { buildSitemapBucket } from "../lib/seo/sitemap-data";
import { SITEMAP_BUCKETS } from "../lib/seo/sitemap-buckets";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
IndexNow URL Submission Tool (Bing, Yandex, Seznam, Naver)

Usage:
  npx tsx scripts/submit-indexnow.ts <url1> [url2 ...]
  npx tsx scripts/submit-indexnow.ts --sitemap
  npx tsx scripts/submit-indexnow.ts --sitemap --dry-run
  npx tsx scripts/submit-indexnow.ts --host https://lastberth.com --sitemap

Options:
  --sitemap, -s   Fetch and submit all sitemap URLs
  --dry-run, -d   Print URLs to be submitted without sending API requests
  --host <url>    Override host URL (default: process.env.NEXT_PUBLIC_APP_URL or lastberth.com)
  --help, -h      Show this help message
`);
    process.exit(0);
  }

  let isSitemap = false;
  let isDryRun = false;
  let customHost: string | undefined;
  const urls: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--sitemap" || arg === "-s") {
      isSitemap = true;
    } else if (arg === "--dry-run" || arg === "-d") {
      isDryRun = true;
    } else if (arg === "--host") {
      customHost = args[++i];
    } else if (!arg.startsWith("-")) {
      urls.push(arg);
    }
  }

  if (isSitemap) {
    console.log("🔍 Fetching URLs from sitemap buckets...");
    for (const bucket of SITEMAP_BUCKETS) {
      const entries = await buildSitemapBucket(bucket);
      console.log(`   - Bucket '${bucket}': ${entries.length} URLs`);
      urls.push(...entries.map((e) => e.url));
    }
  }

  const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()))).filter(
    (u) => u.startsWith("http://") || u.startsWith("https://")
  );

  if (uniqueUrls.length === 0) {
    console.error("❌ No valid HTTP/HTTPS URLs provided to submit.");
    process.exit(1);
  }

  const hostName = getHostFromUrl(customHost);
  console.log(`\n🚀 IndexNow Submission Target:`);
  console.log(`   Host: ${hostName}`);
  console.log(`   Total URLs: ${uniqueUrls.length}`);

  if (isDryRun) {
    console.log(`\n📋 [DRY-RUN] Sample URLs (first 10):`);
    uniqueUrls.slice(0, 10).forEach((u) => console.log(`   - ${u}`));
    if (uniqueUrls.length > 10) {
      console.log(`   ... and ${uniqueUrls.length - 10} more.`);
    }
    console.log("\n✅ Dry run completed. No API requests sent.");
    process.exit(0);
  }

  console.log(`\n📡 Submitting ${uniqueUrls.length} URL(s) to IndexNow...`);
  const results = await submitToIndexNow(uniqueUrls, { host: customHost });

  console.log("\n📊 Results:");
  results.forEach((r, idx) => {
    const icon = r.success ? "✅" : "❌";
    console.log(
      `   Batch #${idx + 1}: ${icon} HTTP ${r.status} — ${r.message} (${r.submittedCount} URLs)`
    );
  });

  const overallSuccess = results.every((r) => r.success);
  if (overallSuccess) {
    console.log("\n🎉 IndexNow submission completed successfully!");
  } else {
    console.error("\n⚠️  Some batches failed during submission.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
