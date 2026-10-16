#!/usr/bin/env npx tsx
/** Open IRCTC in a Browser Use Cloud browser with an existing agent profile. */
import { existsSync, mkdirSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { setTimeout } from "node:timers/promises";
import { BrowserUse } from "browser-use-sdk/v4";
import { chromium } from "@playwright/test";

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  if (process.argv[2] === "--help") {
    console.log("Usage: npm run irctc:agent:probe -- [hold-seconds (0-600)]");
    return;
  }
  const holdSeconds = Number(process.argv[2] ?? 0);
  if (!Number.isInteger(holdSeconds) || holdSeconds < 0 || holdSeconds > 600) {
    throw new Error("hold-seconds must be an integer between 0 and 600");
  }

  const { BROWSER_USE_API_KEY: apiKey, BROWSER_USE_PROFILE_ID: profileId } =
    process.env;
  if (!apiKey || !profileId) {
    throw new Error(
      "Set BROWSER_USE_API_KEY and BROWSER_USE_PROFILE_ID in .env.local",
    );
  }

  const client = new BrowserUse({ apiKey });
  const session = await client.browsers.create({
    profileId,
    proxyCountryCode: "in",
    solveCaptchas: false,
    timeout: Math.max(5, Math.ceil(holdSeconds / 60) + 2),
  });
  try {
    if (!session.cdpUrl) throw new Error("Cloud browser has no CDP URL");
    const browser = await chromium.connectOverCDP(session.cdpUrl);
    try {
      // A new context would lose the profile's saved cookies.
      const context = browser.contexts()[0];
      if (!context) throw new Error("Cloud browser has no default context");
      const page = context.pages()[0] ?? (await context.newPage());
      const response = await page.goto(
        "https://www.irctc.co.in/nget/train-search",
        {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        },
      );

      const search = page.getByRole("searchbox", {
        name: /Enter From station/i,
      });
      const loaded = await search.waitFor({ timeout: 30_000 }).then(
        () => true,
        () => false,
      );
      mkdirSync("test-results", { recursive: true });
      await page.screenshot({ path: "test-results/irctc-agent-probe.png" });
      console.log(
        `IRCTC: HTTP ${response?.status() ?? "unknown"} — ${page.url()}`,
      );
      console.log(`Booking search form loaded: ${loaded}`);
      console.log("Screenshot: test-results/irctc-agent-probe.png");
      if (!loaded)
        throw new Error("IRCTC booking page did not load in the cloud browser");

      if (holdSeconds > 0) {
        console.log(
          `Private live browser (manual agent login/OTP): ${session.liveUrl}`,
        );
        console.log(
          `Browser remains open for ${holdSeconds} seconds. Do not submit a payment.`,
        );
        const abort = new AbortController();
        process.once("SIGINT", () => abort.abort());
        process.once("SIGTERM", () => abort.abort());
        await setTimeout(holdSeconds * 1000, undefined, {
          signal: abort.signal,
        }).catch((error: unknown) => {
          if (!abort.signal.aborted) throw error;
        });
        await page.screenshot({
          path: "test-results/irctc-agent-after-login.png",
        });
        console.log(
          `After manual interaction: ${page.url()} — ${await page.title()}`,
        );
        console.log("Screenshot: test-results/irctc-agent-after-login.png");
      }
    } finally {
      await browser.close();
    }
  } finally {
    await client.browsers.stop(session.id);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
