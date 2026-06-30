/**
 * SPIKE 3: same as spike 2 (browser-use cloud, India proxy) but with ZERO
 * Playwright — drives the remote browser with raw CDP over a plain WebSocket
 * (see ../src/irctc/cdp-client.ts) and hits the browser-use REST API directly.
 *
 * Run (from backend/):
 *   BROWSER_USE_API_KEY=... npx ts-node scripts/irctc-session-spike-rawcdp.ts 12951
 */
import { CdpClient, cookiesToHeaderString, type CdpCookie } from '../src/irctc/cdp-client';

const TRAIN = process.argv[2] || process.env.SPIKE_TRAIN || '12951';
const PROXY_CC = process.env.SPIKE_PROXY_CC || 'in';
const BU_BASE = process.env.BROWSER_USE_BASE_URL || 'https://api.browser-use.com';

const ONLINE_CHARTS_URL = 'https://www.irctc.co.in/online-charts/';
const SCHEDULE_URL = `https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry/${encodeURIComponent(TRAIN)}`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const SCHEDULE_HEADERS: Record<string, string> = {
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

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}
function abckLooksValid(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split('~');
  return parts.length >= 4 && parts[3] !== '-1';
}

async function main() {
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) throw new Error('Set BROWSER_USE_API_KEY');

  log(`creating browser-use session proxyCC=${PROXY_CC}…`);
  const createResp = await fetch(`${BU_BASE}/api/v3/browsers`, {
    method: 'POST',
    headers: { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxyCountryCode: PROXY_CC, timeout: 5 }),
  });
  if (!createResp.ok) throw new Error(`create ${createResp.status}: ${await createResp.text()}`);
  const session = (await createResp.json()) as { id: string; cdpUrl?: string };
  log('session id:', session.id, 'cdpUrl:', session.cdpUrl ?? '(none)');
  if (!session.cdpUrl) throw new Error('no cdpUrl');

  let targetId: string | undefined;
  const cdp = await CdpClient.connect(session.cdpUrl);
  try {
    log('CDP connected. creating target…');
    const target = await cdp.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
    });
    targetId = target.targetId;
    const attach = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const sessionId = attach.sessionId;
    log('target:', targetId, 'session:', sessionId);

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: ONLINE_CHARTS_URL }, sessionId);
    try {
      await cdp.waitForEvent('Page.loadEventFired', sessionId, 30_000);
      log('Page.loadEventFired received');
    } catch {
      log('Page.loadEventFired timed out, continuing anyway');
    }

    let cookies: CdpCookie[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await cdp.send<{ cookies: CdpCookie[] }>('Network.getAllCookies', {}, sessionId);
      cookies = r.cookies.filter((c) => c.domain.includes('irctc.co.in'));
      if (cookies.some((c) => c.name === '_abck')) break;
      await new Promise((res) => setTimeout(res, 1500));
    }

    const byName = Object.fromEntries(cookies.map((c) => [c.name, c]));
    const cookieString = cookiesToHeaderString(cookies);
    log('--- harvested cookies (raw CDP) ---');
    log('count:', cookies.length, 'names:', cookies.map((c) => c.name).join(', '));
    log('_abck valid?', abckLooksValid(byName['_abck']?.value));
    log('has PIM-SESSION-ID?', Boolean(byName['PIM-SESSION-ID']));
    log('cookieString length:', cookieString.length);

    log('--- plain fetch (this IP) with harvested cookies ---');
    const plain = await fetch(SCHEDULE_URL, {
      headers: { ...SCHEDULE_HEADERS, greq: String(Date.now()), Cookie: cookieString },
    });
    log('status:', plain.status, 'body:', (await plain.text()).slice(0, 160));
    log(
      '>>> VERDICT:',
      plain.status === 200
        ? 'Raw CDP harvest works end-to-end, no Playwright needed.'
        : `status ${plain.status} — raw CDP path needs more work (compare against the Playwright spike result).`,
    );
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    cdp.close();
    log('stopping browser-use session…');
    await fetch(`${BU_BASE}/api/v3/browsers/${session.id}`, {
      method: 'PATCH',
      headers: { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    }).catch(() => {});
    log('spike done');
  }
}

main().catch((e) => {
  console.error('spike error:', e);
  process.exit(1);
});
