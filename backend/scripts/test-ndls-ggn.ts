import 'dotenv/config';
import { chromium } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  // Always use Asia/Kolkata timezone so client-side Tatkal hour checks (8:00, 10:00, 11:00) match Indian time
  const context = await browser.newContext({
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const customCookies = process.env.TRIPMGT_COOKIES;
  if (customCookies) {
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
  }

  const outDir = path.resolve(process.cwd(), 'storage', 'cli-debug');
  fs.mkdirSync(outDir, { recursive: true });

  const page = await context.newPage();

  // Auto-dismiss initial native alerts (e.g., admin booking activation notice)
  page.on('dialog', async (dialog) => {
    console.log(`[Dialog Alert] Intercepted message: "${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('AvailabilityFareCheck') || url.includes('Availability') || url.includes('Payment')) {
      console.log(`[API Response] HTTP ${res.status()} from ${url}`);
    }
  });

  const targetUrl =
    process.env.TRIPMGT_BOOKING_URL ||
    'https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search';
  console.log(`[1/7] Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  // Step 2: Accept Rules checkbox
  console.log('[2/7] Accepting Rules & Regulations (#chkIAgree)...');
  const cb = page.locator('#chkIAgree');
  if (await cb.count()) {
    await cb.click();
    await page.waitForTimeout(1500);
  }

  // Calculate a future date (+3 days from today) in DD-Mon-YYYY format
  const journeyDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  })();

  // Step 3: Search Trains NDLS to GGN
  console.log(`[3/7] Searching trains from NDLS to GGN on ${journeyDate}...`);
  await page.locator('#f1From').fill('NDLS');
  await page.waitForTimeout(300);
  await page.locator('#f1To').fill('GGN');
  await page.waitForTimeout(300);
  await page.locator('#f1JourneyDate').fill(journeyDate);
  await page.waitForTimeout(300);

  await page.locator('#btnSearchTrains').click();
  await page.waitForTimeout(4000);

  const searchSs = path.join(outDir, 'ndls_ggn_01_search_results.png');
  await page.screenshot({ path: searchSs, fullPage: true });
  console.log(`      Saved search results to ${searchSs}`);

  // Step 4: Pick the first train with a clickable class
  console.log('[4/7] Selecting first available class in search results...');
  const classAnchors = page.locator('table a:has-text("CC"), table a:has-text("2S"), table a:has-text("SL"), table a:has-text("3A"), table a:has-text("EC")');
  const classCount = await classAnchors.count();
  console.log(`      Found ${classCount} class options.`);

  if (classCount === 0) {
    const anyLink = page.locator('table a[onclick*="Availability"]').first();
    if (await anyLink.count()) {
      await anyLink.click();
    } else {
      console.log('      No class availability links found for this route.');
      await browser.close();
      return;
    }
  } else {
    const chosenClass = classAnchors.first();
    const txt = await chosenClass.innerText();
    console.log(`      Clicking class link: "${txt.trim()}"...`);
    await chosenClass.click();
  }

  await page.waitForTimeout(3000);
  const classSs = path.join(outDir, 'ndls_ggn_02_class_selected.png');
  await page.screenshot({ path: classSs, fullPage: true });

  // Step 5: Click green [Book] button
  console.log('[5/7] Clicking [Book] button...');
  const bookBtn = page.locator('text="Book"').last();
  await bookBtn.click();
  await page.waitForTimeout(1500);

  // Handle station confirm dialog if present
  const confirmModal = page.locator('ons-alert-dialog, .alert-dialog');
  if (await confirmModal.count()) {
    const modalText = await confirmModal.first().innerText().catch(() => '');
    console.log(`      Modal dialog: "${modalText.replace(/\n+/g, ' ').trim()}"`);
    const okBtn = confirmModal.locator('button:has-text("OK"), .alert-dialog-button:has-text("OK")').first();
    const targetBtn = (await okBtn.count()) ? okBtn : confirmModal.locator('button, .alert-dialog-button').last();
    await targetBtn.click();
    await page.waitForTimeout(3000);
  }

  // Step 6: Fill passenger details
  console.log('[6/7] Entering passenger details on reservation form...');
  await page.locator('#txtCustomerMobile').fill('9999224767');
  await page.locator('#txtCustomerName').fill('Rohan Sharma');

  const pName = page.locator('#pName0, input[id*="txtPassName_1"]').first();
  if (await pName.count()) await pName.fill('Rohan Sharma');

  const pAge = page.locator('#pAge0, input[id*="txtAge_1"]').first();
  if (await pAge.count()) await pAge.fill('30');

  const pGender = page.locator('#pGender0, select[id*="ddlSex_1"]').first();
  if (await pGender.count()) await pGender.selectOption({ value: 'M' }).catch(() => {});

  const pBerth = page.locator('#pBerth0, select[id*="ddlBerth_1"]').first();
  if (await pBerth.count()) await pBerth.selectOption({ index: 1 }).catch(() => {});

  const autoUp = page.locator('#chkConsiderAutoUpgrade, #chkAutoUpgrade').first();
  if (await autoUp.count()) await autoUp.check().catch(() => {});

  const formSs = path.join(outDir, 'ndls_ggn_03_form_filled.png');
  await page.screenshot({ path: formSs, fullPage: true });
  console.log(`      Saved pre-filled reservation form snapshot to ${formSs}`);

  // Step 7: Advance toward review / payment WITHOUT PAYING
  console.log('[7/7] Clicking Next button to advance toward review / payment (NO PAYMENT)...');
  const nextBtn = page.locator('input[value="Next"], button:has-text("Next"), .btn:has-text("Next")').first();
  await nextBtn.click();
  await page.waitForTimeout(5000);

  const stageSs = path.join(outDir, 'ndls_ggn_04_payment_stage.png');
  await page.screenshot({ path: stageSs, fullPage: true });
  console.log(`\n📸 Captured final snapshot at: ${stageSs}`);

  console.log('\n--- CURRENT PAGE STATE ---');
  console.log(`URL: ${page.url()}`);
  const visible = await page.locator('body').innerText();
  console.log(visible.slice(0, 1200));

  await browser.close();
  console.log('\n✅ Completed NDLS → GGN scenario test (stopped before payment).');
}

main().catch((err) => {
  console.error('\n❌ Execution failed:', err);
  process.exitCode = 1;
});
