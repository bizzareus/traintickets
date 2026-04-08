import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);

  async captureWithInjectedData(opts: {
    commentId: string;
    altResult: unknown;
    trainNumber: string;
    trainName?: string;
    journeyDate?: string;
    trains: unknown[];
  }): Promise<string> {
    const publicPath = process.env.SCREENSHOT_PUBLIC_PATH || '/screenshots';
    const fsPathBase =
      process.env.SCREENSHOT_FS_PATH || '../public/screenshots'; // Relative to backend/
    const fsDir = path.resolve(process.cwd(), fsPathBase);

    try {
      await fs.mkdir(fsDir, { recursive: true });
    } catch (err) {
      this.logger.error(`Failed to create screenshot dir: ${fsDir}`, err);
    }

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      const payload = {
        altResult: opts.altResult,
        trainNumber: opts.trainNumber,
        trainName: opts.trainName,
        journeyDate: opts.journeyDate,
        trains: opts.trains,
      };

      await page.evaluateOnNewDocument((data) => {
        localStorage.setItem('bot_render_alt', JSON.stringify(data));
      }, payload);

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
      // Load the app. The react mount effect will pick up the localstorage payload and render the modal automatically.
      const url = `${baseUrl}/`;

      this.logger.log(
        `Screenshot capturing URL: ${url} for comment ${opts.commentId}`,
      );
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForSelector('.fixed.inset-0', { timeout: 15000 });

      // Wait an extra second for images/fonts/renders
      await new Promise((r) => setTimeout(r, 1000));

      const modal = await page.$('.fixed.inset-0 > div[role="dialog"]');
      const filePath = path.join(fsDir, `${opts.commentId}.png`);

      if (modal) {
        await modal.screenshot({ path: filePath });
      } else {
        await page.screenshot({ path: filePath });
      }

      return `${publicPath}/${opts.commentId}.png`;
    } finally {
      await browser.close();
    }
  }
}
