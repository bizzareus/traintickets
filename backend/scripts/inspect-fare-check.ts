import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });

  const customCookies = process.env.TRIPMGT_COOKIES;
  if (customCookies) {
    const rawPairs = customCookies.split(';').map((c) => c.trim()).filter(Boolean);
    const cookieObjects = rawPairs.map((pair) => {
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

  page.on('request', (req) => {
    if (req.url().includes('AvailabilityFareCheck')) {
      console.log('\n>>> REQUEST to AvailabilityFareCheck:');
      console.log('Method:', req.method());
      console.log('Headers:', req.headers());
      console.log('PostData:', req.postData());
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('AvailabilityFareCheck')) {
      console.log('\n>>> RESPONSE from AvailabilityFareCheck:');
      console.log('Status:', res.status());
      try {
        const text = await res.text();
        console.log('Body:', text);
      } catch (e: any) {
        console.log('Error reading body:', e.message);
      }
    }
    if (res.url().includes('UserDetail')) {
      console.log('\n>>> RESPONSE from UserDetail:');
      console.log('Status:', res.status());
      try {
        console.log('Body:', await res.text());
      } catch {}
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

  const nextBtn = page.locator('input[value="Next"], button:has-text("Next"), .btn:has-text("Next")').first();
  console.log('\nClicking Next button...');
  await nextBtn.click();
  await page.waitForTimeout(5000);

  await browser.close();
}

main().catch(console.error);
