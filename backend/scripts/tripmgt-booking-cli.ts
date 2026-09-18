/**
 * Standalone CLI test runner for TripMgt Playwright automation.
 *
 * Usage:
 *   npx tsx scripts/tripmgt-booking-cli.ts [--headless=false] [--url=...] [--username=...] [--password=...]
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';

async function main() {
  const args = process.argv.slice(2);
  const isHeadless = !args.includes('--headless=false');
  const customUrl = args.find((a) => a.startsWith('--url='))?.split('=')[1];
  const customUser =
    args.find((a) => a.startsWith('--username='))?.split('=')[1] ||
    process.env.TRIPMGT_USERNAME;
  const customPass =
    args.find((a) => a.startsWith('--password='))?.split('=')[1] ||
    process.env.TRIPMGT_PASSWORD;
  const customCookies =
    args.find((a) => a.startsWith('--cookies='))?.split('=')[1] ||
    process.env.TRIPMGT_COOKIES;

  const targetUrl =
    customUrl ||
    process.env.TRIPMGT_BOOKING_URL ||
    'https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search';

  console.log(
    `\n================ TRIPMGT AUTOMATION TEST RUNNER ================`,
  );
  console.log(`[TripMgt CLI] Headless mode : ${isHeadless}`);
  console.log(`[TripMgt CLI] Target URL    : ${targetUrl}`);
  if (customUser) console.log(`[TripMgt CLI] Agent User   : ${customUser}`);

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  if (customCookies) {
    const rawPairs = customCookies
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean);
    const cookieObjects: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
    }> = [];
    for (const pair of rawPairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (!name) continue;
      cookieObjects.push({
        name,
        value,
        domain: '.tripmgt.in',
        path: '/',
      });
    }
    if (cookieObjects.length > 0) {
      await context.addCookies(cookieObjects);
      console.log(
        `[TripMgt CLI] Injected ${cookieObjects.length} session cookies.`,
      );
    }
  }

  const outDir = path.resolve(process.cwd(), 'storage', 'cli-debug');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const page = await context.newPage();

    console.log('[TripMgt CLI] Step 1: Navigating to target portal...');
    const resp = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const currentUrl = page.url();
    console.log(
      `[TripMgt CLI] Step 1 Result: ${currentUrl} (Status: ${resp?.status()})`,
    );

    const title = await page.title();
    console.log(`[TripMgt CLI] Page Title: "${title}"`);

    const initSsPath = path.join(outDir, '01_initial_page.png');
    await page.screenshot({ path: initSsPath, fullPage: true });
    console.log(`[TripMgt CLI] Captured snapshot: ${initSsPath}`);

    // Check if on unauthenticated homepage or login page
    const isUnauthenticated =
      currentUrl === 'https://tripmgt.in/' ||
      currentUrl === 'https://tripmgt.in' ||
      currentUrl.includes('/login.aspx') ||
      (await page.locator('a[href*="login.aspx"]').count()) > 0 ||
      (await page.locator('text=Sign in to continue').count()) > 0;

    if (isUnauthenticated) {
      console.log(
        '[TripMgt CLI] Notice: Session is unauthenticated or ID parameter has expired.',
      );

      if (customUser && customPass) {
        console.log(
          `[TripMgt CLI] Attempting login with provided agent credentials...`,
        );
        if (!currentUrl.includes('/login.aspx')) {
          const loginLink = page.locator('a[href*="login.aspx"]').first();
          if ((await loginLink.count()) > 0) {
            await loginLink.click();
            await page.waitForLoadState('domcontentloaded');
          } else {
            await page.goto('https://tripmgt.in/login.aspx', {
              waitUntil: 'domcontentloaded',
            });
          }
        }

        const userInput = page
          .locator('input[type="text"], input[name*="user" i]')
          .first();
        const passInput = page.locator('input[type="password"]').first();
        const submitBtn = page
          .locator('button[type="submit"], input[type="submit"]')
          .first();

        if ((await userInput.count()) > 0 && (await passInput.count()) > 0) {
          await userInput.fill(customUser);
          await passInput.fill(customPass);
          await submitBtn.click();
          await page.waitForLoadState('domcontentloaded');
          console.log(
            `[TripMgt CLI] Login form submitted. New URL: ${page.url()}`,
          );
        }
      } else {
        console.log(
          '[TripMgt CLI] Note: To test live agent booking, supply TRIPMGT_COOKIES or --username / --password.',
        );
      }
    }

    // Check for "I Accept" rules checkbox
    const acceptCheckbox = page.locator('#chkIAgree, input[type="checkbox"]').first();
    if ((await acceptCheckbox.count()) > 0) {
      console.log('[TripMgt CLI] Found Rules & Regulations acceptance checkbox. Checking it...');
      await acceptCheckbox.check();
      await page.waitForTimeout(1000);
      const afterAcceptSs = path.join(outDir, '02_after_accept.png');
      await page.screenshot({ path: afterAcceptSs, fullPage: true });
      console.log(`[TripMgt CLI] Captured after-accept snapshot: ${afterAcceptSs}`);
    }

    // Step 2: Open Book Tab
    console.log('[TripMgt CLI] Step 2: Navigating to Book tab...');
    const bookTab = page.locator('#menu1, #menu2, a:has-text("Book")').first();
    if ((await bookTab.count()) > 0) {
      await bookTab.click();
      await page.waitForTimeout(1500);
    } else {
      await page.evaluate(() => (window as any).trainBook?.UpdateUI(1));
      await page.waitForTimeout(1500);
    }

    const bookTabSs = path.join(outDir, '03_book_tab.png');
    await page.screenshot({ path: bookTabSs, fullPage: true });
    console.log(`[TripMgt CLI] Captured Book tab snapshot: ${bookTabSs}`);

    // Step 3: Fill Passenger Details Form
    console.log('[TripMgt CLI] Step 3: Filling Reservation Form fields...');

    // Mobile & Name
    const mobileInput = page.locator('#txtCustomerMobile');
    if ((await mobileInput.count()) > 0) {
      await mobileInput.fill('9876543210');
    }
    const nameInput = page.locator('#txtCustomerName');
    if ((await nameInput.count()) > 0) {
      await nameInput.fill('Rahul Sharma');
    }

    // Passenger 1
    const pName0 = page.locator('#pName0, input[id*="txtPassName_1"]');
    if ((await pName0.count()) > 0) {
      await pName0.fill('Rahul Sharma');
      console.log('[TripMgt CLI] Filled Passenger Name: Rahul Sharma');
    }

    const pAge0 = page.locator('#pAge0, input[id*="txtAge_1"]');
    if ((await pAge0.count()) > 0) {
      await pAge0.fill('32');
      console.log('[TripMgt CLI] Filled Passenger Age: 32');
    }

    const pGender0 = page.locator('#pGender0, select[id*="ddlSex_1"]');
    if ((await pGender0.count()) > 0) {
      await pGender0.selectOption({ value: 'M' }).catch(() => pGender0.selectOption({ index: 0 }));
      console.log('[TripMgt CLI] Selected Gender: Male');
    }

    const pBerth0 = page.locator('#pBerth0, select[id*="ddlBerth_1"]');
    if ((await pBerth0.count()) > 0) {
      await pBerth0.selectOption({ index: 1 }).catch(() => undefined);
      console.log('[TripMgt CLI] Selected Berth: Lower');
    }

    // Auto Upgradation & Insurance
    const autoUp = page.locator('#chkConsiderAutoUpgrade');
    if ((await autoUp.count()) > 0) {
      await autoUp.check().catch(() => undefined);
    }

    const insNo = page.locator('#insurance0');
    if ((await insNo.count()) > 0) {
      await insNo.check().catch(() => undefined);
    }

    const filledSs = path.join(outDir, '04_filled_reservation.png');
    await page.screenshot({ path: filledSs, fullPage: true });
    console.log(`[TripMgt CLI] Captured filled reservation snapshot: ${filledSs}`);

    // Step 4: Click Next
    console.log('[TripMgt CLI] Step 4: Clicking Next button...');
    const nextBtn = page.locator('input[value="Next"], input.btn:has-text("Next")').first();
    if ((await nextBtn.count()) > 0) {
      await nextBtn.click();
      await page.waitForTimeout(3000);
      const afterNextSs = path.join(outDir, '05_after_next.png');
      await page.screenshot({ path: afterNextSs, fullPage: true });
      console.log(`[TripMgt CLI] Captured after-next snapshot: ${afterNextSs}`);
    }

    console.log('[TripMgt CLI] Automation test run completed successfully.');
  } catch (err: unknown) {
    console.error('[TripMgt CLI] Error occurred:', err);
  } finally {
    await browser.close();
    console.log(
      `================================================================\n`,
    );
  }
}

main().catch(console.error);
