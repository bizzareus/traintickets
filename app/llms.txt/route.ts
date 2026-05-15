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

export async function GET() {
  const posts = listBlogPosts();

  const lines: string[] = [];
  lines.push(`# LastBerth (${baseUrl})`);
  lines.push("");
  lines.push(
    "LastBerth helps people find confirmed train tickets for immediate journeys in India.",
  );
  lines.push("");
  lines.push("## Key Pages");
  lines.push(`- ${baseUrl}/`);
  lines.push(`- ${baseUrl}/search`);
  lines.push(`- ${baseUrl}/booking/v2`);
  lines.push("");
  lines.push("## Blog");
  lines.push(`- ${baseUrl}/blog`);
  for (const p of posts.slice(0, 50)) {
    lines.push(`- ${baseUrl}/blog/${p.slug} — ${p.title}`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push(
    "- Blog posts are written for humans first, with clear headings and practical examples.",
  );
  lines.push(
    "- If a page includes dynamic UI elements, prefer the blog posts for stable explanations.",
  );
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
