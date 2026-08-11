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

const langCode = process.argv[2];
if (!langCode || !LANGUAGES[langCode]) {
  console.error(`❌ Invalid or missing language code. Supported: ${Object.keys(LANGUAGES).join(', ')}`);
  process.exit(1);
}

const langName = LANGUAGES[langCode];
const BLOG_DIR = path.join(__dirname, '../content/blog');
const ENV_PATH = path.join(__dirname, '../backend/.env');

function getApiKey(): string | undefined {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`❌ Env file not found at: ${ENV_PATH}`);
    return undefined;
  }
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
  console.log(`🤖 Starting translation pipeline for language: ${langName} (${langCode})`);

  const files = fs.readdirSync(BLOG_DIR).filter((file) => {
    const filePath = path.join(BLOG_DIR, file);
    return fs.statSync(filePath).isFile() && file.endsWith('.md');
  });

  const destDir = path.join(BLOG_DIR, langCode);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const missingFiles = files.filter((file) => {
    const destPath = path.join(destDir, file);
    return !fs.existsSync(destPath);
  });

  console.log(`📂 Found ${files.length} English source files. Missing translations: ${missingFiles.length}`);

  if (missingFiles.length === 0) {
    console.log(`✅ All translations for ${langName} are already up-to-date!`);
    process.exit(0);
  }

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < missingFiles.length; i++) {
    const filename = missingFiles[i];
    const srcPath = path.join(BLOG_DIR, filename);
    const destPath = path.join(destDir, filename);

    console.log(`[${i + 1}/${missingFiles.length}] Translating ${filename} into ${langName}...`);

    try {
      const englishContent = fs.readFileSync(srcPath, 'utf8');
      const translatedContent = await translateFile(client, englishContent, langName, langCode);
      
      fs.writeFileSync(destPath, translatedContent, 'utf8');
      console.log(`   ✅ Saved successfully.`);
      successCount++;
    } catch (err) {
      console.error(`   ❌ Failed:`, err instanceof Error ? err.message : String(err));
      failureCount++;
    }

    // Rate limit buffer: wait 2 seconds between completions
    if (i < missingFiles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log(`🎉 Finished translating to ${langName}. Success: ${successCount}, Failures: ${failureCount}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Critical error in single language translator:', err);
  process.exit(1);
});
