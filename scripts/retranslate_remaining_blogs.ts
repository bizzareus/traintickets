import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const LANGUAGES = [
  { code: 'hi', name: 'Hindi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' }
];

const FILES = [
  'vande-bharat-train-rules-booking-routes.md',
  'vande-bharat-routes-manufacturing-guide.md',
  'toy-train-routes-booking-india-guide.md'
];

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
1. YAML Frontmatter: Translate only the values for "title" and "description" fields. Translate the "tags" array list. Do NOT translate or change any keys ("title", "description", "date", "updated", "tags"). Do NOT change the date values. Keep the exact frontmatter format.
2. Direct Literal Phrasing: Do NOT attempt to rewrite paragraphs or make the flow overly sophisticated, elegant, or grammatically idealized. Instead, translate the English text literally, preserving the sentence structure and word order of the English source as closely as possible. Translate idioms literally (e.g., translate phrases like "one-way street", "lion's share", "off the table", "run around" word-for-word into their literal target equivalents).
3. English Terminology: Retain standard English ticketing terminology and abbreviations directly (such as WL, RAC, PNR, TTE, IRCTC, Tatkal, Premium Tatkal) in English script rather than translating or transliterating them.
4. Keep all Markdown formatting intact: retain H2 and H3 headings, bold text, bullet points, dashes, separators, and tables exactly as they are.
5. Structural Preservation: Retain all H2 questions and H3 FAQ headings exactly, ensuring the structure mirrors the original English version.
6. Strictly output ONLY the translated markdown content. Do not add any introduction, explanations, notes, or conversational text.`;

  const maxRetries = 3;
  let attempt = 0;
  let completion;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`   (Attempt ${attempt}/${maxRetries} to call OpenAI...)`);
      const apiCall = client.chat.completions.create({
        model: langCode === 'ml' ? 'gpt-4o' : 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content }
        ],
        temperature: 0.3
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Promise Timeout (300s)')), 300000)
      );

      completion = await Promise.race([apiCall, timeoutPromise]) as any;
      break; // Success!
    } catch (err: any) {
      console.error(`   ⚠️ Attempt ${attempt} failed: ${err?.message || err}`);
      if (attempt >= maxRetries) {
        throw err;
      }
      console.log('   Waiting 5 seconds before retrying...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  let translated = completion?.choices[0]?.message?.content || '';
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
  console.log('🤖 OpenAI client initialized successfully.');

  for (const filename of FILES) {
    const srcPath = path.join(BLOG_DIR, filename);
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ Source English file not found at: ${srcPath}`);
      continue;
    }

    const englishContent = fs.readFileSync(srcPath, 'utf8');
    console.log(`\n📂 Read source English blog post: ${filename}`);

    for (const lang of LANGUAGES) {
      const destDir = path.join(BLOG_DIR, lang.code);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = path.join(destDir, filename);
      console.log(`Translating ${filename} into ${lang.name} (${lang.code})...`);

      try {
        const translatedContent = await translateFile(client, englishContent, lang.name, lang.code);
        fs.writeFileSync(destPath, translatedContent, 'utf8');
        console.log(`   ✅ Saved to: content/blog/${lang.code}/${filename}`);
      } catch (err) {
        console.error(`   ❌ Failed to translate ${filename} to ${lang.code}:`, err instanceof Error ? err.message : String(err));
      }

      // Wait 2 seconds between requests
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log('\n🎉 Retranslation of remaining blogs complete.');
}

run().catch((err) => {
  console.error('Critical retranslation runner error:', err);
  process.exit(1);
});
