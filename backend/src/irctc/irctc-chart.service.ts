import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class IrctcChartService {
  private readonly logger = new Logger(IrctcChartService.name);

  /**
   * Fetches the train chart by automating the IRCTC Online Charts page using Puppeteer.
   * @param trainNumber The train number (e.g., "12065")
   * @param journeyDate The journey date (format expected by IRCTC, e.g., "16-04-2026")
   * @param boardingStation The boarding station code (e.g., "AII")
   */
  async getTrainChart(
    trainNumber: string,
    journeyDate: string,
    boardingStation: string,
  ) {
    this.logger.log(
      `Launching puppeteer to fetch chart for train=${trainNumber} date=${journeyDate} station=${boardingStation}`,
    );

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Use a modern user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      );

      this.logger.log('Navigating to IRCTC Online Charts...');
      // Wait for domcontentloaded to be faster and less prone to networkidle timeouts on IRCTC
      await page.goto('https://www.irctc.co.in/online-charts/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      this.logger.log('Waiting for form to load...');
      await page.waitForSelector('input[id^="react-select-"]', {
        timeout: 30000,
      });

      // 1. Enter Train Name/Number
      this.logger.log(`Entering train number: ${trainNumber}`);
      // Find the first react-select input
      const inputs = await page.$$('input[id^="react-select-"]');
      if (inputs.length > 0) {
        await inputs[0].click();
        await inputs[0].type(trainNumber, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await page.keyboard.press('Enter');
      }

      // 2. Enter Journey Date
      this.logger.log(`Entering journey date: ${journeyDate}`);
      // The date field is tricky in React, sometimes fill or type doesn't trigger the state update.
      // We'll click, clear and type.
      // Puppeteer doesn't support :has-text directly like Playwright, so we find it via evaluate or specific selector
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const dateLabel = labels.find((l) =>
          l.textContent?.includes('Journey Date*'),
        );
        if (dateLabel) {
          const input = dateLabel.parentElement?.querySelector('input');
          if (input) {
            input.focus();
            input.value = '';
          }
        }
      });
      await page.keyboard.type(journeyDate, { delay: 100 });
      await page.keyboard.press('Enter');

      // 3. Enter Boarding Station
      this.logger.log(`Entering boarding station: ${boardingStation}`);
      const inputsAfterDate = await page.$$('input[id^="react-select-"]');
      if (inputsAfterDate.length > 1) {
        await inputsAfterDate[1].click();
        await inputsAfterDate[1].type(boardingStation, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await page.keyboard.press('Enter');
      }

      // 4. Click "Get Train Chart"
      this.logger.log('Clicking "Get Train Chart"...');
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (text?.includes('GET TRAIN CHART')) {
          await btn.click();
          break;
        }
      }

      // 5. Wait for results
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Give it time to load

      const fileName =
        `${trainNumber}_${journeyDate}_${boardingStation}.png`.replace(
          /\//g,
          '-',
        );
      const filePath = `../public/charts/${fileName}`;

      this.logger.log(`Capturing result screenshot: ${fileName}`);
      await page.screenshot({ path: filePath, fullPage: true });

      return {
        ok: true,
        screenshotUrl: `/charts/${fileName}`,
        pageTitle: await page.title(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch IRCTC chart: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * Automates the browser to fetch composition data as a fallback.
   */
  async getTrainCompositionViaBrowser(
    trainNumber: string,
    journeyDate: string,
    boardingStation: string,
  ): Promise<any> {
    const formattedDate = formatToDdMmYyyy(journeyDate);
    this.logger.log(
      `[Browser Fallback] Fetching composition via Puppeteer for train=${trainNumber} date=${formattedDate} station=${boardingStation}`,
    );
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      );

      let compositionData: any = null;
      let compositionError: string | null = null;

      // Intercept the API response
      page.on('response', (response) => {
        void (async () => {
          const url = response.url();
          if (url.includes('/online-charts/api/trainComposition')) {
            try {
              const status = response.status();
              const text = await response.text();
              if (status >= 200 && status < 300) {
                compositionData = JSON.parse(text);
              } else {
                compositionError = `HTTP error status ${status}: ${text.slice(0, 500)}`;
              }
            } catch (err) {
              compositionError = `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
        })();
      });

      await page.goto('https://www.irctc.co.in/online-charts/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      await page.waitForSelector('input[id^="react-select-"]', {
        timeout: 30000,
      });

      // 1. Enter Train Name/Number
      const inputs = await page.$$('input[id^="react-select-"]');
      if (inputs.length > 0) {
        await inputs[0].click();
        await inputs[0].type(trainNumber, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await page.keyboard.press('Enter');
      }

      // 2. Enter Journey Date
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const dateLabel = labels.find((l) =>
          l.textContent?.includes('Journey Date*'),
        );
        if (dateLabel) {
          const input = dateLabel.parentElement?.querySelector('input');
          if (input) {
            input.focus();
            input.value = '';
          }
        }
      });
      await page.keyboard.type(formattedDate, { delay: 100 });
      await page.keyboard.press('Enter');

      // 3. Enter Boarding Station
      const inputsAfterDate = await page.$$('input[id^="react-select-"]');
      if (inputsAfterDate.length > 1) {
        await inputsAfterDate[1].click();
        await inputsAfterDate[1].type(boardingStation, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await page.keyboard.press('Enter');
      }

      // 4. Click "Get Train Chart"
      const buttons = await page.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (text?.includes('GET TRAIN CHART')) {
          await btn.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        throw new Error('GET TRAIN CHART button not found');
      }

      // Wait for response to be intercepted
      const startTime = Date.now();
      const timeoutMs = 25000;
      while (
        !compositionData &&
        !compositionError &&
        Date.now() - startTime < timeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (compositionError) {
        throw new Error(compositionError);
      }

      if (!compositionData) {
        throw new Error('Timeout waiting for trainComposition API response');
      }

      return compositionData;
    } finally {
      await browser.close();
    }
  }

  /**
   * Automates the browser to fetch vacant berth details for a specific class as a fallback.
   */
  async getVacantBerthViaBrowser(
    trainNumber: string,
    journeyDate: string,
    boardingStation: string,
    classCode: string,
  ): Promise<any> {
    const formattedDate = formatToDdMmYyyy(journeyDate);
    this.logger.log(
      `[Browser Fallback] Fetching vacant berths via Puppeteer for train=${trainNumber} date=${formattedDate} station=${boardingStation} class=${classCode}`,
    );
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      );

      let vacantBerthData: any = null;
      let vacantBerthError: string | null = null;

      // Intercept the API response
      page.on('response', (response) => {
        void (async () => {
          const url = response.url();
          if (url.includes('/online-charts/api/vacantBerth')) {
            try {
              const status = response.status();
              const text = await response.text();
              if (status >= 200 && status < 300) {
                const parsed = JSON.parse(text);
                if (
                  parsed &&
                  String(parsed.cls || '').toUpperCase() ===
                    classCode.toUpperCase()
                ) {
                  vacantBerthData = parsed;
                }
              } else {
                vacantBerthError = `HTTP error status ${status}: ${text.slice(0, 500)}`;
              }
            } catch (err) {
              vacantBerthError = `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
        })();
      });

      await page.goto('https://www.irctc.co.in/online-charts/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      await page.waitForSelector('input[id^="react-select-"]', {
        timeout: 30000,
      });

      // 1. Enter Train Name/Number
      const inputs = await page.$$('input[id^="react-select-"]');
      if (inputs.length > 0) {
        await inputs[0].click();
        await inputs[0].type(trainNumber, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await page.keyboard.press('Enter');
      }

      // 2. Enter Journey Date
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const dateLabel = labels.find((l) =>
          l.textContent?.includes('Journey Date*'),
        );
        if (dateLabel) {
          const input = dateLabel.parentElement?.querySelector('input');
          if (input) {
            input.focus();
            input.value = '';
          }
        }
      });
      await page.keyboard.type(formattedDate, { delay: 100 });
      await page.keyboard.press('Enter');

      // 3. Enter Boarding Station
      const inputsAfterDate = await page.$$('input[id^="react-select-"]');
      if (inputsAfterDate.length > 1) {
        await inputsAfterDate[1].click();
        await inputsAfterDate[1].type(boardingStation, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await page.keyboard.press('Enter');
      }

      // 4. Click "Get Train Chart"
      const buttons = await page.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (text?.includes('GET TRAIN CHART')) {
          await btn.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        throw new Error('GET TRAIN CHART button not found');
      }

      // Wait for composition to load to see class tabs
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // 5. Find the class tab and click it
      const tabs = await page.$$('button, div, span, a');
      let tabClicked = false;
      for (const tab of tabs) {
        const text = await page.evaluate((el) => el.textContent, tab);
        const normalizedText = text?.trim().toUpperCase() || '';
        const target = classCode.toUpperCase();

        const matches =
          normalizedText === target ||
          (target === '3A' &&
            (normalizedText === '3 AC' ||
              normalizedText === '3AC' ||
              normalizedText === 'THIRD AC')) ||
          (target === '2A' &&
            (normalizedText === '2 AC' ||
              normalizedText === '2AC' ||
              normalizedText === 'SECOND AC')) ||
          (target === '1A' &&
            (normalizedText === '1 AC' ||
              normalizedText === '1AC' ||
              normalizedText === 'FIRST AC')) ||
          (target === 'SL' &&
            (normalizedText === 'SL' ||
              normalizedText === 'SLEEPER' ||
              normalizedText.includes('SLEEPER CLASS'))) ||
          (target === 'CC' &&
            (normalizedText === 'CC' ||
              normalizedText === 'AC CHAIR CAR' ||
              normalizedText === 'CHAIR CAR'));

        if (matches) {
          await tab.click();
          tabClicked = true;
          break;
        }
      }

      if (!tabClicked) {
        throw new Error(`Class tab ${classCode} not found in the DOM`);
      }

      // Wait for response to be intercepted
      const startTime = Date.now();
      const timeoutMs = 25000;
      while (
        !vacantBerthData &&
        !vacantBerthError &&
        Date.now() - startTime < timeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (vacantBerthError) {
        throw new Error(vacantBerthError);
      }

      if (!vacantBerthData) {
        throw new Error(
          `Timeout waiting for vacantBerth API response for class ${classCode}`,
        );
      }

      return vacantBerthData;
    } finally {
      await browser.close();
    }
  }
}

function formatToDdMmYyyy(yyyyMmDd: string): string {
  if (/^\d{2}-\d{2}-\d{4}$/.test(yyyyMmDd)) return yyyyMmDd;
  const parts = yyyyMmDd.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return yyyyMmDd;
}
