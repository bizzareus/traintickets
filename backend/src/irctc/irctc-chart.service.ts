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
      await page.waitForSelector('input[id^="react-select-"]', { timeout: 30000 });

      // 1. Enter Train Name/Number
      this.logger.log(`Entering train number: ${trainNumber}`);
      // Find the first react-select input
      const inputs = await page.$$('input[id^="react-select-"]');
      if (inputs.length > 0) {
        await inputs[0].click();
        await inputs[0].type(trainNumber, { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.keyboard.press('Enter');
      }

      // 2. Enter Journey Date
      this.logger.log(`Entering journey date: ${journeyDate}`);
      // The date field is tricky in React, sometimes fill or type doesn't trigger the state update.
      // We'll click, clear and type.
      const dateInputSelector = 'div:has(> label:has-text("Journey Date*")) input';
      // Puppeteer doesn't support :has-text directly like Playwright, so we find it via evaluate or specific selector
      await page.evaluate((date) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const dateLabel = labels.find(l => l.textContent?.includes('Journey Date*'));
        if (dateLabel) {
          const input = dateLabel.parentElement?.querySelector('input');
          if (input) {
            input.focus();
            input.value = '';
          }
        }
      }, journeyDate);
      await page.keyboard.type(journeyDate, { delay: 100 });
      await page.keyboard.press('Enter');

      // 3. Enter Boarding Station
      this.logger.log(`Entering boarding station: ${boardingStation}`);
      const inputsAfterDate = await page.$$('input[id^="react-select-"]');
      if (inputsAfterDate.length > 1) {
        await inputsAfterDate[1].click();
        await inputsAfterDate[1].type(boardingStation, { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.keyboard.press('Enter');
      }

      // 4. Click "Get Train Chart"
      this.logger.log('Clicking "Get Train Chart"...');
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text?.includes('GET TRAIN CHART')) {
          await btn.click();
          break;
        }
      }

      // 5. Wait for results
      await new Promise(resolve => setTimeout(resolve, 5000)); // Give it time to load

      const fileName = `${trainNumber}_${journeyDate}_${boardingStation}.png`.replace(/\//g, '-');
      const filePath = `../public/charts/${fileName}`;
      
      this.logger.log(`Capturing result screenshot: ${fileName}`);
      await page.screenshot({ path: filePath, fullPage: true });

      return {
        ok: true,
        screenshotUrl: `/charts/${fileName}`,
        pageTitle: await page.title(),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch IRCTC chart: ${error.message}`, error.stack);
      throw error;
    } finally {
      await browser.close();
    }
  }
}
