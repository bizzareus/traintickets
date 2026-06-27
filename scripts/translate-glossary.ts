/**
 * translate-glossary.ts — generate per-language glossary translations with OpenAI,
 * mirroring scripts/translate_blogs.ts. English (lib/seo/glossary-db.ts) is the
 * source; this writes content/glossary/<lang>.json as { id: { term, definition } },
 * which the glossary pages merge over English (missing fields fall back).
 *
 * Run:  OPENAI_API_KEY in backend/.env, then `npx tsx scripts/translate-glossary.ts`
 *       (or `npx tsx scripts/translate-glossary.ts hi` for one language).
 */
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { GLOSSARY_TERMS } from "../lib/seo/glossary-db";

const LANGUAGES = [
  { code: "hi", name: "Hindi" },
  { code: "mr", name: "Marathi" },
  { code: "bn", name: "Bengali" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
];

const OUT_DIR = path.join(__dirname, "../content/glossary");
const ENV_PATH = path.join(__dirname, "../backend/.env");

function getApiKey(): string | undefined {
  if (!fs.existsSync(ENV_PATH)) return process.env.OPENAI_API_KEY;
  const m = fs
    .readFileSync(ENV_PATH, "utf8")
    .match(/OPENAI_API_KEY=["']?([^"'\n\s]+)["']?/);
  return m ? m[1] : process.env.OPENAI_API_KEY;
}

async function translateLang(
  client: OpenAI,
  langName: string,
  langCode: string,
): Promise<Record<string, { term: string; definition: string }>> {
  const source = GLOSSARY_TERMS.map((t) => ({
    id: t.id,
    term: t.term,
    definition: t.definition,
  }));

  const systemPrompt = `You translate an Indian Railways (IRCTC) glossary into ${langName} (code: ${langCode}).
Rules:
- Output ONLY a JSON object keyed by the term "id", each value { "term": "...", "definition": "..." }. Use the exact same ids.
- Keep standard ticketing abbreviations in English script: WL, RAC, CNF, PNR, GNWL, RLWL, PQWL, TDR, IRCTC, Tatkal, AC, SL, 3A, 2A, 1A, CC, 2S, LB, MB, UB, SU. Translate the surrounding explanation.
- Write the way a real person would explain it to a friend: simple, natural, conversational. Do not make it formal or robotic.
- Do NOT use em dashes (—). Use commas, full stops or normal hyphens.
- Translate every id. Do not add or drop any.`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(source) },
    ],
  });

  const raw = completion.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Some models wrap the map under a "terms" key; unwrap if so.
  const maybeWrapped = parsed.terms;
  const obj =
    maybeWrapped && typeof maybeWrapped === "object" ? maybeWrapped : parsed;
  return obj as Record<string, { term: string; definition: string }>;
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("OpenAI API key missing. Set OPENAI_API_KEY in backend/.env.");
    process.exit(1);
  }
  const client = new OpenAI({ apiKey });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const only = process.argv[2];
  const langs = only ? LANGUAGES.filter((l) => l.code === only) : LANGUAGES;
  if (langs.length === 0) {
    console.error(`Unknown language: ${only}`);
    process.exit(1);
  }

  for (const lang of langs) {
    process.stdout.write(`Translating glossary -> ${lang.name} (${lang.code})… `);
    try {
      const obj = await translateLang(client, lang.name, lang.code);
      const outPath = path.join(OUT_DIR, `${lang.code}.json`);
      fs.writeFileSync(outPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
      console.log(`wrote ${Object.keys(obj).length} terms -> ${outPath}`);
    } catch (err) {
      console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

void run();
