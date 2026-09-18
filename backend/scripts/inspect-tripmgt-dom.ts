import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const customCookies = process.env.TRIPMGT_COOKIES;
  if (customCookies) {
    const rawPairs = customCookies.split(';').map((c) => c.trim()).filter(Boolean);
    const cookieObjects: any[] = [];
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

  const page = await context.newPage();
  await page.goto('https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search', {
    waitUntil: 'domcontentloaded',
  });

  // Check "I Accept" rules
  const checkbox = page.locator('#chkIAgree, input[type="checkbox"]').first();
  if (await checkbox.count()) {
    await checkbox.check();
    await page.waitForTimeout(1000);
  }

  // Set Search parameters
  console.log('Filling search fields...');
  const fromInput = page.locator('#f1From');
  await fromInput.fill('NDLS');
  await page.waitForTimeout(500);

  const toInput = page.locator('#f1To');
  await toInput.fill('MMCT');
  await page.waitForTimeout(500);

  const dateInput = page.locator('#f1JourneyDate');
  await dateInput.fill('25-Sep-2026');
  await page.waitForTimeout(500);

  // Click Search Trains
  console.log('Clicking Search Trains...');
  await page.locator('#btnSearchTrains').click();
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'storage/cli-debug/06_search_results.png', fullPage: true });
  console.log('Captured search results snapshot!');

  // Click 3A on train 12952 (or first available 3A)
  console.log('Clicking 3A on 12952 MMCT TEJAS RAJ...');
  const classLink = page.locator('tr:has-text("12952") a:has-text("3A"), a:has-text("3A")').first();
  if (await classLink.count()) {
    await classLink.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'storage/cli-debug/07_after_class_click.png', fullPage: true });
    console.log('Captured after class click snapshot!');
  }

  // Inspect the green [Book] button
  const bookButtons = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter((el) => {
      return el.children.length === 0 && el.textContent?.trim() === 'Book';
    });
    return els.map((el) => ({
      tag: el.tagName,
      id: el.id,
      className: el.className,
      onclick: el.getAttribute('onclick'),
      val: (el as any).value,
      parentTag: el.parentElement?.tagName,
      parentId: el.parentElement?.id,
      parentClass: el.parentElement?.className,
    }));
  });
  // Click the book button
  const bookEl = page.locator('text="Book"').last();
  if (await bookEl.count()) {
    console.log('Clicking book element...');
    await bookEl.click();
    await page.waitForTimeout(2000);
  }

  // Click OK on modal if it appears
  const okBtn = page.locator('button:has-text("OK"), a:has-text("OK"), input[value="OK"]').first();
  if (await okBtn.count()) {
    console.log('Clicking OK on confirm popup...');
    await okBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'storage/cli-debug/09_book_form_ready.png', fullPage: true });
    console.log('Captured Book form ready snapshot!');
  }

  await browser.close();
}

main().catch(console.error);
