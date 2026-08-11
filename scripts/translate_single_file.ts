import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const LANGUAGES: Record<string, string> = {
  hi: 'Hindi',
  mr: 'Marathi',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam'
};

const filename = process.argv[2];
const langCode = process.argv[3];

if (!filename || !langCode || !LANGUAGES[langCode]) {
  console.error(`❌ Usage: npx tsx scripts/translate_single_file.ts <filename.md> <langCode>`);
  process.exit(1);
}

const langName = LANGUAGES[langCode];
const BLOG_DIR = path.join(__dirname, '../content/blog');
const ENV_PATH = path.join(__dirname, '../backend/.env');

function getApiKey(): string | undefined {
  if (!fs.existsSync(ENV_PATH)) return undefined;
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  const match = envContent.match(/OPENAI_API_KEY=["']?([^"'\n\s]+)["']?/);
  return match ? match[1] : undefined;
}

async function translateFile(
  client: OpenAI,
  content: string,
  langName: string,
  langCode: string
): Promise<string> {
  const systemPrompt = `You are a professional translator and content writer specializing in Indian Railways (IRCTC) terminology and ticketing rules.
Translate the following English blog post into ${langName} (language code: ${langCode}).

Strict Rules for Low AI Detection (AI Bypass):
1. YAML Frontmatter: Translate only the values for "title" and "description" fields. Do NOT translate or change any "tags" array items - keep all tag values strictly in English. Do NOT translate or change any frontmatter keys ("title", "description", "date", "updated", "tags"). Do NOT change the date or updated values. Keep the exact frontmatter structure and format.
2. Direct Literal Phrasing: Do NOT attempt to rewrite paragraphs or make the flow overly sophisticated, elegant, or grammatically idealized. Instead, translate the English text literally, preserving the sentence structure and word order of the English source as closely as possible. Translate idioms literally.
3. English Terminology & Abbreviations: Retain standard English ticketing terminology and Latin abbreviations directly in English script (such as WL, RAC, PNR, TTE, IRCTC, GNWL, RLWL, PQWL, TDR, AC, SL, 1AC, 2AC, 3AC, Tatkal, Premium Tatkal, LastBerth) rather than translating or transliterating them into target regional script.
4. Keep all Markdown formatting and links intact: retain bold text, bullet points, dashes, separators, tables, and all markdown links [text](url) exactly as they are (do not modify link URLs or paths).
5. Structural Preservation: Translate the text of all H2 questions and H3 FAQ headings into the target language, but keep their Markdown structure (##, ###) and order identical to the English source.
6. Strictly output ONLY the translated markdown content. Do not add any introduction, explanations, notes, or conversational text.`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ],
    temperature: 0.3
  });

  let translated = completion.choices[0].message.content || '';
  translated = translated.trim();
  if (translated.startsWith('```markdown')) {
    translated = translated.replace(/^```markdown\r?\n/, '').replace(/\r?\n```$/, '');
  } else if (translated.startsWith('```md')) {
    translated = translated.replace(/^```md\r?\n/, '').replace(/\r?\n```$/, '');
  } else if (translated.startsWith('```') && translated.endsWith('```')) {
    translated = translated.replace(/^```\r?\n/, '').replace(/\r?\n```$/, '');
  }

  return translated.trim();
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ OpenAI API key is missing. Check backend/.env');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const srcPath = path.join(BLOG_DIR, filename);
  const destDir = path.join(BLOG_DIR, langCode);
  const destPath = path.join(destDir, filename);

  if (!fs.existsSync(srcPath)) {
    console.error(`❌ Source file not found: ${srcPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  console.log(`🤖 Translating ${filename} into ${langName} (${langCode})…`);
  const englishContent = fs.readFileSync(srcPath, 'utf8');
  const translatedContent = await translateFile(client, englishContent, langName, langCode);
  fs.writeFileSync(destPath, translatedContent, 'utf8');
  console.log(`✅ Saved successfully to ${destPath}`);
}

run().catch((err) => {
  console.error('❌ Critical error:', err);
  process.exit(1);
});
