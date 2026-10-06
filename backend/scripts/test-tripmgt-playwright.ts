import 'dotenv/config';
import { chromium } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Standalone Local Playwright Tester for TripMgt
 *
 * Usage:
 *   npx tsx scripts/test-tripmgt-playwright.ts [options]
 *
 * Options:
 *   --headed           Launch visible browser window (default: true if not in CI)
 *   --headless         Launch headless browser
 *   --from <CODE>      Origin station code (default: NDLS)
 *   --to <CODE>        Destination station code (default: MMCT)
 *   --date <DATE>      Journey date in DD-Mon-YYYY (default: +7 days from today)
 *   --train <NO>       Train number to target (default: 12952)
 *   --class <CODE>     Travel class (default: 3A)
 *   --pause            Keep browser open at the end for manual inspection
 */
async function main() {
  const args = process.argv.slice(2);
  const isHeadless = args.includes('--headless') || (!args.includes('--headed') && process.env.PLAYWRIGHT_HEADLESS === 'true');
  const shouldPause = args.includes('--pause');

  const getArg = (flag: string, fallback: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const fromStation = getArg('--from', 'NDLS');
  const toStation = getArg('--to', 'MMCT');
  const trainNumber = getArg('--train', '12952');
  const travelClass = getArg('--class', '3A');

  // Compute default date (+7 days) in DD-Mon-YYYY format
  const defaultDate = (() => {
    const target = new Date();
    target.setDate(target.getDate() + 7);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(target.getDate()).padStart(2, '0');
    const mon = months[target.getMonth()];
    const yyyy = target.getFullYear();
    return `${dd}-${mon}-${yyyy}`;
  })();
  const journeyDate = getArg('--date', defaultDate);

  const outDir = path.resolve(process.cwd(), 'storage', 'cli-debug');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('================================================================');
  console.log(' TripMgt Local Playwright Automation Tester (No AI)');
  console.log('================================================================');
  console.log(` Mode:        ${isHeadless ? 'Headless' : 'Headed (Visual Browser Window)'}`);
  console.log(` Journey:     ${fromStation} → ${toStation} on ${journeyDate}`);
  console.log(` Target:      Train ${trainNumber}, Class ${travelClass}`);
  console.log(` Artifacts:   ${outDir}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  // Inject TripMgt Cookies if configured in .env
  const customCookies = process.env.TRIPMGT_COOKIES;
  if (customCookies) {
    const rawPairs = customCookies.split(';').map((c) => c.trim()).filter(Boolean);
    const cookieObjects: Array<{ name: string; value: string; domain: string; path: string }> = [];
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
      console.log(`[1/6] Injected ${cookieObjects.length} session cookies into browser context.`);
    }
  } else {
    console.log('[1/6] Notice: TRIPMGT_COOKIES not set in .env. Attempting navigation without session cookies.');
  }

  const page = await context.newPage();
  const targetUrl =
    process.env.TRIPMGT_BOOKING_URL?.trim() ||
    'https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search';

  console.log(`[2/6] Navigating to ${targetUrl}...`);
  const response = await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const currentUrl = page.url();
  console.log(`      Page loaded: ${currentUrl} (HTTP ${response?.status() ?? 'N/A'})`);

  const initialSs = path.join(outDir, '01_initial_page.png');
  await page.screenshot({ path: initialSs, fullPage: true });

  // Check if session is unauthenticated (redirected to root or login)
  const isLogin =
    currentUrl === 'https://tripmgt.in/' ||
    currentUrl === 'https://tripmgt.in' ||
    currentUrl.includes('/login.aspx') ||
    (await page.locator('text=Sign in to continue').count()) > 0 ||
    (await page.locator('a[href*="login.aspx"]').count()) > 0;
  if (isLogin) {
    console.warn('\n⚠️  PORTAL SESSION EXPIRED OR UNAUTHENTICATED!');
    console.warn(`   Portal redirected to: ${currentUrl}`);
    console.warn('   Your TripMgt session cookie in backend/.env has expired.');
    console.warn('   To fix: Log in to https://tripmgt.in in your desktop browser, copy the cookies,');
    console.warn('   and paste them into TRIPMGT_COOKIES in backend/.env.');
    if (!shouldPause) {
      await browser.close();
      return;
    }
  }

  // Step 3: Accept Rules & Regulations checkbox if present
  console.log('[3/6] Checking for Rules & Regulations agreement checkbox (#chkIAgree)...');
  const checkbox = page.locator('#chkIAgree, input[type="checkbox"]').first();
  if (await checkbox.count()) {
    await checkbox.check().catch(() => undefined);
    await page.waitForTimeout(1000);
    console.log('      Checked #chkIAgree agreement checkbox.');
    await page.screenshot({ path: path.join(outDir, '02_after_accept.png'), fullPage: true });
  }

  // Step 4: Fill Train Search Form
  console.log(`[4/6] Filling search form: ${fromStation} → ${toStation} on ${journeyDate}...`);
  const fromInput = page.locator('#f1From');
  if (await fromInput.count()) {
    await fromInput.fill(fromStation);
    await page.waitForTimeout(300);
  }

  const toInput = page.locator('#f1To');
  if (await toInput.count()) {
    await toInput.fill(toStation);
    await page.waitForTimeout(300);
  }

  const dateInput = page.locator('#f1JourneyDate');
  if (await dateInput.count()) {
    await dateInput.fill(journeyDate);
    await page.waitForTimeout(300);
  }

  const searchBtn = page.locator('#btnSearchTrains');
  if (await searchBtn.count()) {
    console.log('      Clicking #btnSearchTrains...');
    await searchBtn.click();
    await page.waitForTimeout(4000);
  } else {
    console.log('      Search button #btnSearchTrains not found (perhaps already on booking tab).');
  }

  const searchSs = path.join(outDir, '06_search_results.png');
  await page.screenshot({ path: searchSs, fullPage: true });
  console.log(`      Saved search results snapshot to ${searchSs}`);

  // Step 5: Select Train & Class
  console.log(`[5/6] Locating train ${trainNumber} and class ${travelClass}...`);
  const classLink = page
    .locator(`tr:has-text("${trainNumber}") a:has-text("${travelClass}"), a:has-text("${travelClass}")`)
    .first();

  if (await classLink.count()) {
    console.log(`      Found class link ${travelClass}. Clicking to fetch availability...`);
    await classLink.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(outDir, '07_after_class_click.png'), fullPage: true });

    // Click green [Book] button
    const bookBtn = page.locator('text="Book"').last();
    if (await bookBtn.count()) {
      console.log('      Found [Book] button. Clicking...');
      await bookBtn.click();
      await page.waitForTimeout(2000);

      // Handle confirmation modal OK if present
      const dialog = page.locator('ons-alert-dialog, .alert-dialog');
      if (await dialog.count()) {
        const dialogText = await dialog.first().innerText().catch(() => '');
        console.log(`      Confirm modal appeared: "${dialogText.replace(/\n+/g, ' ').trim()}"`);
        const okBtn = dialog
          .locator('button:has-text("OK"), .alert-dialog-button:has-text("OK"), button:has-text("Yes")')
          .first();
        const targetBtn = (await okBtn.count())
          ? okBtn
          : dialog.locator('button, .alert-dialog-button').last();
        if (await targetBtn.count()) {
          console.log('      Clicking dialog OK confirmation button...');
          await targetBtn.click();
          await page.waitForTimeout(3000);
        }
      }
    }
  } else {
    console.log(`      No direct class link found for train ${trainNumber}.`);
  }

  // Step 6: Fill Passenger Details if form is loaded
  console.log('[6/6] Inspecting Passenger Reservation Form...');
  const nameInput0 = page.locator('#pName0, input[id*="txtPassName_1"]').first();

  if (await nameInput0.count()) {
    console.log('      Passenger form detected! Filling test details...');

    // Mobile & Customer
    const mobileInput = page.locator('#txtCustomerMobile');
    if (await mobileInput.count()) await mobileInput.fill('9999224767');

    const customerName = page.locator('#txtCustomerName');
    if (await customerName.count()) await customerName.fill('Test Passenger');

    // Passenger 1
    await nameInput0.fill('Test Passenger');
    const ageInput0 = page.locator('#pAge0, input[id*="txtAge_1"]').first();
    if (await ageInput0.count()) await ageInput0.fill('28');

    const genderSelect0 = page.locator('#pGender0, select[id*="ddlSex_1"]').first();
    if (await genderSelect0.count()) await genderSelect0.selectOption({ value: 'M' }).catch(() => undefined);

    const berthSelect0 = page.locator('#pBerth0, select[id*="ddlBerth_1"]').first();
    if (await berthSelect0.count()) await berthSelect0.selectOption({ index: 1 }).catch(() => undefined);

    // Auto upgrade
    const autoUp = page.locator('#chkConsiderAutoUpgrade, #chkAutoUpgrade').first();
    if (await autoUp.count()) await autoUp.check().catch(() => undefined);

    const filledSs = path.join(outDir, '04_filled_reservation.png');
    await page.screenshot({ path: filledSs, fullPage: true });
    console.log(`      Saved reservation form screenshot to ${filledSs}`);
  } else {
    console.log('      Passenger form fields not loaded on this screen.');
  }

  if (shouldPause) {
    console.log('\n⏸️  Paused for inspection. Press Enter in terminal to close browser...');
    await new Promise((resolve) => process.stdin.once('data', resolve));
  }

  await browser.close();
  console.log('\n✅ Local Playwright test run finished.');
}

main().catch((err) => {
  console.error('\n❌ Error during Playwright execution:', err);
  process.exitCode = 1;
});
