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
    
    // Accept cookies if present
    const acceptCookies = page.getByRole("button", { name: "Accept All" });
    if (await acceptCookies.isVisible()) {
      await acceptCookies.click();
      console.log("Accepted cookies");
    }

    // Let's locate the input box. Since there was a placeholder:
    // "To analyze text to detect AI-generated content, add at least 40 words..."
    const inputLocator = page.locator("[placeholder*='To analyze text']");
    if (!(await inputLocator.isVisible())) {
      console.log("Could not find input locator by placeholder, trying contenteditable or textarea");
    }

    // Let's paste a sample AI-generated paragraph of about 60 words
    const aiText = `Artificial intelligence is transforming the landscape of modern technology at an unprecedented pace. From automated workflows to advanced language processing, machine learning models are empowering organizations to achieve higher efficiency. By streamlining repetitive tasks and analyzing massive datasets in real-time, businesses can make data-driven decisions faster and with greater precision than ever before.`;
    
    // Let's click the input field first, focus it, fill/type, and press a key to trigger react state
    await inputLocator.click();
    await inputLocator.focus();
    await page.keyboard.type(aiText, { delay: 10 });
    console.log("Typed text into input field");
    
    // Wait and take a screenshot to see if the word count is registered
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "scratch/quillbot_after_fill.png" });
    console.log("Screenshot after fill saved to scratch/quillbot_after_fill.png");

    // Click "Detect AI"
    const detectBtn = page.locator("button:has-text('Detect AI')").first();
    console.log("Button isEnabled:", await detectBtn.isEnabled());
    
    await detectBtn.click({ force: true });
    console.log("Clicked Detect AI button. Waiting for results...");

    // Wait for the analysis to finish (the results usually appear in a percentage or circle)
    // Let's sleep for 8 seconds to let the network call complete, then dump the page content or search for results
    await page.waitForTimeout(8000);
    await page.screenshot({ path: "scratch/quillbot_results.png" });
    console.log("Screenshot saved to scratch/quillbot_results.png");

    // Find elements containing "AI" or percentage indicators
    const bodyText = await page.locator("body").innerText();
    
    // Let's extract lines that mention AI, Human, or percentages
    const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);
    console.log("Relevant lines from body text containing percentages or status:");
    for (const line of lines) {
      if (line.includes("%") || line.toLowerCase().includes("ai") || line.toLowerCase().includes("human") || line.toLowerCase().includes("detect")) {
        console.log("-> ", line);
      }
    }

  } catch (err: any) {
    console.error("Error during execution:", err.message);
  } finally {
    await browser.close();
  }
}

main();
