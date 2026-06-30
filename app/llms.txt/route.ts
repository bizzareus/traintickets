import { listBlogPosts } from "@/lib/blog";
import { listChartTimesIndex } from "@/lib/chartTimes";
import { listTrainFoodMenuIndex } from "@/lib/trainFoodMenu";

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
  const foodMenuPages = listTrainFoodMenuIndex();

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
  lines.push(`- [Chart Vacancy](${baseUrl}/chart-vacancy): IRCTC chart vacancy — live coach-wise vacant berths after charting, with a visual coach map and current-availability booking.`);
  lines.push(`- [Chart Times](${baseUrl}/chart-times): IRCTC vacancy chart preparation times for trains, station by station, with chart-prep alerts.`);
  lines.push(`- [Train Food Menu](${baseUrl}/irctc-train-food-menu): Readable IRCTC train catering menus and per-meal prices (Vande Bharat, Tejas), organised by class and meal, replacing IRCTC's PDF menus.`);
  lines.push(`- [Mail/Express/Humsafar catering charges](${baseUrl}/irctc-train-food-menu/mail-express-humsafar): Official IRCTC food prices for Mail, Express and Humsafar trains — breakfast, meals (veg/egg/chicken biryani, Janta Meal), beverages (tea, coffee, Rail Neer) and the full à la carte tariff, at-station vs in-train.`);
  lines.push("");
  lines.push("## Indian Railways Rules & Domain Knowledge");
  lines.push("- **Chart Preparation Rules**: The first reservation chart is prepared 4 hours before scheduled departure from the originating (or remote charting) station. Once the first chart is prepared, standard online bookings close, and vacant seats are released as 'Current Availability'. The final (second) chart is prepared 30 minutes before departure.");
  lines.push("- **Current Availability**: Vacant berths available after first chart preparation can be booked online or at station counters at normal fares. The booking window opens immediately after the first chart is prepared and closes 30 minutes prior to train departure.");
  lines.push("- **Waiting List (WL) & RAC**: Fully waitlisted (WL) e-tickets that remain waitlisted after chart preparation are automatically cancelled and refunded; passengers with such tickets cannot board. RAC (Reservation Against Cancellation) tickets allow two passengers to share a side-lower berth, permitting them to board with confirmed seating.");
  lines.push("- **Connecting Journeys (Link PNR)**: Linking two PNRs protects travelers if their first train is delayed and they miss their connection. It qualifies them for a 100% refund of the base fare on the second ticket with zero cancellation fees, provided a TDR is filed within 3 hours of the first train's actual arrival.");
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
      const route =
        t.originStation && t.destinationStation
          ? ` from ${t.originStation} to ${t.destinationStation}`
          : "";
      lines.push(
        `- [${name} (${t.trainNumber}) Chart Times](${baseUrl}/chart-times/${t.slug}): Chart preparation time, chart vacancy and chart status for train ${t.trainNumber} (${name})${route} — when the first and second reservation charts are prepared at each station.`,
      );
    }
    lines.push("");
  }

  if (foodMenuPages.length > 0) {
    lines.push("## Train Food Menus");
    lines.push(
      `Readable IRCTC catering menus and per-meal prices (taxes inclusive) per train, organised by class and meal. Full list of ${foodMenuPages.length} pages is in the [sitemap](${baseUrl}/sitemap.xml).`,
    );
    for (const m of foodMenuPages.slice(0, 100)) {
      const route = m.route ? ` on the ${m.route} route` : "";
      lines.push(
        `- [${m.trainName} (${m.trainNumberPair}) Food Menu](${baseUrl}/irctc-train-food-menu/${m.slug}): IRCTC food menu and catering charges for train ${m.trainNumberPair} (${m.trainName})${route} — morning tea, breakfast, lunch/dinner and snacks by class.`,
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
