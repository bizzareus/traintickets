import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import puppeteer from 'puppeteer';
import { captureSentryException } from '../common/sentry-report';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const SCHEDULE_URL =
  'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry';
const HARVEST_HARD_TIMEOUT_MS = 150_000;

/**
 * Node's fetch throws a generic `TypeError: fetch failed` for DNS/connection
 * errors and stashes the real reason in `.cause` — surface it so a failure is
 * diagnosable straight from logs without redeploying just to add detail.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeMsg =
      cause instanceof Error ? cause.message : cause != null ? String(cause) : null;
    return causeMsg ? `${err.message} (cause: ${causeMsg})` : err.message;
  }
  return String(err);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Keeps the IRCTC (Akamai-protected) cookie bundle fresh by driving a BrightData
 * Scraping Browser (a remote Chromium on a residential IP), loading online-charts
 * so Akamai issues cookies, and writing the harvested cookie string to the
 * file-backed cookie store the rest of the backend reads.
 *
 * Why a remote browser: Akamai resets/403s requests from Railway's datacenter IP,
 * so cookies can't be harvested (or used) from Railway directly. BrightData loads
 * the page from a residential IP. The cookie is verified with a same-origin fetch
 * issued INSIDE that browser (residential IP) before it's persisted — that's the
 * source of truth for "is the cookie valid", independent of whether this host can
 * replay it.
 *
 * Gated by IRCTC_KEEPER_ENABLED=true and BRIGHTDATA_BROWSER_WSS. Tunables:
 *   IRCTC_KEEPER_CRON          cron expression (default every 30 min)
 *   IRCTC_KEEPER_TEST_TRAIN    train number used to verify cookies (default 12951)
 *   BRIGHTDATA_BROWSER_WSS     wss://…@brd.superproxy.io:9222 CDP endpoint
 */
@Injectable()
export class IrctcSessionKeeperService implements OnModuleInit {
  private readonly logger = new Logger(IrctcSessionKeeperService.name);
  private refreshing = false;
  private lastRefreshAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly cookieStore: IrctcCookieStoreService) {}

  private get enabled(): boolean {
    return (
      process.env.IRCTC_KEEPER_ENABLED === 'true' &&
      Boolean(process.env.BRIGHTDATA_BROWSER_WSS?.trim())
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        '[irctc-keeper] disabled (set IRCTC_KEEPER_ENABLED=true + BRIGHTDATA_BROWSER_WSS to enable)',
      );
      return;
    }
    // Warm the cookie file shortly after boot without blocking startup.
    setTimeout(() => void this.refresh('boot'), 5_000);
  }

  @Cron(process.env.IRCTC_KEEPER_CRON ?? CronExpression.EVERY_30_MINUTES)
  async scheduledRefresh(): Promise<void> {
    if (!this.enabled) return;
    await this.refresh('cron');
  }

  status() {
    // Never return the raw cookie value, even behind auth — just its metadata.
    const record = this.cookieStore.getRecord();
    return {
      enabled: this.enabled,
      refreshing: this.refreshing,
      lastRefreshAt: this.lastRefreshAt,
      lastError: this.lastError,
      cookieFile: this.cookieStore.cookieFilePath,
      cookie: record
        ? {
            present: true,
            length: record.cookie.length,
            updatedAt: record.updatedAt,
            source: record.source,
            sessionId: record.sessionId,
          }
        : { present: false },
    };
  }

  /**
   * Manually overwrite the stored cookie bundle (admin paste-in). Use when the
   * automated harvest can't be used and you want to drop in a cookie string
   * captured from a working browser session yourself.
   */
  setCookieManually(cookie: string): { ok: boolean; error?: string; length?: number } {
    const trimmed = (cookie ?? '').trim();
    if (trimmed.length < 20 || !trimmed.includes('=')) {
      return { ok: false, error: 'cookie string looks empty or malformed' };
    }
    this.cookieStore.setCookie(trimmed, { source: 'manual' });
    this.lastRefreshAt = new Date().toISOString();
    this.lastError = null;
    this.logger.log(`[irctc-keeper] manual cookie set chars=${trimmed.length}`);
    return { ok: true, length: trimmed.length };
  }

  /** Harvest a fresh cookie bundle via BrightData and persist it. */
  async refresh(trigger: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.enabled) return { ok: false, error: 'keeper disabled' };
    if (this.refreshing) return { ok: false, error: 'refresh already running' };
    this.refreshing = true;
    const testTrain = process.env.IRCTC_KEEPER_TEST_TRAIN?.trim() || '12951';

    try {
      this.logger.log(`[irctc-keeper] refresh trigger=${trigger} via=brightdata`);

      const { cookieString, browserVerifyStatus } = await withTimeout(
        this.harvestViaBrightData(testTrain),
        HARVEST_HARD_TIMEOUT_MS,
        'brightdata harvest',
      );
      if (!cookieString) throw new Error('no cookies harvested');

      this.logger.log(
        `[irctc-keeper] verify browser_status=${browserVerifyStatus} cookieChars=${cookieString.length}`,
      );
      // Gate on the in-browser verify: 200 there means the cookie is valid.
      if (browserVerifyStatus !== 200) {
        throw new Error(`in-browser verify returned ${browserVerifyStatus}`);
      }

      this.cookieStore.setCookie(cookieString, { source: 'brightdata' });
      this.lastRefreshAt = new Date().toISOString();
      this.lastError = null;
      this.logger.log(`[irctc-keeper] refresh ok trigger=${trigger}`);
      return { ok: true };
    } catch (err) {
      const msg = describeError(err);
      this.lastError = msg;
      this.logger.error(`[irctc-keeper] refresh failed trigger=${trigger}: ${msg}`);
      captureSentryException(err, {
        tags: { service: 'irctc-keeper' },
        extra: { trigger },
      });
      return { ok: false, error: msg };
    } finally {
      this.refreshing = false;
    }
  }

  /**
   * Connect to the BrightData Scraping Browser, load online-charts so Akamai
   * issues cookies, verify them with a same-origin fetch from inside that page
   * (residential IP), and return the harvested cookie string + verify status.
   */
  private async harvestViaBrightData(
    testTrain: string,
  ): Promise<{ cookieString: string; browserVerifyStatus: number | string }> {
    const wss = process.env.BRIGHTDATA_BROWSER_WSS!.trim();
    const browser = await withTimeout(
      puppeteer.connect({ browserWSEndpoint: wss }),
      30_000,
      'brightdata connect',
    );
    try {
      const page = await browser.newPage();
      await page.goto(ONLINE_CHARTS_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      // Let Akamai's sensor JS settle the cookie bundle.
      await new Promise((r) => setTimeout(r, 6_000));

      const scheduleUrl = `${SCHEDULE_URL}/${encodeURIComponent(testTrain)}`;
      const browserVerifyStatus: number | string = await page.evaluate(
        async (url: string) => {
          try {
            const res = await fetch(url, {
              headers: {
                accept: 'application/json, text/plain, */*',
                bmirak: 'webbm',
                greq: String(Date.now()),
              },
              credentials: 'include',
            });
            return res.status;
          } catch (e) {
            return `err:${e instanceof Error ? e.message : String(e)}`;
          }
        },
        scheduleUrl,
      );

      // Harvest the full cookie bundle for irctc.co.in via CDP.
      const client = await page.target().createCDPSession();
      const { cookies } = (await client.send('Network.getAllCookies')) as {
        cookies: { name: string; value: string; domain: string }[];
      };
      const cookieString = cookies
        .filter((c) => c.domain.includes('irctc.co.in'))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');

      return { cookieString, browserVerifyStatus };
    } finally {
      // close() ends the BrightData session (stops billing); ignore errors.
      await browser.close().catch(() => {});
    }
  }
}
