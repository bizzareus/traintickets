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

    // Locate the contenteditable element
    const editor = page.locator("[contenteditable='true']");
    if (await editor.isVisible()) {
      console.log("Found contenteditable editor. Clicking it...");
      await editor.click();
      
      // Let's paste a sample paragraph by typing it
      const sampleText = "Indian Railways is one of the largest rail networks in the world, carrying millions of passengers every single day. Traveling by train in India is not just a journey, but an experience filled with diverse landscapes, local cultures, and delicious station food. Planning a train trip requires understanding complex booking systems like Tatkal quotas and reservation charts.";
      
      console.log("Typing text into contenteditable editor...");
      await editor.fill(sampleText); // Let's try fill on contenteditable first
      
      // If fill doesn't enable the button, let's type a space or a word manually
      await page.keyboard.press("Space");
      await page.keyboard.type("This is additional text to ensure state updates.");

      // Check if button is enabled
      const detectBtn = page.getByRole("button", { name: "Detect AI", exact: true });
      const isDisabled = await detectBtn.getAttribute("disabled");
      console.log("Is Detect AI button disabled?", isDisabled !== null);

      if (isDisabled !== null) {
        console.log("Button still disabled. Attempting to click paste button or type characters individually...");
        // Clear and type individually
        await editor.click();
        await page.keyboard.press("Meta+A");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("This is a manually typed sentence that has more than forty words to see if typing directly enables the analyze button. We need to reach forty words to activate the detector.");
      }

      console.log("Clicking Detect AI...");
      await detectBtn.click();
      console.log("Clicked! Waiting 5 seconds...");
      await page.waitForTimeout(5000);

      await page.screenshot({ path: "scratch/quillbot_results2.png" });
      console.log("Screenshot saved to scratch/quillbot_results2.png");

      const bodyText = await page.locator("body").innerText();
      const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);
      console.log("Result lines:");
      for (const line of lines) {
        if (line.includes("%") || line.toLowerCase().includes("ai") || line.toLowerCase().includes("human")) {
          console.log("-> ", line);
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
