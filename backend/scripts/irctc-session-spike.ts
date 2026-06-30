/**
 * SPIKE: can we generate + reuse IRCTC (Akamai-protected) session cookies with Playwright?
 *
 * What it proves (or disproves):
 *   1. A real Chromium (Playwright) that loads online-charts gets Akamai to set a
 *      *valid* _abck + bm_* bundle plus the PIM-SESSION-ID / et_appVIP session cookies.
 *   2. Those harvested cookies, reused in a PLAIN server-side fetch (the way the
 *      NestJS backend uses IRCTC_COOKIES), are accepted (HTTP 200) by a protected
 *      endpoint — vs rejected (403/401) which would mean we must proxy through the
 *      browser context and/or route via an India residential IP.
 *
 * This is a throwaway probe. It does NOT wire anything into the app.
 *
 * Run (from backend/):
 *   npx playwright install chromium        # once
 *   SPIKE_HEADLESS=false npx ts-node scripts/irctc-session-spike.ts 12951
 *
 * Env:
 *   SPIKE_HEADLESS=false   run headful (best Akamai pass-rate; needs a display/xvfb)
 *   SPIKE_TRAIN=12951      train number to probe the schedule endpoint with
 *   SPIKE_KEEPALIVE=true   after the first probe, loop every 2 min to test session hold
 *   HTTPS_PROXY=...        route the browser + fetch through a proxy (e.g. India residential)
 */
import { chromium, type BrowserContext } from 'playwright';

const TRAIN = process.argv[2] || process.env.SPIKE_TRAIN || '12951';
const HEADLESS = process.env.SPIKE_HEADLESS !== 'false';
const KEEPALIVE = process.env.SPIKE_KEEPALIVE === 'true';
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const SCHEDULE_URL = `https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry/${encodeURIComponent(
  TRAIN,
)}`;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const SCHEDULE_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  bmirak: 'webbm',
  dnt: '1',
  referer: 'https://www.irctc.co.in/online-charts/',
  'sec-ch-ua':
    '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': UA,
};

/** Akamai _abck is "valid" when its 4th `~`-segment is not -1 (sensor accepted). */
function abckLooksValid(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split('~');
  return parts.length >= 4 && parts[3] !== '-1';
}

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

async function harvest(context: BrowserContext) {
  const cookies = await context.cookies('https://www.irctc.co.in');
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const byName = Object.fromEntries(cookies.map((c) => [c.name, c]));
  const sessionScoped = cookies
    .filter((c) => c.expires === -1)
    .map((c) => c.name);
  return { cookies, cookieString, byName, sessionScoped };
}

async function main() {
  log(`spike start train=${TRAIN} headless=${HEADLESS} proxy=${PROXY ?? 'none'}`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    proxy: PROXY ? { server: PROXY } : undefined,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1366, height: 768 },
  });

  try {
    const page = await context.newPage();
    log('navigating to online-charts…');
    await page.goto(ONLINE_CHARTS_URL, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    // Give Akamai's sensor JS time to POST and flip _abck to a valid state.
    for (let i = 0; i < 10; i++) {
      const { byName } = await harvest(context);
      if (abckLooksValid(byName['_abck']?.value)) break;
      await page.waitForTimeout(1500);
    }

    const { cookies, cookieString, byName, sessionScoped } = await harvest(
      context,
    );

    log('--- harvested cookies ---');
    log('count:', cookies.length);
    log('names:', cookies.map((c) => c.name).join(', '));
    log('session-scoped (die on close):', sessionScoped.join(', ') || '(none)');
    log('_abck valid?', abckLooksValid(byName['_abck']?.value));
    log('has PIM-SESSION-ID?', Boolean(byName['PIM-SESSION-ID']));
    log('has et_appVIP*?', cookies.some((c) => c.name.startsWith('et_appVIP')));
    log('cookieString length:', cookieString.length);

    // (A) Fetch the protected endpoint from INSIDE the browser context
    //     (cookies auto-attached, real browser TLS fingerprint).
    log('--- (A) request via browser context ---');
    const ctxResp = await context.request.get(SCHEDULE_URL, {
      headers: { ...SCHEDULE_HEADERS, greq: String(Date.now()) },
      failOnStatusCode: false,
    });
    log('(A) status:', ctxResp.status());
    log('(A) body head:', (await ctxResp.text()).slice(0, 160));

    // (B) Fetch with a PLAIN node fetch using only the harvested cookie string —
    //     this is the real question: can the backend reuse these cookies as-is?
    log('--- (B) plain node fetch with harvested cookie string ---');
    const plainResp = await fetch(SCHEDULE_URL, {
      headers: {
        ...SCHEDULE_HEADERS,
        greq: String(Date.now()),
        Cookie: cookieString,
      },
    });
    log('(B) status:', plainResp.status);
    log('(B) body head:', (await plainResp.text()).slice(0, 160));
    log(
      '>>> VERDICT:',
      plainResp.status === 200
        ? 'Plain fetch with harvested cookies WORKS — keeper model is viable.'
        : `Plain fetch returned ${plainResp.status} — likely IP/geo or TLS gating; try an India residential proxy, or proxy requests through the browser context.`,
    );

    if (KEEPALIVE) {
      log('--- keep-alive loop (every 2 min, Ctrl-C to stop) ---');
      for (let round = 1; ; round++) {
        await page.waitForTimeout(120_000);
        await page.goto(ONLINE_CHARTS_URL, { waitUntil: 'networkidle' });
        const fresh = await harvest(context);
        const r = await fetch(SCHEDULE_URL, {
          headers: {
            ...SCHEDULE_HEADERS,
            greq: String(Date.now()),
            Cookie: fresh.cookieString,
          },
        });
        log(
          `keepalive round=${round} _abckValid=${abckLooksValid(
            fresh.byName['_abck']?.value,
          )} status=${r.status}`,
        );
      }
    }
  } finally {
    if (!KEEPALIVE) {
      await context.close();
      await browser.close();
      log('spike done');
    }
  }
}

main().catch((e) => {
  console.error('spike error:', e);
  process.exit(1);
});
