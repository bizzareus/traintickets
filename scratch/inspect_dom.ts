import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    console.log("Navigating...");
    await page.goto("https://quillbot.com/ai-content-detector", { waitUntil: "networkidle", timeout: 30000 });
    
    // Accept cookies if present
    const acceptCookies = page.getByRole("button", { name: "Accept All" });
    if (await acceptCookies.isVisible()) {
      await acceptCookies.click();
    }

    const editor = page.locator("[contenteditable='true']");
    await editor.fill("Imagine checking your PNR status on chart preparation day, only to see a total mess. You booked a ticket for your family of four, hoping for a smooth journey. Instead, two names show confirmed berths, while the other two are stuck with waiting list numbers like WL 12 and WL 13. Now you are stuck with a classic Indian Railways dilemma: Can the waitlisted members board the train? Will they get thrown out or fined by the TTE? Or should the whole group just scrap the trip? The rules for partially confirmed tickets are very different from fully waitlisted ones. Knowing the ins and outs of this policy saves you from getting hit with massive fines, getting into heated debates with the TTE, or simply throwing away your money. Let's unpack the real rules and refund tricks for these mixed PNRs in plain English. What Is a Partially Confirmed Ticket in Indian Railways? So, what exactly is it? A partially confirmed ticket happens when you book a group of people under a single PNR. When the railway prepares the final charts, only some of your friends or family get actual seats or RAC berths, while the rest are left hanging on the");
    
    await editor.evaluate((el: HTMLElement) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.keyboard.press("End");
    await page.keyboard.type(" ");

    const detectBtn = page.getByRole("button", { name: "Detect AI", exact: true });
    await detectBtn.click();
    console.log("Clicked Detect AI. Waiting for results...");
    await page.waitForTimeout(15000);

    // Let's dump text elements around the percentage to find selectors
    const resultPanelText = await page.evaluate(() => {
      // Find all divs or spans containing "likely AI" or "%"
      const elements = Array.from(document.querySelectorAll("div, span, p, h1, h2, h3, h4"));
      return elements
        .filter(el => {
          const text = el.textContent || "";
          return text.includes("likely AI") || text.includes("AI-generated");
        })
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          text: el.textContent?.trim().replace(/\s+/g, " "),
          id: el.id
        }));
    });

    console.log("Found matching elements:", JSON.stringify(resultPanelText, null, 2));

  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

main();
