import { listBlogPosts } from "@/lib/blog";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://lastberth.com");

const baseUrl =
  typeof siteUrl === "string" && siteUrl.startsWith("http")
    ? siteUrl
    : "https://lastberth.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = listBlogPosts();
  const updated =
    posts[0]?.updated ??
    posts[0]?.date ??
    new Date().toISOString().slice(0, 10);

  const items = posts
    .map((p) => {
      const link = `${baseUrl}/blog/${p.slug}`;
      return `
<item>
  <title>${escapeXml(p.title)}</title>
  <link>${escapeXml(link)}</link>
  <guid>${escapeXml(link)}</guid>
  <pubDate>${escapeXml(new Date(`${p.date}T00:00:00Z`).toUTCString())}</pubDate>
  <description>${escapeXml(p.description || "")}</description>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml("LastBerth Blog")}</title>
    <link>${escapeXml(`${baseUrl}/blog`)}</link>
    <description>${escapeXml(
      "Practical guides for finding confirmed train tickets, understanding charting, and booking smarter journeys.",
    )}</description>
    <language>en-IN</language>
    <lastBuildDate>${escapeXml(
      new Date(`${updated}T00:00:00Z`).toUTCString(),
    )}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
