import 'dotenv/config';
import { chromium } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const customCookies = process.env.TRIPMGT_COOKIES;
  if (!customCookies) {
    throw new Error('TRIPMGT_COOKIES is empty in backend/.env');
  }

  const rawPairs = customCookies.split(';').map((c) => c.trim()).filter(Boolean);
  const cookieObjects: Array<{ name: string; value: string; domain: string; path: string }> = [];
  for (const pair of rawPairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    cookieObjects.push({
      name: pair.substring(0, eqIdx).trim(),
      value: pair.substring(eqIdx + 1).trim(),
      domain: '.tripmgt.in',
      path: '/',
    });
  }
  await context.addCookies(cookieObjects);
  console.log(`[1] Injected ${cookieObjects.length} cookies into browser context.`);

  const page = await context.newPage();
  const url = 'https://tripmgt.in/admin_edit/?ID=6a9ff06a3140a99ed3b57b3e';
  console.log(`[2] Navigating to ${url}...`);

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const finalUrl = page.url();
  console.log(`[3] Final URL: ${finalUrl} (HTTP ${response?.status() ?? 'N/A'})`);
  console.log(`[4] Page Title: "${await page.title()}"`);

  const outDir = path.resolve(process.cwd(), 'storage', 'cli-debug');
  fs.mkdirSync(outDir, { recursive: true });
  const ssPath = path.join(outDir, 'admin_edit_live.png');
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`[5] Screenshot saved to ${ssPath}`);

  // Extract structural links, buttons, headers, or any visible text
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')).map((el) => ({
      tag: el.tagName,
      id: el.id,
      text: el.textContent?.trim().slice(0, 50),
      href: el.getAttribute('href'),
      onclick: el.getAttribute('onclick'),
    })).filter((x) => x.text || x.href);
  });
  console.log('\n--- KEY INTERACTIVE ELEMENTS ON THIS PAGE ---');
  console.log(JSON.stringify(links.slice(0, 25), null, 2));

  const bodyText = (await page.locator('body').innerText()) || '';
  console.log('\n--- PAGE TEXT PREVIEW ---');
  console.log(bodyText.slice(0, 1200));

  await browser.close();
}

main().catch(console.error);
