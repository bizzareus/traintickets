/**
 * One-time (re-runnable) backfill for the train_composition_cache table.
 *
 * IRCTC's Akamai layer blocks datacenter IPs (Railway) but is fine from a
 * residential IP — so run THIS FROM YOUR LOCAL MACHINE. It reads every train in
 * the TrainList table, calls IRCTC's trainComposition API one-by-one for a
 * recent date (default: yesterday, since those charts are prepared), and upserts
 * the full JSON into train_composition_cache. The backend then serves that cache
 * for the coach-list loader when IRCTC is flaky (see
 * IrctcService.getTrainComposition, cacheByTrainNumber path).
 *
 * Usage (from backend/):
 *   # Cookie: paste your browser's IRCTC "Cookie:" header (Network tab ->
 *   # any online-charts request -> copy Cookie request header). Same machine =
 *   # same residential IP the cookie was minted on, so it won't 403.
 *   export IRCTC_COOKIES='TS...=...; bm_sz=...; _abck=...; ...'
 *   npx tsx scripts/backfill-train-composition-cache.ts
 *
 * Options (env or flags):
 *   --date=YYYY-MM-DD     journey date to query (default: yesterday)
 *   --limit=N             only process the first N trains (for a test run)
 *   --delay=MS            pause between trains (default 1500ms; be gentle)
 *   --only=12016,12951    comma-separated train numbers to restrict to
 *
 * DATABASE_URL is read from backend/.env (dotenv). This writes to whatever DB
 * that points at — normally production Supabase. Reads are read-only except the
 * train_composition_cache upserts.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5432/railchart';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const IRCTC_TRAIN_COMPOSITION_URL =
  'https://www.irctc.co.in/online-charts/api/trainComposition';
const IRCTC_SCHEDULE_URL =
  'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry';

const COMPOSITION_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  DNT: '1',
  Origin: 'https://www.irctc.co.in',
  Referer: 'https://www.irctc.co.in/online-charts/traincomposition',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'sec-ch-ua':
    '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};

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
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function yesterdayYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(err: unknown): boolean {
  const s = (err instanceof Error ? `${err.message} ${err.name}` : String(err))
    .concat(
      ' ',
      (err as { cause?: { message?: string; code?: string } })?.cause
        ?.message ?? '',
      ' ',
      String((err as { cause?: { code?: string } })?.cause?.code ?? ''),
    )
    .toLowerCase();
  return [
    'nghttp2',
    'econnreset',
    'etimedout',
    'socket hang up',
    'terminated',
    'fetch failed',
    'aborted',
  ].some((p) => s.includes(p));
}

async function fetchJson(
  url: string,
  init: RequestInit,
  attempts = 3,
  timeoutMs = 8000,
): Promise<{ status: number; text: string }> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      return { status: res.status, text };
    } catch (e) {
      lastErr = e;
      if (i < attempts && isTransient(e)) {
        await sleep(300 * i);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Resolve the source-station CODE for a train (needed as boardingStation). */
async function sourceStationCode(
  trainNo: string,
  cookie: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const cached = cache.get(trainNo);
  if (cached) return cached;
  // Live schedule lookup as a fallback when the schedule cache had no row.
  try {
    const { status, text } = await fetchJson(
      `${IRCTC_SCHEDULE_URL}/${encodeURIComponent(trainNo)}`,
      {
        method: 'GET',
        headers: { ...SCHEDULE_HEADERS, greq: String(Date.now()), Cookie: cookie },
      },
    );
    if (status < 200 || status >= 300) return null;
    const data = JSON.parse(text) as { stationFrom?: unknown };
    const code =
      typeof data.stationFrom === 'string' ? data.stationFrom.trim() : '';
    if (code) cache.set(trainNo, code.toUpperCase());
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

async function main() {
  const cookie = (
    process.env.IRCTC_COOKIES ??
    (await prisma.irctcSession.findUnique({ where: { id: 'singleton' } }))
      ?.cookie ??
    ''
  ).trim();
  if (!cookie || cookie.length < 20) {
    console.error(
      'No cookie. Set IRCTC_COOKIES to your browser Cookie header (recommended), or ensure the irctc_session row has one.',
    );
    process.exit(1);
  }

  const jDate = arg('date') ?? yesterdayYmd();
  const delayMs = Number.parseInt(arg('delay') ?? '1500', 10);
  const limit = arg('limit') ? Number.parseInt(arg('limit')!, 10) : undefined;
  const only = (arg('only') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let trains = await prisma.trainList.findMany({
    select: { trainNumber: true, label: true },
    orderBy: { trainNumber: 'asc' },
  });
  if (only.length) trains = trains.filter((t) => only.includes(t.trainNumber));
  if (limit) trains = trains.slice(0, limit);

  // Preload known source-station codes from the schedule cache (one query).
  const schedRows = await prisma.trainScheduleCache.findMany({
    select: { trainNumber: true, stationFrom: true },
  });
  const sourceCache = new Map<string, string>();
  for (const r of schedRows) {
    if (r.stationFrom) sourceCache.set(r.trainNumber, r.stationFrom.toUpperCase());
  }

  console.log(
    `Backfilling train_composition_cache for ${trains.length} trains | jDate=${jDate} | delay=${delayMs}ms`,
  );

  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < trains.length; i++) {
    const { trainNumber, label } = trains[i];
    const prefix = `[${i + 1}/${trains.length}] ${trainNumber}`;
    try {
      const boarding = await sourceStationCode(trainNumber, cookie, sourceCache);
      if (!boarding) {
        skipped++;
        console.log(`${prefix} SKIP no source-station code`);
        await sleep(delayMs);
        continue;
      }

      const { status, text } = await fetchJson(IRCTC_TRAIN_COMPOSITION_URL, {
        method: 'POST',
        headers: { ...COMPOSITION_HEADERS, Cookie: cookie },
        body: JSON.stringify({
          trainNo: trainNumber,
          jDate,
          boardingStation: boarding,
        }),
      });

      if (status < 200 || status >= 300) {
        failed++;
        console.log(`${prefix} FAIL http ${status} (${label})`);
        await sleep(delayMs);
        continue;
      }

      const data = JSON.parse(text) as {
        cdd?: unknown[];
        error?: string | null;
      };
      const cdd = Array.isArray(data.cdd) ? data.cdd : [];
      if (cdd.length === 0) {
        skipped++;
        const reason = data.error?.trim() || 'no coach data';
        console.log(`${prefix} SKIP ${reason} (${label})`);
        await sleep(delayMs);
        continue;
      }

      await prisma.trainCompositionCache.upsert({
        where: { trainNumber },
        update: { data: data as object },
        create: { trainNumber, data: data as object },
      });
      cached++;
      console.log(`${prefix} OK cached ${cdd.length} coaches from ${boarding}`);
    } catch (e) {
      failed++;
      console.log(
        `${prefix} FAIL ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await sleep(delayMs);
  }

  console.log(
    `\nDone. cached=${cached} skipped=${skipped} failed=${failed} total=${trains.length}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
