// Sample: reach IRCTC's Akamai-protected APIs through the BrightData Scraping Browser.
//
//   npm i puppeteer-core
//   node backend/scripts/brightdata-irctc-sample.mjs
//
// Mirrors the working booking.com sample: connect, ONE newPage, ONE goto, then
// drive everything else with same-origin fetches via page.evaluate (so there's
// no second navigation — that's what trips "Page.navigate domain limit reached").
// Requests go out over BrightData's residential IP with the browser's own
// Akamai cookies attached.
import puppeteer from "puppeteer-core";

// Set BRIGHTDATA_BROWSER_WSS to your zone's wss endpoint, e.g.:
//   BRIGHTDATA_BROWSER_WSS='wss://brd-customer-...-zone-...:<pass>@brd.superproxy.io:9222' \
//     node backend/scripts/brightdata-irctc-sample.mjs
const BROWSER_WS = process.env.BRIGHTDATA_BROWSER_WSS;
if (!BROWSER_WS) throw new Error("Set BRIGHTDATA_BROWSER_WSS");

const TRAIN_NO = "12951";   // Mumbai Rajdhani
const BOARDING = "MMCT";    // its origin
const J_DATE = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // tomorrow YYYY-MM-DD

run();

async function run() {
  console.log("Connecting to BrightData scraping browser...");
  const browser = await puppeteer.connect({ browserWSEndpoint: BROWSER_WS });
  try {
    const page = await browser.newPage();

    console.log("Loading IRCTC online-charts (single navigation)...");
    await page.goto("https://www.irctc.co.in/online-charts/", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await new Promise((r) => setTimeout(r, 6000)); // let Akamai sensor settle

    // Schedule (GET) — clean "did Akamai let us in?" signal.
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
    console.log("SCHEDULE:", JSON.stringify(schedule));

    // The real endpoint we need: trainComposition (POST).
    const composition = await page.evaluate(
      async (trainNo, jDate, boarding) => {
        try {
          const res = await fetch(
            "https://www.irctc.co.in/online-charts/api/trainComposition",
            {
              method: "POST",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
                bmirak: "webbm",
              },
              credentials: "include",
              body: JSON.stringify({ trainNo, jDate, boardingStation: boarding }),
            },
          );
          return { status: res.status, body: (await res.text()).slice(0, 300) };
        } catch (e) {
          return { status: "fetch-error", body: String(e && e.message) };
        }
      },
      TRAIN_NO,
      J_DATE,
      BOARDING,
    );
    console.log("TRAIN COMPOSITION:", JSON.stringify(composition));

    console.log(
      "\nVerdict: status 200 = BrightData reaches IRCTC's protected APIs. " +
        "Make sure the zone country is India (the earlier test exited from a US IP).",
    );
  } finally {
    await browser.close();
  }
}
