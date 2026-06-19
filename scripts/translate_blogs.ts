import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

// Supported languages and their names
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

// Simple parser to extract API key from backend/.env
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

Strict Rules:
1. YAML Frontmatter: Translate only the values for "title" and "description" fields. Translate the "tags" array list. Do NOT translate or change any keys ("title", "description", "date", "updated", "tags"). Do NOT change the date values. Keep the exact frontmatter format.
2. Natural Regional Phrasing: Do NOT use direct word-for-word machine translation that sounds robotic or awkward. Use natural, common vocabulary and terminology that a native speaker of ${langName} in India would use when talking about train travel (e.g., proper regional terms for 'Reservation', 'Waiting List', 'Chart Preparation', 'Refunds').
3. Keep all Markdown formatting intact: retain H2 and H3 headings, bold text, bullet points, dashes, separators, and tables exactly as they are.
4. Structural Preservation: Retain all H2 questions and H3 FAQ headings exactly, ensuring the structure mirrors the original English version.
5. Strictly output ONLY the translated markdown content. Do not add any introduction, explanations, notes, or conversational text.`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ],
    temperature: 0.3
  });

  let translated = completion.choices[0].message.content || '';
  
  // Clean up any markdown code block wrap (e.g. ```markdown ... ```) if returned by the LLM
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

  // Find all English blog markdown files (root of content/blog/)
  const files = fs.readdirSync(BLOG_DIR).filter((file) => {
    const filePath = path.join(BLOG_DIR, file);
    return fs.statSync(filePath).isFile() && file.endsWith('.md');
  });

  console.log(`📂 Found ${files.length} English source blog posts.`);

  let totalTranslationsNeeded = 0;
  const queue: { srcPath: string; destPath: string; lang: typeof LANGUAGES[0]; filename: string }[] = [];

  // Build the queue of translations needed
  for (const file of files) {
    const srcPath = path.join(BLOG_DIR, file);
    const content = fs.readFileSync(srcPath, 'utf8');

    for (const lang of LANGUAGES) {
      const destDir = path.join(BLOG_DIR, lang.code);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = path.join(destDir, file);
      if (fs.existsSync(destPath)) {
        // Already exists, skip
        continue;
      }

      queue.push({ srcPath, destPath, lang, filename: file });
      totalTranslationsNeeded++;
    }
  }

  console.log(`🔄 Total new translation files to write: ${totalTranslationsNeeded}`);

  if (queue.length === 0) {
    console.log('✅ All translations are already up-to-date! Nothing to do.');
    process.exit(0);
  }

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    console.log(`[${i + 1}/${queue.length}] Translating ${item.filename} into ${item.lang.name} (${item.lang.code})...`);

    try {
      const englishContent = fs.readFileSync(item.srcPath, 'utf8');
      const translatedContent = await translateFile(client, englishContent, item.lang.name, item.lang.code);
      
      fs.writeFileSync(item.destPath, translatedContent, 'utf8');
      console.log(`   ✅ Saved to: content/blog/${item.lang.code}/${item.filename}`);
      successCount++;
    } catch (err) {
      console.error(`   ❌ Failed to translate ${item.filename} to ${item.lang.code}:`, err instanceof Error ? err.message : String(err));
      failureCount++;
    }

    // Rate limit buffer: wait 2 seconds between translations
    if (i < queue.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log('--------------------------------------------------');
  console.log(`🎉 Translation job finished! Success: ${successCount}, Failures: ${failureCount}`);
  console.log('--------------------------------------------------');
  process.exit(0);
}

run().catch((err) => {
  console.error('Critical translation runner error:', err);
  process.exit(1);
});
