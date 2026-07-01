/**
 * ingest-standard-menus.ts — extract IRCTC standard class/zone catering menus
 * (Rajdhani/premium 1AC-EC, AC 2A-3A-CC, Duronto sleeper) into structured JSON.
 *
 * Each source PDF is one class-group + zone (or special diet). Structure is
 * service (Morning Tea / Breakfast / Lunch/Dinner / Evening Snacks) x 7 daily
 * "Sets", each set a combo, with one price per service (incl. taxes).
 *
 * Requires pdftotext + OPENAI_API_KEY (backend/.env). Reads a local text cache
 * (STD_TXT_CACHE=<dir with <file>.txt>) when set, else downloads via curl.
 *
 * Run: npx tsx scripts/ingest-standard-menus.ts            # all, skip existing
 *      npx tsx scripts/ingest-standard-menus.ts 2a3acc-North --force
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import OpenAI from "openai";

const BASE = "https://menurates.irctc.co.in";
const OUT_DIR = path.join(__dirname, "../content/standard-menu");
const ENV_PATH = path.join(__dirname, "../backend/.env");
const MODEL = process.env.OPENAI_MENU_MODEL || "gpt-4o";
const CONCURRENCY = 4;

type Source = {
  key: string; // <classGroup>-<zone>, also cache filename + output slug
  classGroup: string;
  classGroupName: string;
  zone: string;
  url: string;
};

const CLASS_GROUPS = [
  {
    cg: "1AC-EC",
    name: "AC First Class & Executive Chair Car",
    dir: "1AC-EC",
    zones: ["East", "North", "West", "South-Central", "South", "Jain-Meal", "Diabetic-Meal", "Continental-Menu"],
  },
  {
    cg: "2A-3A-CC",
    name: "AC 2-Tier, 3-Tier & Chair Car",
    dir: "2A-3A-CC",
    zones: ["East", "North", "West", "South-Central", "South", "Jain-Meal", "Diabetic-Meal"],
  },
  {
    cg: "duronto-sleeper",
    name: "Duronto Sleeper Class",
    dir: "duronto-sleeper-class-menu",
    zones: ["East", "North", "West", "South-Central", "South", "Jain-Meal", "Diabetic-Meal"],
  },
];

const SOURCES: Source[] = CLASS_GROUPS.flatMap((g) =>
  g.zones.map((z) => ({
    key: `${g.cg.toLowerCase().replace(/[^a-z0-9]+/g, "")}-${z}`.toLowerCase(),
    classGroup: g.cg,
    classGroupName: g.name,
    zone: z.replace(/-/g, " "),
    url: `${BASE}/PDFFiles/${g.dir}/${z}.pdf`,
  })),
);

function getApiKey(): string | undefined {
  if (!fs.existsSync(ENV_PATH)) return process.env.OPENAI_API_KEY;
  const m = fs
    .readFileSync(ENV_PATH, "utf8")
    .match(/OPENAI_API_KEY=["']?([^"'\n\s]+)["']?/);
  return m ? m[1] : process.env.OPENAI_API_KEY;
}

/** Cache filename used by the local text cache (matches scratchpad naming). */
function cacheName(src: Source): string {
  const g = src.classGroup === "1AC-EC" ? "1acec" : src.classGroup === "2A-3A-CC" ? "2a3acc" : "duronto";
  return `${g}-${src.zone.replace(/ /g, "-")}`;
}

function getText(src: Source): string {
  const cacheDir = process.env.STD_TXT_CACHE;
  if (cacheDir) {
    const fp = path.join(cacheDir, `${cacheName(src)}.txt`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 0) return fs.readFileSync(fp, "utf8");
  }
  const tmp = path.join(os.tmpdir(), `std-${src.key}.pdf`);
  try {
    execFileSync("curl", ["-sL", "--retry", "3", "--retry-delay", "2", "--max-time", "90", "-o", tmp, src.url]);
    return execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const SYSTEM_PROMPT = `You convert an official IRCTC standard train catering menu (extracted from a PDF with pdftotext -layout) into structured JSON. These menus are organised by "Type of Service" (e.g. Morning Tea, Breakfast, Lunch/Dinner, Evening Snacks, Evening Tea) and, for each service, up to 7 daily menu "Sets" (Set-1..Set-7) laid out as columns, with ONE price per service in the "Rates (Incl taxes)" column.

Output ONLY a JSON object:
{
  "services": [
    {
      "service": string,     // e.g. "Morning Tea", "Breakfast", "Lunch/Dinner", "Evening Snacks"
      "price": number|null,  // the per-service rate (integer, drop "/-"); null if none printed
      "sets": [ string ]     // the DISTINCT daily set combos for this service, each a single readable line
    }
  ]
}

Rules:
- Read the columns Set-1..Set-7 for each service and list the combos in "sets". If several sets are identical, collapse them to ONE entry (do not repeat). If they differ (common for Breakfast/Snacks/Lunch), list each distinct combo.
- Keep each set as one clean line. Preserve "Or" choices within a set (e.g. veg option "Or" egg option) as "... OR ...".
- "price" is the number in the Rates column for that service. Never invent a price.
- Fix obvious OCR typos (Berverages -> Beverages, Nakin -> Napkin). Do NOT use em dashes.
- Only include services actually present. Do not hallucinate.`;

type StdService = { service: string; price: number | null; sets: string[] };

function validate(o: { services?: StdService[] }): string | null {
  if (!o || !Array.isArray(o.services) || o.services.length === 0) return "no services";
  for (const s of o.services) {
    if (!s.service) return "service missing name";
    if (!Array.isArray(s.sets) || s.sets.length === 0) return `service ${s.service} has no sets`;
  }
  return null;
}

async function extractOne(client: OpenAI, src: Source): Promise<{ services: StdService[] }> {
  const text = getText(src);
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Class group: ${src.classGroupName}. Zone: ${src.zone}.\n\nMenu text:\n${text}` },
    ],
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}") as { services: StdService[] };
  const err = validate(parsed);
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
  const only = args.filter((a) => !a.startsWith("--"));
  const targets = only.length ? SOURCES.filter((s) => only.includes(s.key) || only.includes(cacheName(s))) : SOURCES;

  console.log(`Processing ${targets.length} menus (model=${MODEL}, force=${force}).`);
  const ok: string[] = [];
  const failed: { key: string; reason: string }[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const src = targets[cursor++];
      const outPath = path.join(OUT_DIR, `${src.key}.json`);
      if (fs.existsSync(outPath) && !force) {
        console.log(`skip ${src.key}`);
        continue;
      }
      try {
        const { services } = await extractOne(client, src);
        const record = {
          classGroup: src.classGroup,
          classGroupName: src.classGroupName,
          zone: src.zone,
          key: src.key,
          services,
          sourcePdfUrl: src.url,
          generatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
        ok.push(src.key);
        console.log(`ok   ${src.key} (${services.length} services)`);
      } catch (e) {
        failed.push({ key: src.key, reason: e instanceof Error ? e.message : String(e) });
        console.warn(`FAIL ${src.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  console.log(`\nDone. written=${ok.length} failed=${failed.length}`);
  failed.forEach((f) => console.log(`  ${f.key}: ${f.reason}`));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
