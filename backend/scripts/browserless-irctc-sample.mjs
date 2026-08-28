// Sample: reach IRCTC's Akamai-protected APIs through Browserless.io (or self-hosted Browserless).
//
// Usage:
//   BROWSERLESS_API_KEY="your-token" node backend/scripts/browserless-irctc-sample.mjs
//
import puppeteer from "puppeteer-core";

const apiKey = process.env.BROWSERLESS_API_KEY?.trim();
const customWss = process.env.BROWSERLESS_WSS?.trim() || process.env.IRCTC_BROWSER_WSS?.trim();

let browserWs = customWss;
if (!browserWs && apiKey) {
  const country = process.env.BROWSERLESS_PROXY_COUNTRY || "in";
  // Use /stealth endpoint + HTTP/2 disable + residential proxy in India
  browserWs = `wss://chrome.browserless.io/stealth?token=${apiKey}&proxy=residential&proxyCountry=${country}&--disable-http2`;
}

if (!browserWs) {
  console.error("Error: set BROWSERLESS_API_KEY or BROWSERLESS_WSS");
  process.exit(1);
}

const TRAIN_NO = "12951";   // Mumbai Rajdhani
const BOARDING = "MMCT";    // Origin station
const J_DATE = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // Tomorrow

run();

async function run() {
  console.log(`Connecting to Browserless endpoint (${browserWs.replace(/token=[^&]+/, "token=REDACTED")})...`);
  const browser = await puppeteer.connect({ browserWSEndpoint: browserWs });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    console.log("Loading IRCTC online-charts...");
    await page.goto("https://www.irctc.co.in/online-charts/", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    console.log("Waiting 6s for Akamai sensor JS to settle cookies...");
    await new Promise((r) => setTimeout(r, 6000));

    // Extract cookies via CDP
    const client = await page.target().createCDPSession();
    const { cookies } = await client.send("Network.getAllCookies");
    const irctcCookies = cookies
      .filter((c) => c.domain.includes("irctc.co.in"))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    console.log(`\nHarvested ${cookies.length} total cookies (${irctcCookies.length} chars for irctc.co.in)`);
    console.log("Cookie snippet:", irctcCookies.slice(0, 150) + "...");

    // Test a protected API call inside the browser context
    const schedule = await page.evaluate(async (trainNo) => {
      try {
        const res = await fetch(
          `https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry/${trainNo}`,
          {
            headers: {
              accept: "application/json, text/plain, */*",
              bmirak: "webbm",
              greq: String(Date.now()),
            },
            credentials: "include",
          },
        );
        return { status: res.status, body: (await res.text()).slice(0, 200) };
      } catch (e) {
        return { status: "fetch-error", body: String(e && e.message) };
      }
    }, TRAIN_NO);

    console.log("\nProtected Schedule API Test:", JSON.stringify(schedule));
    if (schedule.status === 200) {
      console.log("\n✅ SUCCESS: Browserless successfully bypassed Akamai and harvested valid IRCTC cookies!");
    } else {
      console.log(`\n⚠️ Note: API returned HTTP ${schedule.status}.`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
