import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Page } from 'puppeteer';
import { captureSentryException } from '../common/sentry-report';

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const SENSOR_SETTLE_MS = 6_000;
const BROWSER_TIMEOUT_MS = 60_000;

/** Resolves the CDP WebSocket endpoint for Browserless with anti-detection routing. */
export function resolveBrowserWsEndpoint(): string | null {
  if (process.env.IRCTC_BROWSER_WSS?.trim()) {
    return process.env.IRCTC_BROWSER_WSS.trim();
  }
  if (process.env.BROWSERLESS_WSS?.trim()) {
    return process.env.BROWSERLESS_WSS.trim();
  }
  if (process.env.BROWSERLESS_API_KEY?.trim()) {
    const token = encodeURIComponent(process.env.BROWSERLESS_API_KEY.trim());
    const country = encodeURIComponent(
      process.env.BROWSERLESS_PROXY_COUNTRY?.trim() || 'in',
    );
    const proxyParam = process.env.BROWSERLESS_PROXY?.trim()
      ? `&proxy=${encodeURIComponent(process.env.BROWSERLESS_PROXY.trim())}`
      : `&proxy=residential&proxyCountry=${country}`;
    return `wss://chrome.browserless.io/stealth?token=${token}${proxyParam}&--disable-http2`;
  }
  return null;
}

@Injectable()
export class IrctcBrowserlessService {
  private readonly logger = new Logger(IrctcBrowserlessService.name);
  private browser: any = null;
  private page: Page | null = null;
  private pageWarmedAt = 0;
  private warmingPromise: Promise<Page> | null = null;
  private readonly SESSION_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

  /** Resolves the CDP WebSocket endpoint for Browserless with anti-detection routing. */
  private get browserWsEndpoint(): string | null {
    return resolveBrowserWsEndpoint();
  }

  get isEnabled(): boolean {
    return Boolean(this.browserWsEndpoint);
  }

  /**
   * Returns an active warmed page connected to IRCTC online charts.
   */
  private async getWarmPage(): Promise<Page> {
    const now = Date.now();
    if (
      this.page &&
      this.browser?.isConnected() &&
      now - this.pageWarmedAt < this.SESSION_MAX_AGE_MS
    ) {
      return this.page;
    }

    if (this.warmingPromise) {
      return this.warmingPromise;
    }

    this.warmingPromise = (async () => {
      await this.cleanup();

      const wss = this.browserWsEndpoint;
      if (!wss) throw new Error('Browserless endpoint not configured');

      const t0 = Date.now();
      this.logger.log('[browserless] initializing warm browser session...');
      const browser = await puppeteer.connect({ browserWSEndpoint: wss });
      this.browser = browser;

      browser.on('disconnected', () => {
        this.logger.warn(
          '[browserless] browser disconnected, invalidating session',
        );
        this.page = null;
        this.browser = null;
        this.pageWarmedAt = 0;
      });

      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      await page.goto(ONLINE_CHARTS_URL, {
        waitUntil: 'domcontentloaded',
        timeout: BROWSER_TIMEOUT_MS,
      });

      // Let Akamai sensor JS execute and establish valid session cookies
      await new Promise((r) => setTimeout(r, SENSOR_SETTLE_MS));

      this.page = page;
      this.pageWarmedAt = Date.now();
      this.logger.log(
        `[browserless] warm session ready in ${Date.now() - t0}ms`,
      );
      return page;
    })().finally(() => {
      this.warmingPromise = null;
    });

    return this.warmingPromise;
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
    } catch {
      // ignore cleanup errors
    } finally {
      this.page = null;
      this.browser = null;
      this.pageWarmedAt = 0;
    }
  }

  /**
   * Executes a task inside a warmed Browserless browser session with Indian residential IP.
   */
  async executeInBrowser<T>(evaluator: (page: Page) => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const page = await this.getWarmPage();
      const result = await evaluator(page);
      this.logger.log(`[browserless] execution_success ms=${Date.now() - t0}`);
      return result;
    } catch (err) {
      const ms = Date.now() - t0;
      this.logger.error(
        `[browserless] execution_failed ms=${ms}: ${err instanceof Error ? err.message : String(err)}, resetting session...`,
      );
      await this.cleanup();
      captureSentryException(err, {
        tags: { service: 'browserless' },
        extra: { ms },
      });
      throw err;
    }
  }

  /** Fetch official IRCTC schedule inquiry via Browserless */
  async fetchSchedule(
    trainNumber: string,
  ): Promise<{ status: number; data: any }> {
    return this.executeInBrowser(async (page) => {
      return page.evaluate(async (trainNo) => {
        const res = await fetch(
          `https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry/${trainNo}`,
          {
            headers: {
              accept: 'application/json, text/plain, */*',
              bmirak: 'webbm',
              greq: String(Date.now()),
            },
            credentials: 'include',
          },
        );
        return {
          status: res.status,
          data: await res.json().catch(() => null),
        };
      }, trainNumber);
    });
  }

  /** Fetch train composition via Browserless */
  async fetchTrainComposition(payload: {
    trainNo: string;
    jDate: string;
    boardingStation: string;
  }): Promise<{ status: number; data: any }> {
    return this.executeInBrowser(async (page) => {
      return page.evaluate(async (body) => {
        const res = await fetch(
          'https://www.irctc.co.in/online-charts/api/trainComposition',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              bmirak: 'webbm',
            },
            credentials: 'include',
            body: JSON.stringify(body),
          },
        );
        return {
          status: res.status,
          data: await res.json().catch(() => null),
        };
      }, payload);
    });
  }

  /** Fetch vacant berths via Browserless */
  async fetchVacantBerth(payload: {
    trainNo: string;
    jDate: string;
    boardingStation: string;
  }): Promise<{ status: number; data: any }> {
    return this.executeInBrowser(async (page) => {
      return page.evaluate(async (body) => {
        const res = await fetch(
          'https://www.irctc.co.in/online-charts/api/vacantBerth',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              bmirak: 'webbm',
            },
            credentials: 'include',
            body: JSON.stringify(body),
          },
        );
        return {
          status: res.status,
          data: await res.json().catch(() => null),
        };
      }, payload);
    });
  }

  /** Fetch coach composition via Browserless */
  async fetchCoachComposition(payload: {
    trainNo: string;
    jDate: string;
    boardingStation: string;
    coach: string;
  }): Promise<{ status: number; data: any }> {
    return this.executeInBrowser(async (page) => {
      return page.evaluate(async (body) => {
        const res = await fetch(
          'https://www.irctc.co.in/online-charts/api/coachComposition',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              bmirak: 'webbm',
            },
            credentials: 'include',
            body: JSON.stringify(body),
          },
        );
        return {
          status: res.status,
          data: await res.json().catch(() => null),
        };
      }, payload);
    });
  }
}
