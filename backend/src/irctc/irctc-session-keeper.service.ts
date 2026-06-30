import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { chromium } from 'playwright';
import { captureSentryException } from '../common/sentry-report';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const SCHEDULE_URL =
  'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const VERIFY_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  bmirak: 'webbm',
  dnt: '1',
  referer: 'https://www.irctc.co.in/online-charts/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': UA,
};

/**
 * Keeps the IRCTC (Akamai-protected) cookie bundle fresh by driving a remote
 * browser-use cloud browser on an India residential IP, harvesting the cookies
 * over CDP, and writing them to the file-backed cookie store the rest of the
 * backend reads.
 *
 * Why a remote browser: Akamai resets the HTTP/2 stream for datacenter IPs and
 * headless browsers, so we can't harvest cookies from Railway directly. The
 * cloud browser loads the page from a residential IP; the harvested cookies are
 * then usable from Railway in a plain fetch (verified in the spike).
 *
 * No local Chromium is needed — connectOverCDP only uses the playwright client
 * library to talk to the remote browser, so this runs fine inside Railway.
 *
 * Gated by IRCTC_KEEPER_ENABLED=true and BROWSER_USE_API_KEY. Tunables:
 *   IRCTC_KEEPER_CRON          cron expression (default every 30 min)
 *   IRCTC_KEEPER_PROXY_CC      proxy country (default 'in')
 *   IRCTC_KEEPER_TEST_TRAIN    train number used to verify cookies (default 12951)
 *   BROWSER_USE_BASE_URL       default https://api.browser-use.com
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
      Boolean(process.env.BROWSER_USE_API_KEY?.trim())
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        '[irctc-keeper] disabled (set IRCTC_KEEPER_ENABLED=true + BROWSER_USE_API_KEY to enable)',
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
    return {
      enabled: this.enabled,
      refreshing: this.refreshing,
      lastRefreshAt: this.lastRefreshAt,
      lastError: this.lastError,
      record: this.cookieStore.getRecord(),
      cookieFile: this.cookieStore.cookieFilePath,
    };
  }

  /** Harvest a fresh cookie bundle and persist it. Safe to call on demand. */
  async refresh(trigger: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.enabled) return { ok: false, error: 'keeper disabled' };
    if (this.refreshing) return { ok: false, error: 'refresh already running' };
    this.refreshing = true;
    const apiKey = process.env.BROWSER_USE_API_KEY!.trim();
    const baseUrl =
      process.env.BROWSER_USE_BASE_URL?.trim() || 'https://api.browser-use.com';
    const proxyCc = process.env.IRCTC_KEEPER_PROXY_CC?.trim() || 'in';
    const testTrain = process.env.IRCTC_KEEPER_TEST_TRAIN?.trim() || '12951';
    let sessionId: string | null = null;

    try {
      this.logger.log(`[irctc-keeper] refresh trigger=${trigger} proxy=${proxyCc}`);

      // 1. Create a remote browser session (India residential IP).
      const createResp = await fetch(`${baseUrl}/api/v3/browsers`, {
        method: 'POST',
        headers: {
          'X-Browser-Use-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ proxyCountryCode: proxyCc, timeout: 5 }),
      });
      if (!createResp.ok) {
        throw new Error(
          `browser create ${createResp.status}: ${(await createResp.text()).slice(0, 200)}`,
        );
      }
      const session = (await createResp.json()) as {
        id: string;
        cdpUrl?: string;
      };
      sessionId = session.id;
      if (!session.cdpUrl) throw new Error('no cdpUrl on create response');

      // 2. Drive it over CDP and harvest cookies.
      const browser = await chromium.connectOverCDP(session.cdpUrl);
      let cookieString = '';
      try {
        const context = browser.contexts()[0] ?? (await browser.newContext());
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(ONLINE_CHARTS_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        // Let Akamai's sensor JS settle the cookie bundle.
        for (let i = 0; i < 12; i++) {
          const cookies = await context.cookies('https://www.irctc.co.in');
          if (cookies.some((c) => c.name === '_abck')) break;
          await page.waitForTimeout(1500);
        }
        const cookies = await context.cookies('https://www.irctc.co.in');
        cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      } finally {
        await browser.close().catch(() => {});
      }

      if (!cookieString) throw new Error('no cookies harvested');

      // 3. Verify the harvested cookies actually work in a plain fetch (the way
      //    the backend uses them) before persisting — never overwrite good
      //    cookies with broken ones.
      const verify = await fetch(
        `${SCHEDULE_URL}/${encodeURIComponent(testTrain)}`,
        {
          headers: {
            ...VERIFY_HEADERS,
            greq: String(Date.now()),
            Cookie: cookieString,
          },
        },
      );
      if (verify.status !== 200) {
        throw new Error(`verify fetch returned ${verify.status}`);
      }

      this.cookieStore.setCookie(cookieString, {
        source: `browser-use:${proxyCc}`,
        sessionId: sessionId ?? undefined,
      });
      this.lastRefreshAt = new Date().toISOString();
      this.lastError = null;
      this.logger.log(
        `[irctc-keeper] refresh ok trigger=${trigger} cookieChars=${cookieString.length}`,
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.logger.error(`[irctc-keeper] refresh failed trigger=${trigger}: ${msg}`);
      captureSentryException(err, {
        tags: { service: 'irctc-keeper' },
        extra: { trigger },
      });
      return { ok: false, error: msg };
    } finally {
      // Best-effort stop of the remote session to stop billing promptly.
      if (sessionId) {
        await fetch(`${baseUrl}/api/v3/browsers/${sessionId}`, {
          method: 'PATCH',
          headers: {
            'X-Browser-Use-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'stop' }),
        }).catch(() => {});
      }
      this.refreshing = false;
    }
  }
}
