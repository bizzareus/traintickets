import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });

  const customCookies = process.env.TRIPMGT_COOKIES;
  if (customCookies) {
    const rawPairs = customCookies.split(';').map(c => c.trim()).filter(Boolean);
    const cookieObjects = rawPairs.map(pair => {
      const eqIdx = pair.indexOf('=');
      return {
        name: pair.substring(0, eqIdx).trim(),
        value: pair.substring(eqIdx + 1).trim(),
        domain: '.tripmgt.in',
        path: '/',
      };
    });
    await context.addCookies(cookieObjects);
  }

  const page = await context.newPage();
  
  // Track all navigations and popup creations
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log('>>> Navigation event:', frame.url());
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('admin') || url.includes('Train') || url.includes('Book') || url.includes('Pay')) {
      console.log(`>>> Response: HTTP ${response.status()} from ${url}`);
    }
  });

  const targetUrl = process.env.TRIPMGT_BOOKING_URL || 'https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search';
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  const cb = page.locator('#chkIAgree, input[type="checkbox"]').first();
  if (await cb.count()) await cb.check().catch(() => {});

  await page.locator('#f1From').fill('NDLS');
  await page.locator('#f1To').fill('MMCT');
  await page.locator('#f1JourneyDate').fill('13-Oct-2026');
  await page.locator('#btnSearchTrains').click();
  await page.waitForTimeout(4000);

  const classLink = page.locator('tr:has-text("12952") a:has-text("3A"), a:has-text("3A")').first();
  await classLink.click();
  await page.waitForTimeout(3000);

  await page.locator('text="Book"').last().click();
  await page.waitForTimeout(1500);

  const dialog = page.locator('ons-alert-dialog, .alert-dialog');
  if (await dialog.count()) {
    const okBtn = dialog.locator('button:has-text("OK"), .alert-dialog-button:has-text("OK")').first();
    const targetBtn = (await okBtn.count()) ? okBtn : dialog.locator('button, .alert-dialog-button').last();
    await targetBtn.click();
    await page.waitForTimeout(3000);
  }

  // Fill passenger details
  await page.locator('#txtCustomerMobile').fill('9999224767');
  await page.locator('#txtCustomerName').fill('Test Passenger');
  await page.locator('#pName0, input[id*="txtPassName_1"]').first().fill('Test Passenger');
  await page.locator('#pAge0, input[id*="txtAge_1"]').first().fill('28');
  await page.locator('#pGender0, select[id*="ddlSex_1"]').first().selectOption({ value: 'M' }).catch(() => {});
  await page.locator('#pBerth0, select[id*="ddlBerth_1"]').first().selectOption({ index: 1 }).catch(() => {});

  // Inspect the Next button element details
  console.log('\n--- INSPECTING NEXT BUTTON ---');
  const nextInfo = await page.evaluate(() => {
    const btn = document.querySelector('input[value="Next"], button.btn, .btn:not(#menu1)') as any;
    const allNext = Array.from(document.querySelectorAll('*')).filter(el => el.textContent?.trim() === 'Next' || (el as any).value === 'Next');
    return {
      matchCount: allNext.length,
      elements: allNext.map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        type: (el as any).type,
        value: (el as any).value,
        onclick: el.getAttribute('onclick'),
        outerHTML: el.outerHTML,
      })),
      formAction: (document.querySelector('form') as HTMLFormElement)?.action,
    };
  });
  console.log(JSON.stringify(nextInfo, null, 2));

  // Click the Next button and wait for response/navigation
  const nextBtn = page.locator('input[value="Next"], button:has-text("Next"), .btn:has-text("Next")').first();
  console.log('\nClicking Next button...');
  await nextBtn.click();
  await page.waitForTimeout(5000);

  console.log('\nCurrent URL after clicking Next:', page.url());
  await page.screenshot({ path: 'storage/cli-debug/05_after_next.png', fullPage: true });
  console.log('Saved screenshot to storage/cli-debug/05_after_next.png');

  const visibleText = await page.locator('body').innerText();
  console.log('\n--- VISIBLE TEXT AFTER NEXT ---');
  console.log(visibleText.slice(0, 800));

  await browser.close();
}

main().catch(console.error);
