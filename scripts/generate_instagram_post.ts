import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Programmatically distills an Indian Railways blog post into a high-engagement Instagram post
 * and visual graphic prompt adhering to the LastBerth Social Media & Visual Strategy.
 * Account: https://www.instagram.com/lastberth.in/
 */
export interface GenerateInstagramPostOptions {
  popularTrainChartTimeCallout?: string;
}

export interface InstagramPostPayload {
  caption: string;
  imagePrompt: string;
  carouselSlides: Array<{
    slideNumber: number;
    title: string;
    body: string;
    highlight: string;
  }>;
}

export function generateInstagramPost(
  slug: string,
  options?: GenerateInstagramPostOptions
): InstagramPostPayload {
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

    if (/^[-*]\s+/m.test(cleanedText)) {
      tldrLines = cleanedText
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 0 && !l.startsWith("---"));
    } else {
      tldrLines = cleanedText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10 && !s.startsWith("---"));
    }
  }

  const title = String(data.title ?? slug).replace(/:\s*Rules.*$/i, "");
  
  // Chart preparation & popular train education snippet
  const chartPrepCallout = options?.popularTrainChartTimeCallout ?? 
    `🕒 POPULAR TRAIN CHART PREPARATION TIMES:\n` +
    `• Mumbai ➔ Delhi Tejas/Rajdhani: 1st Chart at ~08:00 PM previous night | Final Chart ~30 mins before departure\n` +
    `• Delhi ➔ Patna Rajdhani / Sampoorna Kranti: 1st Chart ~08:00 AM / 8h prior | Final Chart ~30 mins before\n` +
    `• Bengaluru ➔ Chennai Vande Bharat / Shatabdi: 1st Chart 8h prior | Final Chart ~30 mins before\n` +
    `💡 What happens at Chart Prep? All unallocated VIP, emergency, and pooled quotas convert into CURR_AVBL (Current Availability) at a 10% discount! 50+ confirmed berths regularly open up minutes before departure.`;

  const bullets = tldrLines
    .slice(0, 3)
    .map((b, i) => {
      const icons = ["🚆", "📅", "💰"];
      return `${icons[i % icons.length]} ${b}`;
    })
    .join("\n\n");

  const caption = 
    `🔥 SOLD OUT TRAIN? HERE IS HOW TO FIND LAST-MINUTE CONFIRMED BERTHS 🚆\n\n` +
    `${title}\n\n` +
    `Stuck with a Waiting List (WL) or REGRET on IRCTC? You do NOT have to cancel your trip. Here is the insider secret most travellers never know:\n\n` +
    `${bullets}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${chartPrepCallout}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🎯 HOW TO GET CONFIRMED TICKETS RIGHT NOW:\n` +
    `1️⃣ Track your train's exact charting schedule on lastberth.com/chart-times\n` +
    `2️⃣ Watch post-charting vacant berths drop live on lastberth.com/chart-vacancy\n` +
    `3️⃣ Use Smart Seats on lastberth.com to find confirmed split-journey seats on the same train when direct booking shows REGRET\n\n` +
    `👉 Head to the LINK IN BIO (@lastberth.in) to scan confirmed seats for your journey today!\n\n` +
    `Drop your train number or travel route in the comments, and we'll check your route's chart time for you! 👇\n\n` +
    `#IndianRailways #IRCTC #TrainTravel #LastMinuteTickets #ChartPreparation #CurrentAvailability #Tatkal #SmartSeats #LastBerth #TrainHacks #ConfirmTicket #VandeBharat #RajdhaniExpress`;

  const imagePrompt = 
    `Clean, premium editorial social media infographic graphic for Instagram (aspect ratio 1:1, 1080x1080px). ` +
    `Deep midnight navy and dark charcoal background with high-contrast emerald green and vibrant amber accents. ` +
    `Modern bold typography reading: "HOW TO GET CONFIRMED TRAIN TICKETS 30 MINS BEFORE DEPARTURE". ` +
    `Visual elements: A sleek modern Indian Railways train (Vande Bharat / Tejas style) moving across a glowing digital track, ` +
    `alongside a clean split-screen UI card displaying "Chart Preparation Window: ~8 Hours & 30 Mins Before Departure", ` +
    `"Current Availability (CURR_AVBL) = 100% Confirmed Berths Released", and popular train chart countdown badge. ` +
    `At the bottom: Clean LastBerth branding with "lastberth.com • Find Smart Seats & Chart Times". Professional, minimal, vector graphic design, zero clutter.`;

  const carouselSlides = [
    {
      slideNumber: 1,
      title: "How to Book Confirmed Train Seats 30 Minutes Before Departure",
      body: "Think a train marked 'REGRET' or 'WL/80' is impossible to board? Learn how IRCTC Chart Preparation releases 50+ confirmed berths.",
      highlight: "The Charting Secret"
    },
    {
      slideNumber: 2,
      title: "When Do Charts Actually Prepare?",
      body: "First Chart: 8–10 hours prior to departure (or 8:00 PM previous evening for morning trains). Final Chart: Exactly 30 minutes before departure.",
      highlight: "8h & 30m Cutoffs"
    },
    {
      slideNumber: 3,
      title: "What is Current Availability (CURR_AVBL)?",
      body: "All unallocated emergency quotas, VIP berths, and cancellations get converted into CURR_AVBL post-charting at a 10% discount. These are 100% confirmed berths with coach & seat numbers.",
      highlight: "100% Confirmed"
    },
    {
      slideNumber: 4,
      title: "Popular Train Chart Times",
      body: "• Mumbai–Delhi Tejas/Rajdhani: 8:00 PM prev night\n• Delhi–Patna Sampoorna Kranti: 8h prior\n• BLR–Chennai Vande Bharat: 8h prior",
      highlight: "Live on LastBerth"
    },
    {
      slideNumber: 5,
      title: "Find Your Route on LastBerth",
      body: "Use Smart Seats to split journeys on the same train or track live charting alerts on lastberth.com/chart-times. Link in bio!",
      highlight: "Search LastBerth.com"
    }
  ];

  return {
    caption,
    imagePrompt,
    carouselSlides
  };
}

// CLI usage: npx tsx scripts/generate_instagram_post.ts [slug]
if (process.argv[1]?.endsWith("generate_instagram_post.ts")) {
  const slug = process.argv[2] || "central-railway-festival-special-trains-2026-mumbai-pune-list";
  const post = generateInstagramPost(slug);
  console.log("=== GENERATED INSTAGRAM POST ===");
  console.log(post.caption);
  console.log("\n=== RECOMMENDED IMAGE PROMPT ===");
  console.log(post.imagePrompt);
  console.log("\n=== CAROUSEL SLIDES BREAKDOWN ===");
  console.log(JSON.stringify(post.carouselSlides, null, 2));
}
