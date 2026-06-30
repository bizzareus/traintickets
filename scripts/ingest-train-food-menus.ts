/**
 * ingest-train-food-menus.ts — build the IRCTC Vande Bharat food-menu dataset.
 *
 * For each Vande Bharat train listed on menurates.irctc.co.in it downloads the
 * official menu PDF, extracts its text with `pdftotext -layout`, and uses OpenAI
 * to structure that text into our JSON schema, written to
 * content/irctc-train-food-menu/<slug>.json (rendered by the pages).
 *
 * Requires: `pdftotext` on PATH (poppler) and OPENAI_API_KEY (read from
 * backend/.env, same as scripts/translate-glossary.ts).
 *
 * Run:  npx tsx scripts/ingest-train-food-menus.ts            # all, skip existing
 *       npx tsx scripts/ingest-train-food-menus.ts --force    # re-extract all
 *       npx tsx scripts/ingest-train-food-menus.ts 22895 20101 # only these trains
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import OpenAI from "openai";
import { buildFoodMenuSlug } from "../lib/foodMenuSlug";

const INDEX_URL = "https://menurates.irctc.co.in/";
const PDF_BASE = "https://menurates.irctc.co.in/PDFFiles/VandeBharat";

// Trains whose menu is published as an HTML page (Tejas), not a Vande Bharat
// PDF. Keyed by canonical (lower) train number.
const HTML_SOURCES: Record<string, { url: string; pair: string }> = {
  "82501": {
    url: "https://menurates.irctc.co.in/tejasMenu82501-02.html",
    pair: "82501-02",
  },
  "82901": {
    url: "https://menurates.irctc.co.in/tejasMenu82901-02.html",
    pair: "82901-02",
  },
};

function sourceFor(trainNo: string): {
  url: string;
  kind: "pdf" | "html";
  pair?: string;
} {
  const html = HTML_SOURCES[trainNo];
  if (html) return { url: html.url, kind: "html", pair: html.pair };
  return { url: `${PDF_BASE}/${trainNo}.pdf`, kind: "pdf" };
}

function htmlToText(url: string): string {
  return curlText(url)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
const OUT_DIR = path.join(__dirname, "../content/irctc-train-food-menu");
const ENV_PATH = path.join(__dirname, "../backend/.env");
const MODEL = process.env.OPENAI_MENU_MODEL || "gpt-4o";
const CONCURRENCY = 5;

function getApiKey(): string | undefined {
  if (!fs.existsSync(ENV_PATH)) return process.env.OPENAI_API_KEY;
  const m = fs
    .readFileSync(ENV_PATH, "utf8")
    .match(/OPENAI_API_KEY=["']?([^"'\n\s]+)["']?/);
  return m ? m[1] : process.env.OPENAI_API_KEY;
}

// menurates.irctc.co.in uses legacy TLS renegotiation that Node's fetch
// rejects (ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED), so we shell out to
// curl for the index + PDF downloads. OpenAI calls still use the SDK.
function curlText(url: string): string {
  return execFileSync(
    "curl",
    ["-sL", "--retry", "3", "--retry-delay", "2", "--max-time", "90", url],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function fetchVandeBharatTrainNumbers(): string[] {
  const html = curlText(INDEX_URL);
  const set = new Set<string>();
  for (const m of html.matchAll(/PDFFiles\/VandeBharat\/(\d+)\.pdf/gi)) {
    set.add(m[1]);
  }
  return [...set].sort();
}

function downloadPdfText(trainNo: string): string {
  // Optional local text cache (pdftotext output) to skip the slow/flaky IRCTC
  // downloads: set MENU_TXT_CACHE to a dir containing <trainNo>.txt files.
  const cacheDir = process.env.MENU_TXT_CACHE;
  if (cacheDir) {
    const cached = path.join(cacheDir, `${trainNo}.txt`);
    if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
      return fs.readFileSync(cached, "utf8");
    }
  }
  const tmp = path.join(os.tmpdir(), `vbmenu-${trainNo}.pdf`);
  try {
    execFileSync("curl", [
      "-sL",
      "--retry",
      "3",
      "--retry-delay",
      "2",
      "--max-time",
      "90",
      "-o",
      tmp,
      `${PDF_BASE}/${trainNo}.pdf`,
    ]);
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) {
      throw new Error(`PDF ${trainNo} download empty`);
    }
    const head = fs.readFileSync(tmp).subarray(0, 4).toString();
    if (!head.startsWith("%PDF")) throw new Error(`PDF ${trainNo} not a PDF`);
    return execFileSync("pdftotext", ["-layout", tmp, "-"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const SYSTEM_PROMPT = `You convert the text of an official IRCTC Vande Bharat train catering menu (extracted from a PDF with pdftotext -layout) into structured JSON.

Output ONLY a JSON object with this exact shape:
{
  "trainNumber": string,        // the lower number of the pair, e.g. "22439"
  "trainNumberPair": string,    // pair as printed, e.g. "22439-40"
  "trainName": string,          // name WITHOUT the route prefix, e.g. "Vande Bharat Express"
  "route": string,              // station-code route as printed, e.g. "NDLS-SVDK"
  "originCode": string,         // first code of the route, e.g. "NDLS"
  "destinationCode": string,    // last code of the route, e.g. "SVDK"
  "classes": [
    {
      "classCode": string,      // as printed: "CC", "EC", etc.
      "className": string,      // "Chair Car" for CC, "Executive Chair Car" for EC
      "services": [
        {
          "service": string,    // meal/service label, e.g. "Morning Tea", "Breakfast", "Lunch/Dinner", "Evening Snacks"
          "price": number|null, // INR, taxes inclusive (the "NN/-" rate for that service). null if the PDF gives no price.
          "items": [ { "item": string, "description": string } ]
        }
      ]
    }
  ],
  "notes": string[]
}

Rules:
- A single PDF usually has separate tables per class (e.g. "(CC Classes)" and "(EC Classes)"). Produce one entry in "classes" per class table.
- "price" is the per-service rate printed in the Rates ("inclusive of taxes") column, as an integer (drop the "/-"). If a service has no printed rate, use null. NEVER invent a price.
- "item" is the left/group label (e.g. "Hot Beverage", "Rice dish", "Dal", "Special Dish (Main Course)", "Indian Bread", "Dessert"). "description" is what is served, cleaned into a single readable line.
- Some menus print weekly variants as separate "Menu 1 / Menu 2 / Menu 3" columns or as cyclic options; merge those into the item's description as one line (e.g. "served on a weekly cyclic basis: (1) ...; (2) ...; (3) ...").
- Keep food names and brands as written. Fix obvious OCR typos like "Nakin" -> "Napkin", "kectup" -> "ketchup".
- Do NOT use em dashes. Use commas, full stops or normal hyphens.
- "notes" is the numbered Note list at the bottom, each note as one cleaned string (drop the leading numbers).
- Do not add, drop or hallucinate services or classes. Only use what the text contains.
- Some menus (e.g. Tejas) are HTML, list "Chair Car" and "Executive Class" as two side-by-side columns, and have NO prices (set every price to null). The class codes are CC (Chair Car) and EC (Executive Class).
- A single page may cover BOTH directions of a train pair (e.g. "82501 Ex LJN to NDLS" AND "82502 Ex NDLS to LJN"), each with its own meals. Combine ALL services from every direction into each class's services list, using the printed service names (Morning Tea, Breakfast, Light Refreshment, Evening Tea, Lunch/Dinner, Dinner). Do not drop a direction.
- For Executive Class columns that say "Same as CC" (with or without premium additions), still output that EC service in full: reuse the Chair Car items for it, and append one item like { "item": "Executive Class extras", "description": "<the premium additions text>" }. Never leave an EC service empty or omit it.
- "route" uses the first direction's endpoints (e.g. "LJN-NDLS"). "trainName" should be the full name, e.g. "Tejas Express" (not just "Tejas").`;

type MenuItem = { item: string; description: string };
type MenuService = { service: string; price: number | null; items: MenuItem[] };
type MenuClass = { classCode: string; className: string; services: MenuService[] };
type ExtractedMenu = {
  trainNumber: string;
  trainNumberPair: string;
  trainName: string;
  route: string;
  originCode: string;
  destinationCode: string;
  classes: MenuClass[];
  notes: string[];
};

function validate(m: ExtractedMenu, trainNo: string): string | null {
  if (!m || typeof m !== "object") return "not an object";
  if (!m.trainName) return "missing trainName";
  if (!Array.isArray(m.classes) || m.classes.length === 0) return "no classes";
  for (const c of m.classes) {
    if (!c.classCode || !Array.isArray(c.services) || c.services.length === 0)
      return `class ${c.classCode} has no services`;
    for (const s of c.services) {
      if (!s.service) return "service missing name";
      if (s.price != null && typeof s.price !== "number")
        return `service ${s.service} price not numeric`;
      if (!Array.isArray(s.items) || s.items.length === 0)
        return `service ${s.service} has no items`;
    }
  }
  return null;
}

async function extractOne(client: OpenAI, trainNo: string): Promise<ExtractedMenu> {
  const src = sourceFor(trainNo);
  const text = src.kind === "html" ? htmlToText(src.url) : downloadPdfText(trainNo);
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Train number on the index: ${trainNo}\n\nMenu text:\n${text}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as ExtractedMenu;
  const err = validate(parsed, trainNo);
  if (err) throw new Error(`validation failed: ${err}`);
  return parsed;
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY (set it in backend/.env).");
    process.exit(1);
  }
  const client = new OpenAI({ apiKey });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const explicit = args.filter((a) => /^\d{3,6}$/.test(a));

  const trains = explicit.length
    ? explicit
    : await fetchVandeBharatTrainNumbers();
  console.log(`Processing ${trains.length} trains (model=${MODEL}, force=${force}).`);

  const ok: string[] = [];
  const failed: { trainNo: string; reason: string }[] = [];
  const skipped: string[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < trains.length) {
      const trainNo = trains[cursor++];
      try {
        const menu = await extractOne(client, trainNo);
        const src = sourceFor(trainNo);
        // The requested train number is authoritative for the slug + canonical
        // number — the model can mis-read/copy the number from the source.
        const pair =
          src.pair ||
          (menu.trainNumberPair && menu.trainNumberPair.includes(trainNo)
            ? menu.trainNumberPair
            : trainNo);
        const slug = buildFoodMenuSlug(
          `${menu.route} ${menu.trainName}`.trim(),
          trainNo,
        );
        const outPath = path.join(OUT_DIR, `${slug}.json`);
        if (fs.existsSync(outPath) && !force) {
          skipped.push(trainNo);
          console.log(`skip ${trainNo} (exists: ${slug})`);
          continue;
        }
        const record = {
          ...menu,
          trainNumber: trainNo,
          trainNumberPair: pair,
          slug,
          sourcePdfUrl: src.url,
          generatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
        ok.push(trainNo);
        console.log(`ok   ${trainNo} -> ${slug}.json`);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        failed.push({ trainNo, reason });
        console.warn(`FAIL ${trainNo}: ${reason}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, trains.length) }, worker),
  );

  console.log(
    `\nDone. written=${ok.length} skipped=${skipped.length} failed=${failed.length}`,
  );
  if (failed.length) {
    console.log("Failed trains:");
    for (const f of failed) console.log(`  ${f.trainNo}: ${f.reason}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
