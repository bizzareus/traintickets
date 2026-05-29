import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const blogPath = "/Users/kartikarora/Documents/personal/traintickets/content/blog/irctc-vikalp-scheme-explained.md";
  const fileContent = fs.readFileSync(blogPath, "utf-8");
  
  // Extract text by removing the YAML frontmatter block
  let textToScan = fileContent;
  const frontmatterMatch = fileContent.match(/^---([\s\S]*?)---/);
  if (frontmatterMatch) {
    textToScan = fileContent.substring(frontmatterMatch[0].length).trim();
  }

  // Remove markdown headers/links/formatting to make it plain text for scanning
  textToScan = textToScan
    .replace(/#+\s+/g, "") // Remove headers
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Remove links keeping the text
    .replace(/\*\*|__/g, "") // Remove bold
    .replace(/\*|_/g, "") // Remove italic
    .replace(/-\s+/g, "") // Remove bullet list dashes
    .trim();

  // Print word count and preview
  const wordCount = textToScan.split(/\s+/).filter(Boolean).length;
  console.log(`Loaded blog post text. Word count: ${wordCount} words.`);
  console.log("Previewing first 200 chars:\n", textToScan.substring(0, 200));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  console.log("\nNavigating to QuillBot AI Content Detector...");
  try {
    await page.goto("https://quillbot.com/ai-content-detector", { waitUntil: "networkidle", timeout: 30000 });
    
    // Accept cookies if present
    const acceptCookies = page.getByRole("button", { name: "Accept All" });
    if (await acceptCookies.isVisible()) {
      await acceptCookies.click();
      console.log("Accepted cookies");
    }

    const editor = page.locator("[contenteditable='true']");
    if (await editor.isVisible()) {
      console.log("Found contenteditable editor. Filling with blog post content...");
      
      // Let's split the text if it's too long, but QuillBot allows up to 1200 words on the free tier.
      // Let's paste the first 500 words to be safe and fast.
      const words = textToScan.split(/\s+/);
      const subText = words.slice(0, 500).join(" ");
      console.log(`Sending ${subText.split(/\s+/).length} words for analysis...`);

      await editor.fill(subText);

      // Dispatch custom events
      await editor.evaluate((el: HTMLElement) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
      });

      // Type a space manually
      await page.keyboard.press("End");
      await page.keyboard.type(" ");

      const detectBtn = page.getByRole("button", { name: "Detect AI", exact: true });
      console.log("Clicking Detect AI button...");
      await detectBtn.click();
      console.log("Clicked! Waiting 8 seconds for the detection result to load...");
      await page.waitForTimeout(8000);

      await page.screenshot({ path: "scratch/quillbot_blog_results.png" });
      console.log("Screenshot saved to scratch/quillbot_blog_results.png");

      const bodyText = await page.locator("body").innerText();
      const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);
      console.log("--- RESULT LINES ---");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("%") || line.toLowerCase().includes("ai") || line.toLowerCase().includes("human")) {
          console.log(`Line ${i}: ${line}`);
        }
      }
    } else {
      console.error("Contenteditable editor not found!");
    }

  } catch (err: any) {
    console.error("Error during execution:", err.message);
  } finally {
    await browser.close();
  }
}

main();
