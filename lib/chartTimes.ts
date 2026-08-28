import fs from "node:fs";
import path from "node:path";
import { cache as reactCache } from "react";
const cache = (reactCache as <T>(fn: T) => T) || ((fn) => fn);
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

export const CHART_TIMES_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "content",
  "chart-times",
);

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
    return match ? path.join(/*turbopackIgnore: true*/ CHART_TIMES_DIR, match) : null;
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
    const fp = path.join(/*turbopackIgnore: true*/ CHART_TIMES_DIR, `${data.slug}.json`);
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

import {
  getTrainRunsOnFlagForYmd,
  type TrainRunsOnJson,
} from "@/lib/trainRunsOn";

/** YYYY-MM-DD for today + `days` (server-local). */
function ymdOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * All calendar dates (YYYY-MM-DD) in a window around today on which the train
 * actually runs, ordered from future to past.
 */
function getValidTrainStartDates(
  runs: TrainRunsOnJson | null | undefined,
  daysPast = 7,
  daysFuture = 2,
): string[] {
  const dates: string[] = [];
  for (let offset = daysFuture; offset >= -daysPast; offset--) {
    const d = ymdOffset(offset);
    const flag = getTrainRunsOnFlagForYmd(d, runs);
    if (flag === "N") continue;
    dates.push(d);
  }
  return dates.length > 0 ? dates : [ymdOffset(0), ymdOffset(1), ymdOffset(-1)];
}

/**
 * Returns candidate train start dates for a station, sorted by likelihood of having
 * an active/prepared chart on IRCTC right now.
 */
function getCandidateDatesForStation(
  station: ScheduleStation,
  validStartDates: string[],
): string[] {
  if (validStartDates.length <= 1) return validStartDates;

  const dayOffset = Math.max(
    0,
    Number(station.day ?? (station as unknown as { dayCount?: unknown }).dayCount ?? 1) - 1,
  );
  const timeStr = (station.departureTime || station.arrivalTime || "12:00").trim();
  const [hh, mm] = timeStr.split(":").map((v) => parseInt(v, 10) || 0);

  const nowMs = Date.now();

  const scored = validStartDates.map((startDate) => {
    // Boarding date for this station for this train start date
    const d = new Date(startDate + "T00:00:00+05:30");
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hh, mm, 0, 0);
    const boardingTimeMs = d.getTime();

    // Chart is typically prepared ~4 hours before boarding (or ~14h before for morning origin)
    const chartLeadMs = dayOffset === 0 && hh < 12 ? 14 * 3600 * 1000 : 4 * 3600 * 1000;
    const chartPrepTimeMs = boardingTimeMs - chartLeadMs;

    const isChartDue = nowMs >= chartPrepTimeMs;
    const hoursSinceBoarding = (nowMs - boardingTimeMs) / (3600 * 1000);

    let score = 0;
    if (isChartDue && hoursSinceBoarding <= 36) {
      score = 1000 - Math.abs(nowMs - chartPrepTimeMs) / (3600 * 1000);
    } else if (!isChartDue) {
      score = 500 - (chartPrepTimeMs - nowMs) / (3600 * 1000);
    } else {
      score = 100 - hoursSinceBoarding;
    }

    return { startDate, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.startDate);
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
  const trainNo = train.trainNumber || trainNumber;
  const trainRunsOn = (train.schedule as unknown as { trainRunsOn?: TrainRunsOnJson })?.trainRunsOn;
  const validStartDates = getValidTrainStartDates(trainRunsOn);

  // Fetch chart meta per station with station-specific candidate dates.
  // We probe candidate dates (checking DB cache first, then IRCTC if needed).
  const metas = await mapWithConcurrency(stationList, FETCH_CONCURRENCY, async (stn) => {
    const code = String(stn.stationCode || "").trim().toUpperCase();
    const candidateDates = getCandidateDatesForStation(stn, validStartDates);

    // 1. Fast check: see if DB already has the chart meta for this station
    let meta = await fetchStationChartMeta(trainNo, code, false, candidateDates[0]);
    if (meta?.chartTimeLocal) return meta;

    // 2. Not in DB: probe candidate running dates in ranked order
    for (const d of candidateDates) {
      meta = await fetchStationChartMeta(trainNo, code, true, d);
      if (meta?.chartTimeLocal) break;
    }
    return meta;
  });

  // Second pass: for stations that got a first chart but no second chart, make a
  // dedicated forced-refresh call using the best candidate date to try to obtain 2nd chart.
  const secondPassIdx = stationList
    .map((_, i) => i)
    .filter((i) => metas[i]?.chartTimeLocal && !metas[i]?.chartTwoTimeLocal);
  if (secondPassIdx.length > 0) {
    await mapWithConcurrency(secondPassIdx, FETCH_CONCURRENCY, async (i) => {
      const stn = stationList[i];
      const code = String(stn.stationCode || "").trim().toUpperCase();
      const candidateDates = getCandidateDatesForStation(stn, validStartDates);
      const refreshed = await fetchStationChartMeta(trainNo, code, true, candidateDates[0]);
      if (refreshed?.chartTwoTimeLocal) metas[i] = refreshed;
    });
  }

  const stations: ChartTimeStationRow[] = stationList.map((s, i) => {
    const code = String(s.stationCode || "").trim().toUpperCase();
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
export const getChartTimesPageData = cache(
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

let cachedChartTimesIndex: {
  slug: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
}[] | null = null;

/** Lightweight metadata for every committed chart-times page (for the index hub). */
export function listChartTimesIndex(): {
  slug: string;
  trainNumber: string;
  trainName: string;
  originStation: string;
  destinationStation: string;
}[] {
  if (cachedChartTimesIndex) return cachedChartTimesIndex;
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
        fs.readFileSync(path.join(/*turbopackIgnore: true*/ CHART_TIMES_DIR, f), "utf8"),
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
  cachedChartTimesIndex = out.sort((a, b) => a.trainNumber.localeCompare(b.trainNumber));
  return cachedChartTimesIndex;
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
