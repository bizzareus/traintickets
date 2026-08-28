import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Page } from 'puppeteer';
import { captureSentryException } from '../common/sentry-report';

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const SENSOR_SETTLE_MS = 6_000;
const BROWSER_TIMEOUT_MS = 60_000;

@Injectable()
export class IrctcBrowserlessService {
  private readonly logger = new Logger(IrctcBrowserlessService.name);

  /** Resolves the CDP WebSocket endpoint for Browserless with anti-detection routing. */
  private get browserWsEndpoint(): string | null {
    if (process.env.IRCTC_BROWSER_WSS?.trim()) {
      return process.env.IRCTC_BROWSER_WSS.trim();
    }
    if (process.env.BROWSERLESS_WSS?.trim()) {
      return process.env.BROWSERLESS_WSS.trim();
    }
    if (process.env.BROWSERLESS_API_KEY?.trim()) {
      const token = process.env.BROWSERLESS_API_KEY.trim();
      const country = process.env.BROWSERLESS_PROXY_COUNTRY || 'in';
      const proxyParam = process.env.BROWSERLESS_PROXY
        ? `&proxy=${process.env.BROWSERLESS_PROXY}`
        : `&proxy=residential&proxyCountry=${country}`;
      return `wss://chrome.browserless.io/stealth?token=${token}${proxyParam}&--disable-http2`;
    }
    return null;
  }

  get isEnabled(): boolean {
    return Boolean(this.browserWsEndpoint);
  }

  /**
   * Executes a task inside a remote Browserless browser session with Indian residential IP.
   */
  async executeInBrowser<T>(
    evaluator: (page: Page) => Promise<T>,
    timeoutMs = BROWSER_TIMEOUT_MS,
  ): Promise<T> {
    const wss = this.browserWsEndpoint;
    if (!wss) throw new Error('Browserless endpoint not configured');

    const t0 = Date.now();
    const browser = await puppeteer.connect({ browserWSEndpoint: wss });
    try {
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      await page.goto(ONLINE_CHARTS_URL, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      // Let Akamai sensor JS settle
      await new Promise((r) => setTimeout(r, SENSOR_SETTLE_MS));

      const result = await evaluator(page);
      this.logger.log(`[browserless] execution_success ms=${Date.now() - t0}`);
      return result;
    } catch (err) {
      const ms = Date.now() - t0;
      this.logger.error(
        `[browserless] execution_failed ms=${ms}: ${err instanceof Error ? err.message : String(err)}`,
      );
      captureSentryException(err, {
        tags: { service: 'browserless' },
        extra: { ms },
      });
      throw err;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /** Fetch official IRCTC schedule inquiry via Browserless */
  async fetchSchedule(trainNumber: string): Promise<{ status: number; data: any }> {
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
