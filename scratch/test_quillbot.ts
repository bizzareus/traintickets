import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  console.log("Navigating to QuillBot AI Content Detector...");
  try {
    await page.goto("https://quillbot.com/ai-content-detector", { waitUntil: "networkidle", timeout: 30000 });
    console.log("Page loaded. Title:", await page.title());

    // Take screenshot to see if we got Cloudflare blocked
    await page.screenshot({ path: "scratch/quillbot_loaded.png" });
    console.log("Screenshot saved to scratch/quillbot_loaded.png");

    // Let's find inputs/textareas
    const textareas = await page.locator("textarea").count();
    const contentEditables = await page.locator("[contenteditable='true']").count();
    const placeholders = await page.locator("[placeholder]").evaluateAll((els) => els.map(el => el.getAttribute("placeholder")));
    const buttons = await page.locator("button").evaluateAll((els) => els.map(el => el.textContent));

    console.log(`Found ${textareas} textareas, ${contentEditables} contenteditable elements.`);
    console.log("Placeholders found:", placeholders);
    console.log("Buttons found:", buttons.filter(b => b && b.trim().length > 0).slice(0, 15));

  } catch (err: any) {
    console.error("Error during execution:", err.message);
  } finally {
    await browser.close();
  }
}

main();
