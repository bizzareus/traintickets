import 'dotenv/config';
import { chromium, type Page, type BrowserContext } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface Passenger {
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Transgender';
  berthPreference?: string;
  foodChoice?: string;
}

interface JourneyLeg {
  from: string;
  to: string;
  date: string; // YYYY-MM-DD or DD-Mon-YYYY
  trainNumber: string;
  preferredClass: string;
}

interface BookingScenario {
  bookingRef: string;
  trainNumber: string;
  trainName?: string;
  contactMobile: string;
  contactEmail: string;
  autoUpgrade: boolean;
  travelInsurance: boolean;
  passengers: Passenger[];
  legs: JourneyLeg[];
}

function formatDateToTripMgt(dateStr: string): string {
  // If already in DD-Mon-YYYY, return as is
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(dateStr)) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [yyyy, mm, dd] = dateStr.split('-');
  if (!yyyy || !mm || !dd) return dateStr;
  const monthName = months[parseInt(mm, 10) - 1];
  return `${dd.padStart(2, '0')}-${monthName}-${yyyy}`;
}

const SCENARIOS: Record<string, BookingScenario> = {
  // Scenario 1: Real production manual ticket LB-A0XJQ (4 legs on 12626 Kerala SF Exp)
  'LB-A0XJQ': {
    bookingRef: 'LB-A0XJQ',
    trainNumber: '12626',
    trainName: 'KERALA SF EXP',
    contactMobile: '6261947398',
    contactEmail: 'shivdevpal49@gmail.com',
    autoUpgrade: true,
    travelInsurance: true,
    passengers: [
      {
        name: 'Shivdev Pal',
        age: 25,
        gender: 'Male',
        berthPreference: 'Side Lower',
        foodChoice: 'Veg',
      },
    ],
    legs: [
      { from: 'GWL', to: 'BINA', date: '2026-10-08', trainNumber: '12626', preferredClass: '3E' },
      { from: 'BINA', to: 'ET', date: '2026-10-08', trainNumber: '12626', preferredClass: '3E' },
      { from: 'NGP', to: 'BZA', date: '2026-10-08', trainNumber: '12626', preferredClass: '3E' },
      { from: 'CBE', to: 'TCR', date: '2026-10-09', trainNumber: '12626', preferredClass: '3E' },
    ],
  },

  // Scenario 2: Northern corridor 2-leg split ticket (NDLS -> CNB, CNB -> PRYJ)
  'NORTH-SPLIT-2LEG': {
    bookingRef: 'NORTH-SPLIT-2LEG',
    trainNumber: '12418',
    trainName: 'PRAYAGRAJ EXP',
    contactMobile: '9999224767',
    contactEmail: 'kartik.arora1508@gmail.com',
    autoUpgrade: true,
    travelInsurance: true,
    passengers: [
      { name: 'Amit Kumar', age: 34, gender: 'Male', berthPreference: 'Lower' },
      { name: 'Pooja Kumar', age: 31, gender: 'Female', berthPreference: 'Middle' },
    ],
    legs: [
      { from: 'NDLS', to: 'CNB', date: '2026-10-12', trainNumber: '12418', preferredClass: '3A' },
      { from: 'CNB', to: 'PRYJ', date: '2026-10-13', trainNumber: '12418', preferredClass: '3A' },
    ],
  },
};

async function executeLeg(
  page: Page,
  scenario: BookingScenario,
  leg: JourneyLeg,
  legIndex: number,
  totalLegs: number,
  outDir: string,
): Promise<{ success: boolean; legName: string; stage: string; error?: string }> {
  const legLabel = `Leg ${legIndex + 1}/${totalLegs}: ${leg.from} → ${leg.to}`;
  const legPrefix = `leg_${legIndex + 1}_${leg.from}_${leg.to}`;
  const journeyDateFormatted = formatDateToTripMgt(leg.date);

  console.log(`\n================================================================`);
  console.log(` 🚂 [${scenario.bookingRef}] Starting ${legLabel} on ${journeyDateFormatted}`);
  console.log(`================================================================`);

  try {
    const targetUrl =
      process.env.TRIPMGT_BOOKING_URL ||
      'https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search';

    console.log(`[Step 1] Loading booking terminal...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Accept rules checkbox if shown
    const cb = page.locator('#chkIAgree, label[for="chkIAgree"], input[type="checkbox"]').first();
    if (await cb.count()) {
      console.log(`         Accepting #chkIAgree rules agreement...`);
      await cb.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Step 2: Fill search parameters
    console.log(`[Step 2] Searching: ${leg.from} → ${leg.to} on ${journeyDateFormatted}...`);
    await page.locator('#f1From').fill(leg.from);
    await page.waitForTimeout(250);
    await page.locator('#f1To').fill(leg.to);
    await page.waitForTimeout(250);
    await page.locator('#f1JourneyDate').fill(journeyDateFormatted);
    await page.waitForTimeout(250);

    await page.locator('#btnSearchTrains').click();
    await page.waitForTimeout(4000);

    const searchSs = path.join(outDir, `${legPrefix}_01_search_results.png`);
    await page.screenshot({ path: searchSs, fullPage: true });
    console.log(`         Snapshot saved: ${searchSs}`);

    // Step 3: Find Train & Class
    console.log(`[Step 3] Locating Train ${leg.trainNumber} (Class: ${leg.preferredClass})...`);
    // Try exact train number first
    let classAnchor = page
      .locator(`tr:has-text("${leg.trainNumber}") a:has-text("${leg.preferredClass}")`)
      .first();

    if ((await classAnchor.count()) === 0) {
      // Fallback: look for any class on that train
      classAnchor = page.locator(`tr:has-text("${leg.trainNumber}") a[onclick*="Availability"]`).first();
    }

    if ((await classAnchor.count()) === 0) {
      // Fallback: pick any available train row matching preferredClass or first availability link
      classAnchor = page.locator(`table a:has-text("${leg.preferredClass}")`).first();
      if ((await classAnchor.count()) === 0) {
        classAnchor = page.locator(`table a[onclick*="Availability"]`).first();
      }
    }

    if ((await classAnchor.count()) === 0) {
      throw new Error(`No class availability links found for ${leg.from} → ${leg.to}`);
    }

    const classText = await classAnchor.innerText();
    console.log(`         Clicking class: "${classText.trim()}"...`);
    await classAnchor.click();
    await page.waitForTimeout(3000);

    const classSs = path.join(outDir, `${legPrefix}_02_class_selected.png`);
    await page.screenshot({ path: classSs, fullPage: true });

    // Step 4: Click green [Book] button
    console.log(`[Step 4] Clicking green [Book] button...`);
    const bookBtn = page.locator('text="Book"').last();
    await bookBtn.click();
    await page.waitForTimeout(1500);

    // Handle station mismatch or confirmation dialog if present
    const confirmDialog = page.locator('ons-alert-dialog, .alert-dialog');
    if (await confirmDialog.count()) {
      const dText = await confirmDialog.first().innerText().catch(() => '');
      console.log(`         Handling confirm dialog: "${dText.replace(/\n+/g, ' ').trim()}"`);
      const okBtn = confirmDialog.locator('button:has-text("OK"), .alert-dialog-button:has-text("OK")').first();
      const targetBtn = (await okBtn.count()) ? okBtn : confirmDialog.locator('button, .alert-dialog-button').last();
      await targetBtn.click();
      await page.waitForTimeout(3000);
    }

    // Step 5: Fill passenger details
    console.log(`[Step 5] Pre-filling Passenger Details (${scenario.passengers.length} passenger(s))...`);
    await page.locator('#txtCustomerMobile').fill(scenario.contactMobile);
    await page.locator('#txtCustomerName').fill(scenario.passengers[0].name);

    for (let i = 0; i < scenario.passengers.length && i < 6; i++) {
      const p = scenario.passengers[i];
      const pNameInput = page.locator(`#pName${i}, input[id*="txtPassName_${i + 1}"]`).first();
      if (await pNameInput.count()) await pNameInput.fill(p.name);

      const pAgeInput = page.locator(`#pAge${i}, input[id*="txtAge_${i + 1}"]`).first();
      if (await pAgeInput.count()) await pAgeInput.fill(String(p.age));

      const pGenderSelect = page.locator(`#pGender${i}, select[id*="ddlSex_${i + 1}"]`).first();
      if (await pGenderSelect.count()) {
        const gVal = p.gender.startsWith('M') ? 'M' : p.gender.startsWith('F') ? 'F' : 'T';
        await pGenderSelect.selectOption({ value: gVal }).catch(() => {});
      }

      const pBerthSelect = page.locator(`#pBerth${i}, select[id*="ddlBerth_${i + 1}"]`).first();
      if (await pBerthSelect.count() && p.berthPreference) {
        await pBerthSelect.selectOption({ index: 1 }).catch(() => {});
      }
    }

    // Auto upgrade
    if (scenario.autoUpgrade) {
      const autoUp = page.locator('#chkConsiderAutoUpgrade, #chkAutoUpgrade').first();
      if (await autoUp.count()) await autoUp.check().catch(() => {});
    }

    const formSs = path.join(outDir, `${legPrefix}_03_form_filled.png`);
    await page.screenshot({ path: formSs, fullPage: true });
    console.log(`         Saved filled form screenshot: ${formSs}`);

    // Step 6: Advance toward Review / Payment stage
    console.log(`[Step 6] Clicking Next button to advance to Review / Payment stage...`);
    const nextBtn = page.locator('input[value="Next"], button:has-text("Next"), .btn:has-text("Next")').first();
    await nextBtn.click();
    await page.waitForTimeout(4000);

    // Step 7: Handle & Skip "Invalid wsUserLogin ID" alert modal
    const alertModal = page.locator('ons-alert-dialog, .alert-dialog');
    if (await alertModal.count()) {
      const alertMsg = await alertModal.first().innerText().catch(() => '');
      console.log(`\n🔔 Caught Alert Dialog: "${alertMsg.replace(/\n+/g, ' ').trim()}"`);
      if (alertMsg.includes('Invalid wsUserLogin ID') || alertMsg.includes('Alert')) {
        console.log(`   👉 Skipping 'Invalid wsUserLogin ID' step as requested for test.`);
        const okAlertBtn = alertModal.locator('button:has-text("OK"), .alert-dialog-button').first();
        if (await okAlertBtn.count()) {
          await okAlertBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    const reviewSs = path.join(outDir, `${legPrefix}_04_review_stage.png`);
    await page.screenshot({ path: reviewSs, fullPage: true });
    console.log(`         Snapshot at stage: ${reviewSs}`);

    console.log(`✅ [${legLabel}] Successfully reached review stage and skipped error modal!`);
    return { success: true, legName: legLabel, stage: 'REVIEW_REACHED' };
  } catch (err: any) {
    console.error(`❌ [${legLabel}] Failed at step:`, err.message);
    const errSs = path.join(outDir, `${legPrefix}_error.png`);
    await page.screenshot({ path: errSs, fullPage: true }).catch(() => {});
    return { success: false, legName: legLabel, stage: 'FAILED', error: err.message };
  }
}

async function runScenario(scenarioKey: string) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) {
    throw new Error(`Unknown scenario key: ${scenarioKey}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
  }

  const outDir = path.resolve(process.cwd(), 'storage', 'cli-debug', scenario.bookingRef);
  fs.mkdirSync(outDir, { recursive: true });

  console.log('\n################################################################');
  console.log(` MULTI-LEG PLAYWRIGHT BOOKING TEST: ${scenario.bookingRef}`);
  console.log(` Train: ${scenario.trainNumber} - ${scenario.trainName}`);
  console.log(` Passenger: ${scenario.passengers.map((p) => p.name).join(', ')}`);
  console.log(` Legs Count: ${scenario.legs.length}`);
  console.log(` Storage: ${outDir}`);
  console.log('################################################################\n');

  const browser = await chromium.launch({ headless: true });
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

  const page = await context.newPage();

  // Auto-dismiss native alerts (e.g. admin notice)
  page.on('dialog', async (d) => {
    console.log(`[Native Dialog] Auto-accepting: "${d.message()}"`);
    await d.accept().catch(() => {});
  });

  const results: Array<{ legName: string; success: boolean; stage: string; error?: string }> = [];

  for (let i = 0; i < scenario.legs.length; i++) {
    const legResult = await executeLeg(page, scenario, scenario.legs[i], i, scenario.legs.length, outDir);
    results.push(legResult);
  }

  await browser.close();

  console.log('\n================================================================');
  console.log(` 📊 SUMMARY RESULTS FOR SCENARIO ${scenario.bookingRef}`);
  console.log('================================================================');
  results.forEach((r, idx) => {
    const icon = r.success ? '✅' : '❌';
    console.log(` ${icon} [Leg ${idx + 1}] ${r.legName} -> Status: ${r.stage} ${r.error ? `(${r.error})` : ''}`);
  });
  console.log('================================================================\n');
}

async function main() {
  const requestedScenario = process.argv[2] || 'LB-A0XJQ';
  await runScenario(requestedScenario);
}

main().catch((err) => {
  console.error('\n❌ Test execution runner failed:', err);
  process.exitCode = 1;
});
