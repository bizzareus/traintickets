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

  // Make sure we have enough words (QuillBot needs at least 40-80 words)
  let words = cleanText.split(/\s+/).filter(Boolean);
  let wordCount = words.length;
  console.log(`Extracted plain text: ${wordCount} words.`);
  if (wordCount < 40) {
    console.error("Text is too short for QuillBot AI Detector (minimum 40 words required).");
    process.exit(1);
  }

  if (wordCount > 1000) {
    console.log(`Text exceeds 1000 words (${wordCount} words). Slicing to the first 1000 words for QuillBot compatibility.`);
    words = words.slice(0, 1000);
    cleanText = words.join(" ");
    wordCount = 1000;
  }

  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    console.log("Navigating to QuillBot AI Content Detector...");
    await page.goto("https://quillbot.com/ai-content-detector", { waitUntil: "networkidle", timeout: 45000 });
    
    // Accept cookies if present
    const acceptCookies = page.getByRole("button", { name: "Accept All" });
    if (await acceptCookies.isVisible()) {
      await acceptCookies.click();
      console.log("Accepted cookies");
    }

    const inputLocator = page.locator("[placeholder*='To analyze text']");
    if (!(await inputLocator.isVisible())) {
      throw new Error("Could not locate the input text area.");
    }

    await inputLocator.click();
    await inputLocator.focus();
    
    console.log("Typing text into QuillBot (this might take a few seconds)...");
    // Type in smaller chunks to avoid issues, or type directly with slight delay
    await page.keyboard.type(cleanText, { delay: 1 });

    // Wait and click
    await page.waitForTimeout(2000);
    const detectBtn = page.locator("button:has-text('Detect AI')").first();
    const isEnabled = await detectBtn.isEnabled();
    console.log(`Detect button is enabled: ${isEnabled}`);
    
    await detectBtn.click({ force: true });
    console.log("Clicked 'Detect AI'. Waiting for results...");

    // Wait for network response and UI update
    await page.waitForTimeout(10000);
    
    const bodyText = await page.locator("body").innerText();
    const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);

    // Let's print lines containing percentages or words like "AI" / "Human"
    console.log("\n--- DETECTOR OUTPUT ---");
    let aiPercentage: string | null = null;
    let humanPercentage: string | null = null;

    // Search for the specific pattern "X% of text is likely AI" or "X% AI-generated"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("of text is likely AI") || line.includes("likely AI")) {
        // The percentage is usually on the preceding line or in the line itself
        console.log(`Status line: "${line}"`);
        const prevLine = lines[i - 1];
        if (prevLine && prevLine.includes("%")) {
          aiPercentage = prevLine;
        }
      }
      if (line.includes("AI-generated") && line.includes("%")) {
        console.log(`AI-generated line: "${line}"`);
        aiPercentage = line.split(" ")[0]; // Get the first word
      }
      if (line.includes("Human-written & AI-refined")) {
        console.log(`Refined line: "${line}"`);
        const prevLine = lines[i - 1];
        if (prevLine && prevLine.includes("%")) {
          console.log(`Human-written & AI-refined percentage: ${prevLine}`);
        }
      }
      if (line.includes("Human-written")) {
        // Let's capture the percentage
        console.log(`Human line: "${line}"`);
        const prevLine = lines[i - 1];
        if (prevLine && prevLine.includes("%")) {
          humanPercentage = prevLine;
        }
      }
    }

    // fallback extraction from raw lines
    if (!aiPercentage) {
      // Find the first line that is just a percentage followed by "of text is likely AI" or check matching lines
      const aiGeneratedIndices = lines.map((l, idx) => l === "AI-generated" ? idx : -1).filter(idx => idx !== -1);
      for (const idx of aiGeneratedIndices) {
        const prev = lines[idx - 1];
        if (prev && prev.includes("%")) {
          aiPercentage = prev;
          break;
        }
      }
    }

    console.log("------------------------");
    console.log(`Extracted AI Score: ${aiPercentage || "Could not extract AI percentage directly"}`);
    console.log(`Extracted Human Score: ${humanPercentage || "Could not extract Human percentage directly"}`);
    
    // Dump matching lines for debug
    console.log("\nMatching lines of interest:");
    lines.forEach(l => {
      if (l.includes("%") || l.toLowerCase().includes("ai") || l.toLowerCase().includes("human")) {
        console.log(`-> ${l}`);
      }
    });

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
