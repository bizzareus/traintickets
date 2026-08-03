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
1. YAML Frontmatter: Translate only the values for "title" and "description" fields. Translate the "tags" array list. Do NOT translate or change any keys ("title", "description", "date", "updated", "tags"). Do NOT change the date values. Keep the exact frontmatter format.
2. Direct Literal Phrasing: Do NOT attempt to rewrite paragraphs or make the flow overly sophisticated, elegant, or grammatically idealized. Instead, translate the English text literally, preserving the sentence structure and word order of the English source as closely as possible.
3. English Terminology: Retain standard English ticketing terminology and abbreviations directly (such as WL, RAC, PNR, TTE, IRCTC, Tatkal, Premium Tatkal, CURR_AVBL, 3A, 3E, UB, MB, LB) in English script rather than translating or transliterating them.
4. Keep all Markdown formatting intact: retain bold text, bullet points, dashes, separators, and tables exactly as they are.
5. Structural Preservation: Translate the text of all H2 questions and H3 FAQ headings into the target language, but keep their Markdown structure (##, ###) and order identical to the English source.
6. Strictly output ONLY the translated markdown content. Do not add any introduction, explanations, notes, or conversational text.`;

  const completion = await client.chat.completions.create({
    model: langCode === 'ml' ? 'gpt-4o' : 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ],
    temperature: 0.3
  });

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
  const targetFiles = process.argv.slice(2);
  if (targetFiles.length === 0) {
    console.error('❌ Usage: npx tsx scripts/translate_updated_blogs.ts <file1.md> <file2.md> ...');
    process.exit(1);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ OpenAI API key is missing. Check backend/.env');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  console.log(`🤖 Starting translation for ${targetFiles.length} updated files across ${LANGUAGES.length} languages...`);

  for (const filename of targetFiles) {
    const srcPath = path.join(BLOG_DIR, filename);
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ Source file not found: ${srcPath}`);
      continue;
    }

    const englishContent = fs.readFileSync(srcPath, 'utf8');

    for (const lang of LANGUAGES) {
      const destDir = path.join(BLOG_DIR, lang.code);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const destPath = path.join(destDir, filename);

      console.log(`🌐 Translating ${filename} → ${lang.name} (${lang.code})...`);
      try {
        const translatedContent = await translateFile(client, englishContent, lang.name, lang.code);
        fs.writeFileSync(destPath, translatedContent, 'utf8');
        console.log(`  ✅ Saved: content/blog/${lang.code}/${filename}`);
      } catch (err: any) {
        console.error(`  ❌ Error translating ${filename} to ${lang.code}:`, err?.message || err);
      }
    }
  }

  console.log('🎉 Translation of updated blog posts finished successfully!');
}

run().catch((err) => {
  console.error('Critical error:', err);
  process.exit(1);
});
