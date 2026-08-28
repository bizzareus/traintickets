---
name: irctc-keeper-railway-status
description: Status/gotchas for the IRCTC session-cookie keeper (backend/src/irctc/irctc-session-keeper.service.ts) running on Railway via browser-use cloud.
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c2355a7-56c9-427a-ae44-6ea3e0905eb3
---

The IRCTC cookie keeper (harvests Akamai-protected IRCTC cookies via a
browser-use cloud browser on an India proxy + raw CDP, see
`backend/src/irctc/irctc-session-keeper.service.ts` and `cdp-client.ts`) is
deployed and enabled (`IRCTC_KEEPER_ENABLED=true`) on Railway, project
[[railway-project]].

**Found and fixed 2026-06-30**: `BROWSER_USE_BASE_URL` was set to
`https://api.browseruse.com` (no hyphen) — that domain doesn't even accept a
connection (curl returns `000` instantly). The real API host, verified live
against IRCTC multiple times, is `https://api.browser-use.com` (hyphenated).
User corrected the Railway var and redeployed.

**Why:** the keeper's own default already falls back to the hyphenated host,
but an explicit env var always wins, so the wrong leftover value (likely
copied from `IrctcBrowserUseService`'s old SDK-default fallback, which used
the non-hyphenated domain) silently broke every `fetch()` call to browser-use
with Node's generic `TypeError: fetch failed`.

**How to apply:** if `[irctc-keeper] refresh failed trigger=...: fetch failed`
reappears, check `BROWSER_USE_BASE_URL` first (presence + value, not full
`list_variables` — see [[railway-project]] for the safe-check pattern).

**Found and fixed 2026-06-30, second issue**: after the var fix, two
cron-triggered refreshes at 23:00:00 UTC never logged a result at all (no
"refresh ok"/"refresh failed") even a minute later — a real hang, not a fast
failure. Root cause: `cdp-client.ts`'s WebSocket connect and per-command
`send()` had no timeouts, so a stalled remote browser-use session could hang
the keeper forever; since `refreshing` only resets in `refresh()`'s
`finally`, one stuck call wedges every subsequent cron tick until the
process restarts. Fixed in commit e688aad: 15s timeout on CDP connect, 20s
default per CDP command, `AbortSignal.timeout()` on the three raw
create/verify/stop fetches in `refresh()`, and the catch block now surfaces
`err.cause` (Node's fetch wraps the real DNS/connection reason in a generic
`TypeError: fetch failed`, which was being silently dropped). Re-verified
end-to-end against live IRCTC after the fix (~9s, 200 with real data).

Also noticed: boot + cron triggers fired twice ~10s apart in the logs,
suggesting the backend may run >1 replica. Each replica runs its own
independent keeper writing to its OWN local `irctc-cookies.json` (not
shared), so on a multi-replica setup some instances' `IrctcService` may read
a stale/empty cookie file even when another replica's keeper succeeded. Not
yet confirmed via `service_metrics`/`get_service_config`, and not yet fixed
— if it matters, the cookie store needs to move off local disk (DB row /
Redis) or `IRCTC_COOKIE_FILE` needs to point at a shared volume.

**BIG finding 2026-07-01 — the real blocker is Railway's IP, not cookies.**
After the timeout fix deployed and the keeper was enabled, it now fails fast
and informatively: `refresh failed: verify fetch returned 403`. The keeper
harvests cookies fine from browser-use's India IP, but its verify step (a
plain fetch from RAILWAY's datacenter IP to IRCTC trnscheduleenquiry with
those fresh cookies) gets **403**. From a dev machine the same harvested
cookies returned 200 (the spikes). So Akamai is **IP-binding the session** —
the `_abck`/bm_* bundle minted on browser-use's residential India IP is
rejected when replayed from Railway's US datacenter IP. This matches the
older `NGHTTP2_INTERNAL_ERROR` resets the backend's own trainComposition
calls were getting with the manually-pasted cookies.

**Implication:** the cookie keeper (and the new manual paste-in admin page)
are necessary but **NOT sufficient** — a cookie pasted from any browser will
likely also 403 once replayed from Railway's IP. The real fix is to make the
backend's outbound IRCTC requests EXIT from a residential India IP, one of:
  1. Route the IRCTC calls in `irctc.service.ts` (got-scraping + fetch) through
     an India residential proxy (BrightData/Oxylabs/etc.) — most robust.
  2. Make the actual trainComposition/vacantBerth/schedule requests *inside*
     the browser-use browser via CDP fetch (residential IP), not just harvest
     cookies — heavier/slower but no separate proxy vendor.
To 100%-confirm IP-binding before investing: add a verify-through-the-cloud-
browser step to the spike (request via browser-use context → expect 200;
plain Railway fetch → 403).

**Shipped 2026-07-01**: admin panel at `/admin/irctc-cookies` (frontend
`app/admin/irctc-cookies/page.tsx`) — shows keeper status (enabled, last
refresh, last error, cookie presence/length/source/age), a "refresh now"
button, and a manual cookie paste-in box. Backend:
`POST /api/admin/irctc-keeper/cookie` → `setCookieManually()` (commit 0518cbb),
behind JwtAuthGuard.

**Update 2026-07-01 — switched keeper to BrightData Scraping Browser.** The
keeper now harvests via BrightData (env `BRIGHTDATA_BROWSER_WSS` =
`wss://…@brd.superproxy.io:9222`, puppeteer.connect), not browser-use. Flow:
connect → load online-charts → in-browser same-origin fetch verify (must be
200) → CDP `Network.getAllCookies` → store cookie string (source
`brightdata`). Gate: `IRCTC_KEEPER_ENABLED=true` + `BRIGHTDATA_BROWSER_WSS`.
Verified end-to-end against live IRCTC (200, ~4KB cookie, ~11s). Commit
8f748a5. BrightData port cheat-sheet: 9222=CDP, 9515=WebDriver, 22225=proxy
zones (Web Unlocker/Residential). The user only has a Scraping Browser zone
(`scraping_browser1`), no Web Unlocker/proxy zone. Admin UI at
`/admin/irctc-cookies` (gated by x-admin-password header now, not JWT — user
refactored the keeper endpoints into `IrctcKeeperController`) shows status +
manual paste-in + refresh.

**STILL OPEN — the cookie is stored but Railway still can't USE it.** The
stored cookie is IP-bound to BrightData's residential IP; Railway's datacenter
IP replaying it still 403s. To make the backend actually reach IRCTC in prod,
its live calls (`irctc.service.ts` schedule/trainComposition/vacantBerth) must
also exit via a residential IP. Cleanest options: (1) route those calls
through the BrightData Scraping Browser via CDP (works, but cookie-replay is
fragile since each BD session may get a different IP — better to just make the
call inside the BD browser per request and not rely on the stored cookie at
all), or (2) a BrightData Web Unlocker/Residential **proxy** zone (:22225) the
backend's got-scraping routes through — user hasn't created one yet. The
stored-cookie deliverable is done; the backend-consumption path is the next
decision.

**RESOLVED 2026-07-01 — end-to-end works + multi-replica fixed.** User
confirmed harvesting the cookie via BrightData AND the backend using that
cookie both work in prod (so the earlier "Railway can't USE it" IP-binding
worry no longer blocks — treat the two OPEN sections above as historical).

The last remaining issue — 2 replicas each double-harvesting to a private
local file — is fixed (commit 7efa7268): the cookie now lives in a single
Postgres row via Prisma model `IrctcSession` (`@@map("irctc_session")`,
migration `20260701013000_add_irctc_session`, auto-applied by Railway's
`prisma migrate deploy` preDeployCommand). `IrctcCookieStoreService` is
DB-backed (`getCookie`/`getRecord`/`setCookie` async, 15s in-process read
cache, env `IRCTC_COOKIES` fallback if the row is empty or the table is
missing). All replicas read the SAME cookie; manual paste-in/reveal apply
everywhere. Before any automatic (boot/cron) harvest the keeper calls
`tryClaimHarvest(HARVEST_CLAIM_WINDOW_MS=20min)` — an atomic conditional
UPDATE on `harvest_locked_at`; exactly one replica wins and harvests, the
rest log `skip … another replica harvested within the window`. Manual
`refresh('manual')` bypasses the lock. Verified in deploy logs: one
`refresh ok trigger=boot cookieChars=3881`, others skipped. `location()` now
returns `postgres:irctc_session`.

FOLLOW-UP: `IRCTC_KEEPER_LOG_COOKIE=true` is still on and dumps the FULL
cookie bundle into Railway logs on every harvest — fine for debugging, but it
leaks the secret into log storage. Now that it's verified working, recommend
setting it back to `false` (or unset). Also `IRCTC_LOG_COOKIE=true` was set on
the backend service 2026-07-01 — it un-redacts the Cookie header in the
`[irctc/*] curl:` logs (`backend/src/common/curl-log.ts`); turn OFF when done.

**MAJOR REVISION 2026-07-01 — intermittent failures are flaky HTTP/2, NOT a
hard IP block.** After "end-to-end works", the user hit intermittent 503s: the
SAME coach-composition request to the Railway backend returned 503 then 201 on
immediate retry (DevTools: one h2 xhr 503 @12.56s, one 201 @831ms). A hard
datacenter-IP block would fail EVERY time, so the earlier IP-binding theory is
NOT the live blocker. Intermittent success + `NGHTTP2_INTERNAL_ERROR` = a
poisoned reused HTTP/2 keep-alive connection (Akamai resets one stream; every
request pinned to that connection fails; a fresh connection succeeds). It went
unhandled because `vacantBerth`/`coachComposition` had ZERO retries and
got-scraping's `retry:{limit:2}` on `trainComposition` was a no-op (**got does
not retry POST by default** — non-idempotent methods are excluded).

**Fix shipped (commit e73285ae):** `retryTransient()` + `isTransientNetworkError()`
in `backend/src/common/fetch-with-timeout.ts`; all three online-charts POSTs now
retry up to 3× on transient connection errors (nghttp2/econnreset/abort/etc.)
with linear backoff. undici/got evict the bad connection on error, so the retry
lands on a fresh one. Retries fire only on failure → no happy-path latency.
Verify in Railway logs: `[irctc/*] transient retry attempt=N` followed by a 200.

If it STILL fails 3× in a row consistently (not intermittently), THEN it's a
real IP problem → residential-proxy path: route only IRCTC-origin calls through
a BrightData **residential zone** (`:22225`) with **sticky sessions** (harvest +
API share one exit IP so the IP-bound cookie matches), reusing the stored
cookie. ~1-2s added on cache misses (residential) vs ~3-8s (Web Unlocker);
caching + latency-insensitive alert cron absorb most of it. User only has a
Scraping Browser zone today — would need to add a residential zone.

**UPDATE 2026-08-28 — Replaced BrightData with Browserless.**
The keeper was migrated to Browserless (`BROWSERLESS_API_KEY` or `BROWSERLESS_WSS` = `wss://chrome.browserless.io/stealth?token=...&proxy=residential&proxyCountry=in&--disable-http2`).
- Fixed `net::ERR_HTTP2_PROTOCOL_ERROR` by routing to Browserless's managed `/stealth` endpoint with `--disable-http2` for clean HTTP/1.1 communication over Indian residential proxies.
- Harvests 13 Akamai session cookies (`_abck`, `bm_sz`, `bm_s`, etc.) and stores them in PostgreSQL `irctc_session` table.
- All backend IRCTC REST calls on Railway use the stored cookies directly. All BrightData legacy code and environment fallbacks were completely removed.
