import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Programmatically distills an Indian Railways blog post into a high-engagement LinkedIn post
 * adhering to the LastBerth Social Media Strategy.
 */
export interface GenerateLinkedInPostOptions {
  popularTrainCallout?: string;
}

export function generateLinkedInPost(
  slug: string,
  options?: GenerateLinkedInPostOptions
): string {
  const filePath = path.join(process.cwd(), "content", "blog", `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Blog file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  // Extract TL;DR section if present
  const tldrMatch = content.match(/## TL;DR\s+([\s\S]*?)(?=\n---|\n## |$)/i);
  let tldrLines: string[] = [];
  if (tldrMatch) {
    const cleanedText = tldrMatch[1]
      .replace(/\*\*([^*]+)\*\*/g, "$1") // strip bold
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip links
      .replace(/`([^`]+)`/g, "$1") // strip inline code
      .trim();

    // If bullet points exist
    if (/^[-*]\s+/m.test(cleanedText)) {
      tldrLines = cleanedText
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 0 && !l.startsWith("---"));
    } else {
      // Split narrative paragraph by sentences
      tldrLines = cleanedText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10 && !s.startsWith("---"));
    }
  }

  const title = String(data.title ?? slug).replace(/:\s*Rules.*$/i, "");
  const canonicalUrl = `https://lastberth.com/blog/${slug}`;

  const bullets = tldrLines
    .slice(0, 4)
    .map((b, i) => {
      const icons = ["🚆", "📅", "💰", "💡"];
      return `${icons[i % icons.length]} ${b}`;
    })
    .join("\n\n");

  const routeCallout =
    options?.popularTrainCallout ??
    `🎯 Real seat discovery: Travelling this week to Delhi from Mumbai? Even when direct searches show heavy waitlists or REGRET, I have found you seats in Tejas Express in 3AC, and you can use LastBerth to find that out on your route too!`;

  const postText = `${title}\n\n` +
    `Facing high waitlists or REGRET on Indian Railways? Here is what you need to know:\n\n` +
    `${bullets}\n\n` +
    `${routeCallout}\n\n` +
    `Explore confirmed contiguous seats along your route using Smart Seats on LastBerth:\n` +
    `👉 ${canonicalUrl}\n\n` +
    `#IndianRailways #IRCTC #TrainTickets #TravelHacks #LastBerth #SmartSeats`;

  return postText;
}

// CLI usage: npx tsx scripts/generate_linkedin_post.ts [slug]
if (process.argv[1]?.endsWith("generate_linkedin_post.ts")) {
  const slug = process.argv[2] || "chhath-special-train-2026-booking-dates-routes-list";
  const post = generateLinkedInPost(slug);
  console.log("=== GENERATED LINKEDIN POST ===");
  console.log(post);
  console.log(`\nLength: ${post.length} characters (LinkedIn limit: 3000)`);
}
