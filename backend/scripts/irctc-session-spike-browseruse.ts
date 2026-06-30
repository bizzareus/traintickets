/**
 * SPIKE 2: harvest IRCTC (Akamai-protected) cookies via a browser-use CLOUD browser
 * running on an India residential IP, then test whether those cookies are reusable.
 *
 * Why: SPIKE 1 (local headless Playwright) showed Akamai resets the HTTP/2 stream for
 * a datacenter IP + headless browser before the page even loads. browser-use runs a
 * real cloud browser behind a residential proxy (proxyCountryCode: 'in'), so Akamai
 * should serve the page. We connect to that remote browser over CDP, harvest cookies,
 * and answer the decisive question:
 *
 *   (A) Does a request made *through the browser-use browser* succeed?  (always our fallback)
 *   (B) Does a PLAIN node fetch from THIS machine, reusing only the harvested cookie
 *       string, succeed?  -> if 200, the keeper can hand cookies to the Railway backend.
 *       if 403, Akamai is IP-bound and we must route API calls through the same browser/proxy.
 *
 * Throwaway probe. Nothing is wired into the app.
 *
 * Run (from backend/):
 *   BROWSER_USE_API_KEY=...  npx ts-node scripts/irctc-session-spike-browseruse.ts 12951
 * Optional env:
 *   BROWSER_USE_PROFILE_ID=<uuid>   reuse a persistent profile (resumes warmed state)
 *   SPIKE_PROXY_CC=in               proxy country (default in)
 */
import { chromium, type BrowserContext } from 'playwright';

// The installed browser-use SDK build exposes only the agent API (no raw
// `browsers`/cdpUrl), so we call the documented v3 REST endpoint directly.
const BU_BASE = process.env.BROWSER_USE_BASE_URL || 'https://api.browser-use.com';
async function createBrowser(apiKey: string, body: unknown) {
  const r = await fetch(`${BU_BASE}/api/v3/browsers`, {
    method: 'POST',
    headers: { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`create browser ${r.status}: ${await r.text()}`);
  return (await r.json()) as { id: string; cdpUrl?: string; liveUrl?: string; status: string };
}
async function stopBrowser(apiKey: string, id: string) {
  await fetch(`${BU_BASE}/api/v3/browsers/${id}`, {
    method: 'PATCH',
    headers: { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' }),
  }).catch(() => {});
}

const TRAIN = process.argv[2] || process.env.SPIKE_TRAIN || '12951';
const PROXY_CC = (process.env.SPIKE_PROXY_CC || 'in') as 'in';
const PROFILE_ID = process.env.BROWSER_USE_PROFILE_ID || undefined;

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

function abckLooksValid(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split('~');
  return parts.length >= 4 && parts[3] !== '-1';
}
function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}
async function harvest(context: BrowserContext) {
  const cookies = await context.cookies('https://www.irctc.co.in');
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const byName = Object.fromEntries(cookies.map((c) => [c.name, c]));
  return { cookies, cookieString, byName };
}

async function main() {
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) throw new Error('Set BROWSER_USE_API_KEY');

  log(`creating browser-use session proxyCC=${PROXY_CC} profile=${PROFILE_ID ?? 'none'}…`);
  const created = await createBrowser(apiKey, {
    proxyCountryCode: PROXY_CC,
    profileId: PROFILE_ID,
    timeout: 15,
  });
  const sessionId = created.id;
  log('session id:', sessionId, 'status:', created.status, 'liveUrl:', created.liveUrl ?? '(none)');
  const cdpUrl = created.cdpUrl;
  if (!cdpUrl) throw new Error('no cdpUrl on create response');
  log('cdpUrl acquired');

  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    log('navigating to online-charts via cloud browser…');
    const resp = await page.goto(ONLINE_CHARTS_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    log('page status:', resp?.status());

    for (let i = 0; i < 12; i++) {
      const { byName } = await harvest(context);
      if (abckLooksValid(byName['_abck']?.value)) break;
      await page.waitForTimeout(1500);
    }

    const { cookies, cookieString, byName } = await harvest(context);
    log('--- harvested cookies ---');
    log('count:', cookies.length, 'names:', cookies.map((c) => c.name).join(', '));
    log('_abck valid?', abckLooksValid(byName['_abck']?.value));
    log('has PIM-SESSION-ID?', Boolean(byName['PIM-SESSION-ID']));
    log('cookieString length:', cookieString.length);

    // (A) request from inside the cloud browser (residential IP + warmed session)
    log('--- (A) request via cloud browser context ---');
    const ctxResp = await context.request.get(SCHEDULE_URL, {
      headers: { ...SCHEDULE_HEADERS, greq: String(Date.now()) },
      failOnStatusCode: false,
    });
    log('(A) status:', ctxResp.status(), 'body:', (await ctxResp.text()).slice(0, 140));

    // (B) plain fetch from THIS machine reusing only the harvested cookie string
    log('--- (B) plain fetch (this IP) with harvested cookies ---');
    const plain = await fetch(SCHEDULE_URL, {
      headers: { ...SCHEDULE_HEADERS, greq: String(Date.now()), Cookie: cookieString },
    });
    log('(B) status:', plain.status, 'body:', (await plain.text()).slice(0, 140));

    log(
      '>>> VERDICT:',
      ctxResp.status() === 200 && plain.status === 200
        ? 'Both work — cookies are portable; keeper can hand the string to Railway.'
        : ctxResp.status() === 200
          ? 'Only (A) works — Akamai is IP-bound; route API calls THROUGH the cloud browser/proxy, do not lift the cookie to Railway.'
          : `Even (A) failed (status ${ctxResp.status()}) — investigate page load / Akamai on the cloud browser.`,
    );
  } finally {
    await browser.close().catch(() => {});
    log('stopping browser-use session…');
    await stopBrowser(apiKey, sessionId);
    log('spike done');
  }
}

main().catch((e) => {
  console.error('spike error:', e);
  process.exit(1);
});
