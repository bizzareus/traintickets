import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import puppeteer from 'puppeteer';
import { captureSentryException } from '../common/sentry-report';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const HARVEST_HARD_TIMEOUT_MS = 150_000;
/** After DOMContentLoaded, how long to let Akamai's sensor JS settle cookies. */
const COOKIE_SETTLE_MS = 6_000;

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
 * so the cookies can't be harvested from Railway directly. BrightData loads the
 * page from a residential IP and Akamai issues the bundle there. This is a bare
 * harvest: load the page, let the sensor settle, read the cookies, store them.
 *
 * Gated by IRCTC_KEEPER_ENABLED=true and BRIGHTDATA_BROWSER_WSS. Tunables:
 *   IRCTC_KEEPER_CRON          cron expression (default every 30 min)
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

    try {
      this.logger.log(`[irctc-keeper] refresh trigger=${trigger} via=brightdata`);

      const cookieString = await withTimeout(
        this.harvestViaBrightData(),
        HARVEST_HARD_TIMEOUT_MS,
        'brightdata harvest',
      );
      if (!cookieString) throw new Error('no cookies harvested');

      this.cookieStore.setCookie(cookieString, { source: 'brightdata' });
      this.lastRefreshAt = new Date().toISOString();
      this.lastError = null;
      this.logger.log(
        `[irctc-keeper] refresh ok trigger=${trigger} cookieChars=${cookieString.length}`,
      );
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
   * issues cookies, and return the harvested irctc.co.in cookie string. Bare
   * harvest — no requests to any IRCTC API.
   */
  private async harvestViaBrightData(): Promise<string> {
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
      await new Promise((r) => setTimeout(r, COOKIE_SETTLE_MS));

      // Read the full cookie bundle for irctc.co.in via CDP.
      const client = await page.target().createCDPSession();
      const { cookies } = (await client.send('Network.getAllCookies')) as {
        cookies: { name: string; value: string; domain: string }[];
      };
      return cookies
        .filter((c) => c.domain.includes('irctc.co.in'))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    } finally {
      // close() ends the BrightData session (stops billing); ignore errors.
      await browser.close().catch(() => {});
    }
  }
}
