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
  lines.push("# LastBerth");
  lines.push("");
  lines.push(
    "> LastBerth helps travelers find confirmed train tickets, live schedules, and seat release options for railway journeys in India.",
  );
  lines.push("");
  lines.push("## Key Pages");
  lines.push(`- [Home](${baseUrl}/): Main search engine to check seat availability and find alternate route suggestions.`);
  lines.push(`- [Search](${baseUrl}/search): Live search interface to query trains and check seat quotas.`);
  lines.push(`- [Booking V2](${baseUrl}/booking/v2): Fast, optimized passenger booking flow for Tatkal tickets.`);
  lines.push("");
  lines.push("## Popular Trains");
  lines.push(`- [12952 Mumbai Rajdhani Express](${baseUrl}/trains/12952): Timetable route schedule and Tatkal seat quotas.`);
  lines.push(`- [12954 August Kranti Tejas Rajdhani](${baseUrl}/trains/12954): Daily timetable and Tatkal seat quotas.`);
  lines.push(`- [12310 Patna Rajdhani Express](${baseUrl}/trains/12310): Timetable schedule and Tatkal seat quotas.`);
  lines.push(`- [12958 Swran J Rajdhani Express](${baseUrl}/trains/12958): Timetable schedule and Tatkal seat quotas.`);
  lines.push("");
  lines.push("## Blog Guides");
  lines.push(`- [Blog Index](${baseUrl}/blog): Travel tips, IRCTC seat booking guides, and railway FAQs.`);
  for (const p of posts.slice(0, 50)) {
    lines.push(`- [${p.title}](${baseUrl}/blog/${p.slug}): ${p.description || "Guide about train ticket bookings."}`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push(
    "- Blog posts are written for humans first, with clear headings and practical examples.",
  );
  lines.push(
    "- If a page includes dynamic UI elements, prefer the text guides for stable explanations.",
  );
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
