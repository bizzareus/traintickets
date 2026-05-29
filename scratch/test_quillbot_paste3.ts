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

    const editor = page.locator("[contenteditable='true']");
    if (await editor.isVisible()) {
      console.log("Found contenteditable editor. Clicking it...");
      await editor.click();
      
      // Let's create a highly humanized 120-word paragraph
      const sampleText = "Let's be real. If you've ever tried booking a train in India during Diwali or summer rush, you know the absolute panic of seeing 'WL' next to your preferred train. The IRCTC website feels like a battlefield at 10 AM or 11 AM when Tatkal opens. Seats vanish in under thirty seconds. It is a nightmare. But here's the thing most people don't know: the game isn't over when the chart is prepared. Far from it! There's a hidden window of opportunity right at chart preparation time. If you understand how regional waitlists and segment bookings work, you can actually snag a confirmed seat even when the main route says waitlisted. It's not magic, just simple math and booking hacks. Let's look at how this works in real life so you can avoid getting stranded at the station next time you travel.";

      console.log("Filling editor...");
      await editor.fill(sampleText);

      // Dispatch custom events
      console.log("Dispatching input, keydown, and keyup events in the browser context...");
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

      await page.screenshot({ path: "scratch/quillbot_results4.png" });
      console.log("Screenshot saved to scratch/quillbot_results4.png");

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
