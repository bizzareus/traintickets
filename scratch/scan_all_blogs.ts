import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

interface ScanResult {
  aiPercentage: number;
  flaggedSentences: string[];
}

// Cleans frontmatter, markdown tags, lists, links, image tags, etc.
function cleanMarkdown(rawContent: string): string {
  let cleanText = rawContent;
  
  // 1. Strip YAML frontmatter
  const frontmatterRegex = /^---[\s\S]*?---/;
  if (frontmatterRegex.test(rawContent)) {
    cleanText = rawContent.replace(frontmatterRegex, "").trim();
  }

  // 2. Remove fenced code blocks
  cleanText = cleanText.replace(/```[\s\S]*?```/g, "");

  // 3. Remove inline code/ticks
  cleanText = cleanText.replace(/`([^`]+)`/g, "$1");

  // 4. Remove links [text](url) but keep the text
  cleanText = cleanText.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

  // 5. Remove image tags ![alt](url)
  cleanText = cleanText.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "");

  // 6. Clean headers, emphasis, lists
  cleanText = cleanText
    .replace(/#{1,6}\s+/g, "") // Headers
    .replace(/[\*_]/g, "")     // Bold / Italic characters
    .replace(/^\s*[-*+]\s+/gm, "") // Bullet list markers
    .replace(/^\s*\d+\.\s+/gm, "")  // Numbered list markers
    .replace(/\s+/g, " ")       // Normalize whitespace
    .trim();

  return cleanText;
}

// Split text into chunks of maximum words (default 900 to stay safely under 1200 limit)
function chunkText(text: string, maxWords: number = 900): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }

  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    const lastChunkWordCount = lastChunk.split(/\s+/).filter(Boolean).length;
    if (lastChunkWordCount < 80) {
      const last = chunks.pop()!;
      chunks[chunks.length - 1] += " " + last;
    }
  }

  return chunks;
}

async function scanChunk(text: string, attempt: number = 1): Promise<ScanResult> {
  const browser = await chromium.launch({ headless: true });
  // Create a completely fresh context with standard user agent
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    await page.goto("https://quillbot.com/ai-content-detector", { waitUntil: "networkidle", timeout: 45000 });
    
    // Accept cookies if present
    const acceptCookies = page.getByRole("button", { name: "Accept All" });
    if (await acceptCookies.isVisible()) {
      await acceptCookies.click();
    }

    const editor = page.locator("[contenteditable='true']");
    if (!(await editor.isVisible())) {
      throw new Error("Editor not visible");
    }

    await editor.click();
    await editor.fill(text);

    // Dispatch input events
    await editor.evaluate((el: HTMLElement) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.keyboard.press("End");
    await page.keyboard.type(" ");

    const detectBtn = page.getByRole("button", { name: "Detect AI", exact: true });
    await detectBtn.click();

    // Wait for the results to load
    // If successful, classification attributes should be injected into spans inside the editor
    try {
      await page.waitForSelector("span[classification]", { timeout: 35000 });
    } catch (e) {
      // Sometimes it takes slightly longer or fails. Let's take a screenshot to debug if timeout occurs
      await page.screenshot({ path: `scratch/timeout_debug_${Date.now()}.png` });
      throw new Error("Results failed to load (timeout waiting for classification span).");
    }

    // Extract AI percentage from page body
    const aiPercentage = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      // Look for "X% of text is likely AI"
      const match = bodyText.match(/(\d+)\s*%?\s*of text is likely AI/i);
      if (match) return parseInt(match[1], 10);

      // Look for "AI-generated X%"
      const aiGenMatch = bodyText.match(/AI-generated\s*(\d+)\s*%/i);
      if (aiGenMatch) return parseInt(aiGenMatch[1], 10);

      return 0;
    });

    // Extract flagged sentences (AI or AI_REFINED)
    const flaggedSentences = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span[classification]"));
      return spans
        .filter(span => {
          const cls = span.getAttribute("classification");
          return cls === "AI" || cls === "AI_REFINED";
        })
        .map(span => span.textContent?.trim() || "")
        .filter(Boolean);
    });

    return { aiPercentage, flaggedSentences };

  } catch (err: any) {
    if (attempt < 2) {
      console.log(`Scan failed (${err.message}). Retrying in 5s...`);
      await page.waitForTimeout(5000);
      await browser.close();
      return scanChunk(text, attempt + 1);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

async function scanBlog(filePath: string) {
  const absolutePath = path.resolve(filePath);
  console.log(`\n==================================================`);
  console.log(`Scanning blog: ${path.basename(filePath)}`);
  console.log(`==================================================`);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const cleanedText = cleanMarkdown(content);
  const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;
  console.log(`Word count (clean): ${wordCount} words.`);

  const chunks = chunkText(cleanedText, 950);
  console.log(`Split into ${chunks.length} chunk(s) to scan.`);

  let maxAiPercentage = 0;
  const allFlagged: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Scanning Chunk ${i + 1}/${chunks.length} (${chunks[i].split(/\s+/).length} words)...`);
    try {
      const result = await scanChunk(chunks[i]);
      console.log(`Chunk ${i + 1} Result: AI likelihood = ${result.aiPercentage}%`);
      if (result.aiPercentage > maxAiPercentage) {
        maxAiPercentage = result.aiPercentage;
      }
      if (result.flaggedSentences.length > 0) {
        allFlagged.push(...result.flaggedSentences);
      }
    } catch (e: any) {
      console.error(`Error scanning Chunk ${i + 1}: ${e.message}`);
    }
    // Add small delay between chunks
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`\nSUMMARY FOR ${path.basename(filePath)}:`);
  console.log(`- Final Score: ${maxAiPercentage}% AI`);
  if (allFlagged.length > 0) {
    console.log(`- Flagged sentences (${allFlagged.length}):`);
    const uniqueFlagged = Array.from(new Set(allFlagged));
    uniqueFlagged.forEach((s, idx) => console.log(`  ${idx + 1}. "${s}"`));
  } else {
    console.log(`- No flagged sentences!`);
  }
  return { file: path.basename(filePath), score: maxAiPercentage, flagged: allFlagged };
}

async function main() {
  const target = process.argv[2];

  if (target) {
    // Scan single file
    await scanBlog(target);
  } else {
    // Scan all files in content/blog
    const blogDir = path.resolve("content/blog");
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
    console.log(`Found ${files.length} blogs to scan.`);

    const results: any[] = [];
    for (const file of files) {
      const res = await scanBlog(path.join(blogDir, file));
      if (res) {
        results.push(res);
      }
      // Delay between blogs to prevent rate limiting
      await new Promise(r => setTimeout(r, 5000));
    }

    console.log(`\n==================================================`);
    console.log(`OVERALL REPORT:`);
    console.log(`==================================================`);
    let cleanCount = 0;
    const flaggedBlogs: any[] = [];
    for (const r of results) {
      if (r.score === 0) {
        cleanCount++;
      } else {
        flaggedBlogs.push(r);
      }
    }
    console.log(`Total blogs: ${results.length}`);
    console.log(`Clean (0% AI): ${cleanCount}`);
    console.log(`Flagged (>0% AI): ${flaggedBlogs.length}`);
    if (flaggedBlogs.length > 0) {
      console.log(`\nFlagged details:`);
      flaggedBlogs.forEach(fb => {
        console.log(`- ${fb.file}: ${fb.score}% AI (${fb.flagged.length} sentences)`);
      });
    }
  }
}

main();
