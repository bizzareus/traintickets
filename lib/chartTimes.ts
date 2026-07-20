import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
const reactCache =
  typeof cache === "function"
    ? cache
    : <T extends (...args: unknown[]) => unknown>(fn: T): T => fn;
import {
  buildChartTimesSlug,
  parseTrainNumberFromSlug,
  slugifyTrainName,
} from "@/lib/chartTimesSlug";
import { formatClock12h } from "@/lib/chartTimeDisplay";

/** True when running inside `next build` — the backend is not available. */
const isBuildPhase = process.env.IS_BUILD_PHASE === "1";

export { buildChartTimesSlug, parseTrainNumberFromSlug, slugifyTrainName };

/**
 * Chart-times pages: a per-train SEO page listing every scheduled station with
 * the time its reservation chart is prepared.
 *
 * Generation strategy ("generate once, then serve static"):
 *   1. On request we look for a committed JSON file under `content/chart-times/`.
 *   2. If present (and fresh), we render straight from it — fast, static, crawl-friendly.
 *   3. If absent, we build it from the fast DB-cache chart-time map + the train
 *      schedule, write the JSON to disk (best-effort), and render. The file is
 *      committed to git so `generateStaticParams` pre-renders it at build time.
 *
 * Chart times come from the DB-cache path only (`GET /api/chart-time/train/:id`).
 * Stations without a cached chart time render as "awaiting chart data" rather
 * than triggering slow per-station IRCTC composition calls.
 */

export const CHART_TIMES_DIR = path.join(process.cwd(), "content", "chart-times");

/** Regenerate a fully/partially populated page if it is older than this. */
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h
/** Regenerate a page that still has no chart data much sooner (charts publish near departure). */
const CACHE_MAX_AGE_INCOMPLETE_MS = 1000 * 60 * 15; // 15 min

export type ChartTimeStationRow = {
  stationCode: string;
  stationName: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
  day?: number | null;
  distance?: string | number | null;
  /** First-chart preparation time (HH:MM local), or null when not yet known. */
  chartTimeLocal: string | null;
  /** Calendar-day offset of the first chart from the train start date (0 = same day, 1 = next day). */
  chartOneDayOffset?: number | null;
  /** Second-chart preparation time (HH:MM local), if any. */
  chartTwoTimeLocal?: string | null;
  chartTwoDayOffset?: number | null;
  /** IRCTC remote charting station code (when the chart is prepared elsewhere). */
  chartRemoteStation?: string | null;
};

export type ChartTimesPageData = {
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
  slug: string;
  stations: ChartTimeStationRow[];
  /** Data-driven summary of the chart times in the table (persisted in the static page). */
  summary: string;
  /** ISO timestamp the JSON cache was generated. */
  generatedAt: string;
  /** How many stations have a known chart preparation time. */
  knownChartCount: number;
};

/** One/two-sentence factual summary of the chart times in the table; date-independent (stored in the JSON). */
function buildChartTimesSummary(args: {
  trainName: string;
  trainNumber: string;
  originStation: string;
  destinationStation: string;
  stations: ChartTimeStationRow[];
}): string {
  const { trainName, trainNumber, originStation, destinationStation, stations } = args;
  const route = `${originStation} to ${destinationStation}`;
  const total = stations.length;
  const withChart = stations.filter((s) => s.chartTimeLocal);

  if (withChart.length === 0) {
    return `Reservation chart preparation times for ${trainName} (${trainNumber}) from ${route} are not published yet — IRCTC prepares the vacancy chart closer to departure. Check back nearer the journey date to see the exact chart time for each of the ${total} stations.`;
  }

  const first = withChart[0];
  let s = `The first reservation chart for ${trainName} (${trainNumber}) is prepared at ${first.stationName} (${first.stationCode}) around ${formatClock12h(first.chartTimeLocal as string)}`;
  if (first.chartTwoTimeLocal) {
    s += `, with a second (vacancy) chart around ${formatClock12h(first.chartTwoTimeLocal)}`;
  }
  s += `. ${withChart.length} of ${total} stations on the ${route} route have published chart preparation times, listed station-by-station below`;
  if (withChart.length < total) {
    s += "; the remaining stations update closer to departure";
  }
  s += ".";
  return s;
}

type ScheduleStation = {
  stationCode: string;
  stationName: string;
  arrivalTime?: string;
  departureTime?: string;
  haltMinutes?: string;
  distance?: string | number;
  day?: number;
};

type TrainApiResponse = {
  trainNumber?: string;
  trainName?: string;
  originStation?: string;
  destinationStation?: string;
  schedule?: {
    trainName?: string;
    stationFrom?: string;
    stationTo?: string;
    stationList?: ScheduleStation[];
  } | null;
};

function apiBaseUrl(): string {
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3009"
  );
}

function filePathForTrain(trainNumber: string): string | null {
  if (!fs.existsSync(CHART_TIMES_DIR)) return null;
  const num = String(trainNumber).trim();
  const prefix = `${num}-`;
  try {
    const match = fs
      .readdirSync(CHART_TIMES_DIR)
      .find(
        (f) =>
          f.endsWith("-chart-times.json") &&
          (f.startsWith(prefix) || f === `${num}-chart-times.json`),
      );
    return match ? path.join(CHART_TIMES_DIR, match) : null;
  } catch {
    return null;
  }
}

function readCachedFile(trainNumber: string): ChartTimesPageData | null {
  const fp = filePathForTrain(trainNumber);
  if (!fp) return null;
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const data = JSON.parse(raw) as ChartTimesPageData;
    if (data && Array.isArray(data.stations) && data.trainNumber) return data;
    return null;
  } catch {
    return null;
  }
}

function writeCachedFile(data: ChartTimesPageData): void {
  try {
    if (!fs.existsSync(CHART_TIMES_DIR)) {
      fs.mkdirSync(CHART_TIMES_DIR, { recursive: true });
    }
    const fp = path.join(CHART_TIMES_DIR, `${data.slug}.json`);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
  } catch (err) {
    // Read-only filesystems (some hosts) just skip persistence; page still renders.
    console.warn(
      `[chart-times] could not persist cache for ${data.trainNumber}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

function isStale(data: ChartTimesPageData): boolean {
  const t = Date.parse(data.generatedAt || "");
  if (Number.isNaN(t)) return true;
  // IRCTC only publishes chart times close to departure, so a page generated
  // with no chart data yet should re-attempt soon rather than waiting a full day.
  const maxAge = data.knownChartCount > 0 ? CACHE_MAX_AGE_MS : CACHE_MAX_AGE_INCOMPLETE_MS;
  return Date.now() - t > maxAge;
}

async function fetchTrainData(trainNumber: string): Promise<TrainApiResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/trains/${trainNumber}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as TrainApiResponse;
  } catch (err) {
    console.warn(
      `[chart-times] train fetch failed for ${trainNumber}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Journey-date offsets (in days) to try when a train's chart isn't prepared for today. */
const DATE_FALLBACK_OFFSETS = [0, 1, -1];

/** YYYY-MM-DD for today + `days` (server-local). */
function ymdOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Max station-meta requests in flight while generating one page. */
const FETCH_CONCURRENCY = 8;
/** Per-station IRCTC composition fetch timeout. */
const STATION_FETCH_TIMEOUT_MS = 15_000;

type StationMeta = {
  chartTimeLocal: string | null;
  chartOneDayOffset: number | null;
  chartTwoTimeLocal: string | null;
  chartTwoDayOffset: number | null;
  chartRemoteStation: string | null;
};

/**
 * Chart meta for one train + station via the composition endpoint. The backend
 * reads its DB cache first and only calls IRCTC when the station's chart window
 * is missing/incomplete — and persists whatever it fetches. Returns null on error.
 */
async function fetchStationChartMeta(
  trainNumber: string,
  stationCode: string,
  refreshFromIrctc = false,
  journeyDate?: string,
): Promise<StationMeta | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/train-composition/stations-meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trainNumber, sourceStation: stationCode, refreshFromIrctc, journeyDate }),
      signal: AbortSignal.timeout(STATION_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      stations?: Array<{
        chartOneTime?: string | null;
        chartOneDayOffset?: number | null;
        chartTwoTime?: string | null;
        chartTwoDayOffset?: number | null;
        chartRemoteStation?: string | null;
      }>;
    };
    const m = json?.stations?.[0];
    if (!m) return null;
    return {
      chartTimeLocal: m.chartOneTime?.trim() || null,
      chartOneDayOffset: m.chartOneDayOffset ?? null,
      chartTwoTimeLocal: m.chartTwoTime?.trim() || null,
      chartTwoDayOffset: m.chartTwoDayOffset ?? null,
      chartRemoteStation: m.chartRemoteStation?.trim() || null,
    };
  } catch (err) {
    console.warn(
      `[chart-times] station-meta fetch failed for ${trainNumber}/${stationCode}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Run `fn` over `items` with a bounded number of concurrent calls. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function buildPageData(trainNumber: string): Promise<ChartTimesPageData | null> {
  const train = await fetchTrainData(trainNumber);
  const stationList = train?.schedule?.stationList ?? [];
  if (!train || stationList.length === 0) return null;

  const trainName = train.trainName || train.schedule?.trainName || "";

  const codes = stationList.map((s) =>
    String(s.stationCode || "").trim().toUpperCase(),
  );
  const trainNo = train.trainNumber || trainNumber;
  const originCode = codes[0];

  // IRCTC returns "chart not prepared" when the train doesn't run on the queried
  // date. Probe the origin across today, +1 and -1 day to find a date for which a
  // chart exists, then fetch every station for that date. (Chart times are
  // date-independent times-of-day, so any valid running date populates them.)
  let chosenDate = ymdOffset(0);
  for (const off of DATE_FALLBACK_OFFSETS) {
    const d = ymdOffset(off);
    const probe = await fetchStationChartMeta(trainNo, originCode, off !== 0, d);
    if (probe?.chartTimeLocal) {
      chosenDate = d;
      break;
    }
  }

  // Fetch chart meta per station for the chosen date (backend reads DB first,
  // hits IRCTC only when missing, and persists). Bounded concurrency.
  const metas = await mapWithConcurrency(codes, FETCH_CONCURRENCY, (code) =>
    fetchStationChartMeta(trainNo, code, false, chosenDate),
  );

  // Second pass: for stations that got a first chart but no second chart, make a
  // dedicated forced-refresh call to try to obtain the 2nd chart time. If IRCTC
  // still has no second chart, the row stays null and renders as "NA".
  const secondPassIdx = codes
    .map((_, i) => i)
    .filter((i) => metas[i]?.chartTimeLocal && !metas[i]?.chartTwoTimeLocal);
  if (secondPassIdx.length > 0) {
    await mapWithConcurrency(secondPassIdx, FETCH_CONCURRENCY, async (i) => {
      const refreshed = await fetchStationChartMeta(trainNo, codes[i], true, chosenDate);
      if (refreshed?.chartTwoTimeLocal) metas[i] = refreshed;
    });
  }

  const stations: ChartTimeStationRow[] = stationList.map((s, i) => {
    const code = codes[i];
    const meta = metas[i];
    return {
      stationCode: code,
      stationName: s.stationName || code,
      arrivalTime: s.arrivalTime ?? null,
      departureTime: s.departureTime ?? null,
      day: s.day ?? null,
      distance: s.distance ?? null,
      chartTimeLocal: meta?.chartTimeLocal ?? null,
      chartOneDayOffset: meta?.chartOneDayOffset ?? null,
      chartTwoTimeLocal: meta?.chartTwoTimeLocal ?? null,
      chartTwoDayOffset: meta?.chartTwoDayOffset ?? null,
      chartRemoteStation: meta?.chartRemoteStation ?? null,
    };
  });

  const originStation = train.originStation || train.schedule?.stationFrom || "";
  const destinationStation =
    train.destinationStation || train.schedule?.stationTo || "";

  return {
    trainNumber: String(train.trainNumber || trainNumber).trim(),
    trainName,
    originStation,
    destinationStation,
    slug: buildChartTimesSlug(train.trainNumber || trainNumber, trainName),
    stations,
    summary: buildChartTimesSummary({
      trainName,
      trainNumber: String(train.trainNumber || trainNumber).trim(),
      originStation,
      destinationStation,
      stations,
    }),
    generatedAt: new Date().toISOString(),
    knownChartCount: stations.filter((s) => s.chartTimeLocal).length,
  };
}

/**
 * Resolve chart-times page data for a train number: serve the committed/cached
 * JSON when present and fresh; otherwise generate it, persist it, and return it.
 * Falls back to a stale cache if regeneration fails (backend down, etc.).
 */
export const getChartTimesPageData = reactCache(
  async (trainNumber: string): Promise<ChartTimesPageData | null> => {
    const num = String(trainNumber || "").trim();
    if (!num) return null;

    const cached = readCachedFile(num);

    // During `next build` the backend is not running, so skip staleness checks
    // and serve whatever committed JSON we have. ISR will refresh at runtime.
    if (isBuildPhase) return cached;

    if (cached && !isStale(cached)) return cached;

    const fresh = await buildPageData(num);
    if (fresh) {
      writeCachedFile(fresh);
      return fresh;
    }
    // Generation failed — better to serve a stale page than nothing.
    return cached;
  },
);

/** All chart-times slugs we have committed JSON for (used by generateStaticParams). */
export function listChartTimesSlugs(): string[] {
  if (!fs.existsSync(CHART_TIMES_DIR)) return [];
  try {
    return fs
      .readdirSync(CHART_TIMES_DIR)
      .filter((f) => f.endsWith("-chart-times.json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/** Lightweight metadata for every committed chart-times page (for the index hub). */
export function listChartTimesIndex(): {
  slug: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
}[] {
  if (!fs.existsSync(CHART_TIMES_DIR)) return [];
  const out: ReturnType<typeof listChartTimesIndex> = [];
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(CHART_TIMES_DIR)
      .filter((f) => f.endsWith("-chart-times.json"));
  } catch {
    return [];
  }
  for (const f of files) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(CHART_TIMES_DIR, f), "utf8"),
      ) as ChartTimesPageData;
      out.push({
        slug: data.slug || f.replace(/\.json$/, ""),
        trainNumber: data.trainNumber,
        trainName: data.trainName,
        originStation: data.originStation,
        destinationStation: data.destinationStation,
      });
    } catch {
      // skip malformed file
    }
  }
  return out.sort((a, b) => a.trainNumber.localeCompare(b.trainNumber));
}

/**
 * Curated marquee trains for the "Popular trains" rail shown on the chart-times
 * hub and in the site footer. These are recognisable, high-traffic trains
 * (Rajdhani / Shatabdi / Duronto / named expresses) rather than whatever
 * happens to sort first in the full index. Listed in display order; only the
 * ones that have a committed chart-times page are surfaced.
 */
export const CURATED_POPULAR_CHART_TIMES: string[] = [
  "12952", // Mumbai Rajdhani
  "12302", // Howrah Rajdhani
  "12310", // Patna (Rajdhani) Express
  "12425", // Jammu Rajdhani
  "12002", // New Delhi Shatabdi
  "12007", // Mysuru Shatabdi
  "12259", // Duronto Express
  "12621", // Tamil Nadu Express
  "12615", // Grand Trunk Express
  "12137", // Punjab Mail
  "12649", // Sampark Kranti
  "12301", // Howrah Rajdhani (Via Gaya)
];

/** The curated popular trains that actually have a chart-times page, in order. */
export function listPopularChartTimes(): ReturnType<typeof listChartTimesIndex> {
  const byNumber = new Map(
    listChartTimesIndex().map((t) => [t.trainNumber, t]),
  );
  const out: ReturnType<typeof listChartTimesIndex> = [];
  for (const trainNumber of CURATED_POPULAR_CHART_TIMES) {
    const t = byNumber.get(trainNumber);
    if (t) out.push(t);
  }
  return out;
}
