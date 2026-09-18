import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, type Browser } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  SplitBookingPassenger,
  SplitBookingChildPassenger,
  SplitBookingLeg,
} from './split-booking.types';

export interface TripmgtBookingParams {
  bookingRef: string;
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string; // YYYY-MM-DD
  travelClass: string;
  quota?: string;
  legs: SplitBookingLeg[];
  passengers: SplitBookingPassenger[];
  childPassengers?: SplitBookingChildPassenger[];
  autoUpgrade?: boolean;
  contactMobile: string;
  contactEmail: string;
}

export interface TripmgtBookingResult {
  success: boolean;
  bookingRef: string;
  pnrLeg1?: string;
  pnrLeg2?: string;
  error?: string;
  logs: Array<{ timestamp: string; step: string; message: string }>;
  screenshotPaths: string[];
}

@Injectable()
export class TripmgtBookingService {
  private readonly logger = new Logger(TripmgtBookingService.name);

  constructor(private readonly config: ConfigService) {}

  private get bookingUrl(): string {
    return (
      this.config.get<string>('TRIPMGT_BOOKING_URL')?.trim() ||
      'https://tripmgt.in/V1/Train.aspx?ID=6a9ff06a3140a99ed3b57b3e&menu=search'
    );
  }

  private get isHeadless(): boolean {
    const val = this.config.get<string>('PLAYWRIGHT_HEADLESS');
    return val !== 'false' && val !== '0';
  }

  /**
   * Main automation entrypoint: navigates to TripMgt, verifies authenticated
   * agent session, fills train reservation, submits, and extracts verified PNRs.
   */
  async executeBooking(
    params: TripmgtBookingParams,
    onLogUpdate?: (log: {
      timestamp: string;
      step: string;
      message: string;
    }) => Promise<void> | void,
  ): Promise<TripmgtBookingResult> {
    const logs: Array<{ timestamp: string; step: string; message: string }> =
      [];
    const screenshotPaths: string[] = [];

    const addLog = async (step: string, message: string) => {
      const entry = {
        timestamp: new Date().toISOString(),
        step,
        message,
      };
      logs.push(entry);
      this.logger.log(`[${params.bookingRef}] [${step}] ${message}`);
      if (onLogUpdate) {
        try {
          await onLogUpdate(entry);
        } catch {
          // ignore callback error
        }
      }
    };

    const storageDir = path.resolve(
      process.cwd(),
      'storage',
      'bookings',
      params.bookingRef,
    );
    fs.mkdirSync(storageDir, { recursive: true });

    let browser: Browser | null = null;

    try {
      await addLog(
        'START',
        `Initiating automated booking on TripMgt for train ${params.trainNumber}`,
      );

      const configuredExecutablePath = this.config.get<string>(
        'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
      );
      const detectedExecutablePath =
        configuredExecutablePath ||
        (fs.existsSync('/usr/bin/chromium-browser')
          ? '/usr/bin/chromium-browser'
          : undefined) ||
        (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) ||
        (fs.existsSync('/usr/bin/google-chrome')
          ? '/usr/bin/google-chrome'
          : undefined);

      browser = await chromium.launch({
        headless: this.isHeadless,
        ...(detectedExecutablePath
          ? { executablePath: detectedExecutablePath }
          : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      // Inject custom session cookies if provided
      const rawCookies = this.config.get<string>('TRIPMGT_COOKIES')?.trim();
      if (rawCookies) {
        const rawPairs = rawCookies
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
          await addLog(
            'COOKIES',
            `Injected ${cookieObjects.length} TripMgt session cookies`,
          );
        }
      }

      const page = await context.newPage();
      await addLog(
        'NAVIGATION',
        `Navigating to booking portal: ${this.bookingUrl}`,
      );

      const response = await page.goto(this.bookingUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      const currentUrl = page.url();
      await addLog(
        'PAGE_LOADED',
        `Loaded URL: ${currentUrl} (Status: ${response?.status() ?? 'unknown'})`,
      );

      // Check if redirected to unauthenticated landing page or login page
      let isUnauthenticated =
        currentUrl === 'https://tripmgt.in/' ||
        currentUrl === 'https://tripmgt.in' ||
        currentUrl.includes('/login.aspx') ||
        (await page.locator('a[href*="login.aspx"]').count()) > 0 ||
        (await page.locator('text=Sign in to continue').count()) > 0;

      if (isUnauthenticated) {
        await addLog(
          'AUTH_CHECK',
          'Portal redirected to unauthenticated landing page. Checking credentials...',
        );
        const user = this.config.get<string>('TRIPMGT_USERNAME')?.trim();
        const pass = this.config.get<string>('TRIPMGT_PASSWORD')?.trim();

        if (user && pass) {
          await addLog('AUTH_LOGIN', `Attempting login as user: ${user}`);
          if (!page.url().includes('/login.aspx')) {
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
            .locator(
              'input[type="text"], input[name*="user" i], input[id*="user" i]',
            )
            .first();
          const passInput = page.locator('input[type="password"]').first();
          const submitBtn = page
            .locator('button[type="submit"], input[type="submit"]')
            .first();

          if ((await userInput.count()) > 0 && (await passInput.count()) > 0) {
            await userInput.fill(user);
            await passInput.fill(pass);
            await submitBtn.click();
            await page.waitForLoadState('domcontentloaded');
            await addLog('AUTH_SUCCESS', 'Submitted login form');

            // Re-check authentication status after login
            const postLoginUrl = page.url();
            isUnauthenticated =
              postLoginUrl.includes('/login.aspx') ||
              (await page.locator('a[href*="login.aspx"]').count()) > 0;
          }
        }

        if (isUnauthenticated) {
          const ssPath = path.join(storageDir, 'session_expired.png');
          await page.screenshot({ path: ssPath, fullPage: true });
          screenshotPaths.push(ssPath);
          await addLog(
            'AUTH_REQUIRED',
            'TripMgt requires active agent login session. Set TRIPMGT_COOKIES in backend/.env with active session.',
          );
          throw new Error(
            'TripMgt agent session is expired or unauthenticated. Please update TRIPMGT_COOKIES in backend/.env.',
          );
        }
      }

      // Step: Check Rules & Regulations Acceptance Checkbox (#chkIAgree)
      const acceptCheckbox = page.locator('#chkIAgree').first();
      if ((await acceptCheckbox.count()) > 0) {
        await acceptCheckbox.check().catch(() => undefined);
        await page.waitForTimeout(1000);
        await addLog('RULES_ACCEPTED', 'Checked rules agreement (#chkIAgree)');
      }

      // Step: Ticket Reservation Form Automation (as per Image 2)
      await addLog(
        'FORM_FILLING',
        'Looking for Ticket Reservation form fields...',
      );

      // Look for passenger count and fields
      const adultDropdown = page.locator('#selectPassengersAdult').first();
      if ((await adultDropdown.count()) > 0) {
        const adultCount = Math.min(params.passengers.length, 6);
        await adultDropdown.selectOption(String(adultCount));
        await addLog('ADULT_COUNT_SET', `Selected ${adultCount} adult(s)`);
      }

      const childDropdown = page.locator('#selectPassengersChild').first();
      if ((await childDropdown.count()) > 0) {
        const childCount = Math.min(params.childPassengers?.length ?? 0, 2);
        await childDropdown.selectOption(String(childCount));
        await addLog('CHILD_COUNT_SET', `Selected ${childCount} child(ren)`);
      }

      // Fill Contact Mobile & Name
      const mobileInput = page
        .locator(
          '#txtCustomerMobile, input[id*="CustomerMobile"], input[id*="txtMobile"]',
        )
        .first();
      if ((await mobileInput.count()) > 0) {
        await mobileInput.fill(params.contactMobile);
        await addLog('CONTACT_SET', `Set contact mobile: ${params.contactMobile}`);
      }

      const custNameInput = page
        .locator('#txtCustomerName, input[id*="CustomerName"]')
        .first();
      if ((await custNameInput.count()) > 0 && params.passengers[0]?.name) {
        await custNameInput.fill(params.passengers[0].name);
      }

      // Fill Passenger Rows (#pName0, #pAge0, #pGender0, #pBerth0)
      for (let i = 0; i < params.passengers.length && i < 6; i++) {
        const p = params.passengers[i];

        const nameInput = page.locator(`#pName${i}, #txtPassName_${i + 1}`).first();
        if ((await nameInput.count()) > 0) {
          await nameInput.fill(p.name);
        }

        const ageInput = page.locator(`#pAge${i}, #txtAge_${i + 1}`).first();
        if ((await ageInput.count()) > 0) {
          await ageInput.fill(String(p.age));
        }

        const genderSelect = page
          .locator(`#pGender${i}, #ddlSex_${i + 1}`)
          .first();
        if ((await genderSelect.count()) > 0) {
          const gVal = p.gender.startsWith('M')
            ? 'M'
            : p.gender.startsWith('F')
              ? 'F'
              : 'T';
          await genderSelect
            .selectOption(gVal)
            .catch(() => genderSelect.selectOption({ label: p.gender }));
        }

        const berthSelect = page
          .locator(`#pBerth${i}, #ddlBerth_${i + 1}`)
          .first();
        if (
          (await berthSelect.count()) > 0 &&
          p.berthPreference &&
          p.berthPreference !== 'No Preference'
        ) {
          const bCode = p.berthPreference.includes('Lower')
            ? 'LB'
            : p.berthPreference.includes('Middle')
              ? 'MB'
              : p.berthPreference.includes('Upper')
                ? 'UB'
                : p.berthPreference.includes('Side Lower')
                  ? 'SL'
                  : p.berthPreference.includes('Side Upper')
                    ? 'SU'
                    : '';
          if (bCode) {
            await berthSelect
              .selectOption(bCode)
              .catch(() => berthSelect.selectOption({ index: 1 }));
          }
        }

        await addLog(
          'PASSENGER_ADDED',
          `Filled passenger ${i + 1}: ${p.name}, Age ${p.age}, ${p.gender}`,
        );
      }

      // Child Passengers
      if (params.childPassengers && params.childPassengers.length > 0) {
        for (let i = 0; i < params.childPassengers.length && i < 2; i++) {
          const cp = params.childPassengers[i];
          const cNameInput = page.locator(`#pNameChild${i}`).first();
          if ((await cNameInput.count()) > 0) {
            await cNameInput.fill(cp.name);
          }
          const cAgeSelect = page.locator(`#pAgeChild${i}`).first();
          if ((await cAgeSelect.count()) > 0) {
            await cAgeSelect.selectOption(String(cp.age));
          }
          const cGenderSelect = page.locator(`#pGenderChild${i}`).first();
          if ((await cGenderSelect.count()) > 0) {
            const gVal = cp.gender.startsWith('M') ? 'M' : 'F';
            await cGenderSelect.selectOption(gVal);
          }
          await addLog(
            'CHILD_ADDED',
            `Filled infant ${i + 1}: ${cp.name}, Age ${cp.age}`,
          );
        }
      }

      // Auto Upgradation Checkbox
      if (params.autoUpgrade !== false) {
        const autoUpgradeCheck = page
          .locator('#chkConsiderAutoUpgrade, #chkAutoUpgrade')
          .first();
        if ((await autoUpgradeCheck.count()) > 0) {
          await autoUpgradeCheck.check().catch(() => undefined);
          await addLog(
            'AUTO_UPGRADE',
            'Checked "Consider for Auto Upgradation"',
          );
        }
      }

      // Capture filled form screenshot for audit
      const formFilledPath = path.join(
        storageDir,
        'reservation_form_filled.png',
      );
      await page.screenshot({ path: formFilledPath, fullPage: true });
      screenshotPaths.push(formFilledPath);
      await addLog(
        'SCREENSHOT',
        `Saved reservation form screenshot: ${formFilledPath}`,
      );

      // Submit Form Button
      const nextBtn = page
        .locator('input[value="Next"].btn, input[type="submit"].btn')
        .first();
      if ((await nextBtn.count()) > 0) {
        await addLog('SUBMITTING', 'Submitting reservation form to proceed to payment...');
        await nextBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
      }

      // Extract Confirmation & PNRs from Result Page
      const postSubmitUrl = page.url();
      const pageText = (await page.textContent('body')) || '';

      // Look for 10-digit PNR numbers in page text
      const pnrMatches = Array.from(
        new Set(pageText.match(/\b[2-9]\d{9}\b/g) || []),
      );

      const confirmSnapPath = path.join(storageDir, 'confirmation_page.png');
      await page.screenshot({ path: confirmSnapPath, fullPage: true });
      screenshotPaths.push(confirmSnapPath);

      if (pnrMatches.length > 0) {
        const pnr1 = pnrMatches[0];
        const pnr2 = pnrMatches.length > 1 ? pnrMatches[1] : undefined;

        await addLog(
          'SUCCESS',
          `Automated booking confirmed on TripMgt! PNR 1: ${pnr1}${pnr2 ? `, PNR 2: ${pnr2}` : ''}`,
        );

        return {
          success: true,
          bookingRef: params.bookingRef,
          pnrLeg1: pnr1,
          pnrLeg2: pnr2,
          logs,
          screenshotPaths,
        };
      }

      // Check if page contains specific error messages
      const isErrorPage =
        pageText.toLowerCase().includes('booking failed') ||
        pageText.toLowerCase().includes('insufficient wallet balance') ||
        pageText.toLowerCase().includes('session expired') ||
        pageText.toLowerCase().includes('ticket not available');

      const failureReason = isErrorPage
        ? 'Portal returned error or insufficient wallet balance during reservation.'
        : `Could not extract confirmed PNR from portal response (URL: ${postSubmitUrl}).`;

      await addLog('ERROR', failureReason);

      return {
        success: false,
        bookingRef: params.bookingRef,
        error: failureReason,
        logs,
        screenshotPaths,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await addLog('ERROR', `Automation encountered an issue: ${errorMsg}`);

      return {
        success: false,
        bookingRef: params.bookingRef,
        error: errorMsg,
        logs,
        screenshotPaths,
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}
