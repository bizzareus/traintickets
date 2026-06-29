import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

async function validateBlog(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading blog file: ${filePath}`);
  const rawContent = fs.readFileSync(filePath, "utf-8");

  // Strip YAML frontmatter
  let cleanText = rawContent;
  const frontmatterRegex = /^---[\s\S]*?---/;
  if (frontmatterRegex.test(rawContent)) {
    cleanText = rawContent.replace(frontmatterRegex, "").trim();
  }

  // Remove markdown headers, links, list characters to make it plain text
  cleanText = cleanText
    .replace(/#{1,6}\s+/g, "") // Headers
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1") // Links
    .replace(/[\*_`\-]/g, "") // Emphasis and lists
    .trim();

  // Make sure we have enough words (QuillBot needs at least 80 words)
  let words = cleanText.split(/\s+/).filter(Boolean);
  let wordCount = words.length;
  console.log(`Extracted plain text: ${wordCount} words.`);
  if (wordCount < 80) {
    console.error("Text is too short for QuillBot AI Detector (minimum 80 words required).");
    process.exit(1);
  }

  // Quillbot free allows up to 1200 words, let's scan the first 350 words to be safe and fast.
  if (wordCount > 350) {
    console.log(`Text exceeds 350 words (${wordCount} words). Slicing to the first 350 words for QuillBot compatibility.`);
    words = words.slice(0, 350);
    cleanText = words.join(" ");
    wordCount = 350;
  }

  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    console.log("Navigating to QuillBot AI Content Detector...");
    await page.goto("https://quillbot.com/ai-content-detector", { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for the body or editor to start loading
    await page.waitForSelector("[contenteditable='true']", { timeout: 15000 }).catch(() => {});
    
    // Hide cookie banner and overlay via CSS injection
    await page.addStyleTag({
      content: '#onetrust-consent-sdk, .onetrust-pc-dark-filter, .ot-sdk-container { display: none !important; pointer-events: none !important; }'
    });
    console.log("Injected CSS to hide cookie banner and overlay");
    console.log("Removed cookie banner and overlay");

    const editor = page.locator("[contenteditable='true']");
    if (!(await editor.isVisible())) {
      throw new Error("Could not locate the contenteditable text area.");
    }

    console.log("Filling editor with blog text...");
    await editor.click();
    await editor.fill(cleanText);

    // Dispatch custom events to register content changes
    await editor.evaluate((el: HTMLElement) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
    });

    // Press End and space to ensure it registers the word count
    await page.keyboard.press("End");
    await page.keyboard.type(" ");

    await page.waitForTimeout(2000);

    const detectBtn = page.getByRole("button", { name: "Detect AI", exact: true });
    if (!(await detectBtn.isVisible())) {
      throw new Error("Could not locate the 'Detect AI' button.");
    }

    const isEnabled = await detectBtn.isEnabled();
    console.log(`Detect button is enabled: ${isEnabled}`);
    
    await detectBtn.click();
    console.log("Clicked 'Detect AI'. Waiting 35 seconds for analysis...");
    await page.waitForTimeout(35000);

    // Save screenshot
    await page.screenshot({ path: "scratch/quillbot_blog_results.png" });
    console.log("Saved results screenshot to scratch/quillbot_blog_results.png");

    const bodyText = await page.locator("body").innerText();
    const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);

    console.log("\n--- DETECTOR OUTPUT ---");
    let aiPercentage: string | null = null;
    let humanPercentage: string | null = null;

    // Output all lines containing percentages, AI, or human references to see result clearly
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      if (lower.includes("%") || lower.includes("ai") || lower.includes("human")) {
        console.log(`Line ${i}: ${line}`);
      }
    });
    console.log("------------------------\n");

  } catch (err: any) {
    console.error("Error during validation:", err.message);
  } finally {
    await browser.close();
  }
}

// Get file from command line
const blogFile = process.argv[2];
if (!blogFile) {
  console.error("Please provide a path to the blog markdown file.");
  process.exit(1);
}

validateBlog(path.resolve(blogFile));
