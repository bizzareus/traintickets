/**
 * Standalone CLI test runner for TripMgt Playwright automation.
 *
 * Usage:
 *   npx tsx scripts/tripmgt-booking-cli.ts [--headless=false] [--url=...] [--username=...] [--password=...]
 */
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
    const cookieObjects = customCookies.split(';').map((c) => {
      const [name, ...val] = c.trim().split('=');
      return {
        name,
        value: val.join('='),
        domain: 'tripmgt.in',
        path: '/',
      };
    });
    await context.addCookies(cookieObjects);
    console.log(`[TripMgt CLI] Injected session cookies.`);
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

    // Step 2: Check for Ticket Reservation Form (Image 2)
    console.log(
      '[TripMgt CLI] Step 2: Inspecting Ticket Reservation form fields...',
    );

    // Passenger input fields
    const nameInputs = page.locator(
      'input[id*="txtPassName"], input[name*="txtPassName"], table tr input[type="text"]',
    );
    const count = await nameInputs.count();
    console.log(
      `[TripMgt CLI] Detected ${count} passenger input candidates on page.`,
    );

    if (count > 0) {
      console.log(
        '[TripMgt CLI] Filling sample passenger: Rahul Sharma, Age 32, Male, Lower Berth...',
      );
      await nameInputs.first().fill('Rahul Sharma');

      const ageInput = page
        .locator('input[id*="txtAge"], input[name*="txtAge"]')
        .first();
      if ((await ageInput.count()) > 0) {
        await ageInput.fill('32');
      }

      const sexSelect = page
        .locator('select[id*="ddlSex"], select[name*="ddlSex"]')
        .first();
      if ((await sexSelect.count()) > 0) {
        await sexSelect.selectOption({ label: 'Male' }).catch(() => undefined);
      }

      const berthSelect = page
        .locator('select[id*="ddlBerth"], select[name*="ddlBerth"]')
        .first();
      if ((await berthSelect.count()) > 0) {
        await berthSelect
          .selectOption({ label: 'Lower' })
          .catch(() => undefined);
      }

      const autoUpgrad = page
        .locator(
          'input[type="checkbox"][id*="AutoUpgrad"], input[name*="AutoUpgrad"]',
        )
        .first();
      if ((await autoUpgrad.count()) > 0) {
        await autoUpgrad.check().catch(() => undefined);
        console.log('[TripMgt CLI] Checked "Consider for Auto Upgradation".');
      }

      const filledSsPath = path.join(outDir, '02_reservation_form_filled.png');
      await page.screenshot({ path: filledSsPath, fullPage: true });
      console.log(`[TripMgt CLI] Saved filled form snapshot: ${filledSsPath}`);
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
