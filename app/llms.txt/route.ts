import { listBlogPosts } from "@/lib/blog";
import { listChartTimesIndex } from "@/lib/chartTimes";

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
  const chartTimesPages = listChartTimesIndex();

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
  lines.push(`- [PNR Status](${baseUrl}/pnr-status): Live IRCTC PNR status check with waiting-list (WL/RAC/CNF) confirmation chances and chart timing.`);
  lines.push(`- [Booking V2](${baseUrl}/booking/v2): Fast, optimized passenger booking flow for Tatkal tickets.`);
  lines.push(`- [Chart Times](${baseUrl}/chart-times): IRCTC vacancy chart preparation times for trains, station by station, with chart-prep alerts.`);
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

  if (chartTimesPages.length > 0) {
    lines.push("## Chart Preparation Times");
    lines.push(
      `Station-by-station IRCTC vacancy chart preparation times per train. Full list of ${chartTimesPages.length} pages is in the [sitemap](${baseUrl}/sitemap.xml).`,
    );
    for (const t of chartTimesPages.slice(0, 100)) {
      const name = t.trainName || t.trainNumber;
      lines.push(
        `- [${name} (${t.trainNumber}) Chart Times](${baseUrl}/chart-times/${t.slug}): When the first and second reservation charts are prepared at each station${t.originStation && t.destinationStation ? ` from ${t.originStation} to ${t.destinationStation}` : ""}.`,
      );
    }
    lines.push("");
  }

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
