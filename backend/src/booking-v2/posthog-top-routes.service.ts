import { Injectable, Logger } from '@nestjs/common';
import { fetchWithTimeout } from '../common/fetch-with-timeout';
import { captureSentryException } from '../common/sentry-report';

export type TopRoute = { from: string; to: string; searches: number };

const QUERY_TIMEOUT_MS = 15_000;
/** In-process cache TTL so the 5-min cron doesn't query PostHog every tick. */
const RESULT_TTL_MS = 60 * 60 * 1000;
/** Station codes are short alphanumerics; reject anything else from the query. */
const CODE_RE = /^[A-Z0-9]{2,6}$/;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/**
 * Fetches the most-searched routes from PostHog via its HogQL query API, so the
 * best-seats cron can precompute the routes users actually search for (the
 * "Top Routes Searched" insight). Results are cached in-process for an hour.
 *
 * Gated by env — when unconfigured it returns [] and the cron falls back to its
 * curated route list:
 *   POSTHOG_API_HOST           default https://us.posthog.com (query API host,
 *                              NOT the i.posthog.com ingestion host)
 *   POSTHOG_PROJECT_ID         numeric project id
 *   POSTHOG_PERSONAL_API_KEY   personal API key with query scope (Bearer)
 *   POSTHOG_TOP_ROUTES_EVENT   event to aggregate (default search_tickets_clicked)
 *   POSTHOG_TOP_ROUTES_LIMIT   how many routes to pull (default 20, 1-200)
 *   POSTHOG_TOP_ROUTES_DAYS    look-back window in days (default 30, 1-365)
 */
@Injectable()
export class PostHogTopRoutesService {
  private readonly logger = new Logger(PostHogTopRoutesService.name);
  private cache: { at: number; routes: TopRoute[] } | null = null;
  private inflight: Promise<TopRoute[]> | null = null;

  get enabled(): boolean {
    return Boolean(
      process.env.POSTHOG_PROJECT_ID?.trim() &&
        process.env.POSTHOG_PERSONAL_API_KEY?.trim(),
    );
  }

  /** Top searched routes, cached in-process for an hour. [] when disabled/on error. */
  async getTopRoutes(): Promise<TopRoute[]> {
    if (!this.enabled) return [];
    if (this.cache && Date.now() - this.cache.at < RESULT_TTL_MS) {
      return this.cache.routes;
    }
    // Collapse concurrent callers onto a single in-flight query.
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchTopRoutes()
      .then((routes) => {
        this.cache = { at: Date.now(), routes };
        return routes;
      })
      .catch((err) => {
        this.logger.warn(
          `[posthog-top-routes] query failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        captureSentryException(err, { tags: { service: 'posthog-top-routes' } });
        // Serve last-known on a transient failure; otherwise empty.
        return this.cache?.routes ?? [];
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async fetchTopRoutes(): Promise<TopRoute[]> {
    const host = (
      process.env.POSTHOG_API_HOST?.trim() || 'https://us.posthog.com'
    ).replace(/\/+$/, '');
    const projectId = process.env.POSTHOG_PROJECT_ID!.trim();
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY!.trim();
    const limit = envInt('POSTHOG_TOP_ROUTES_LIMIT', 20, 1, 200);
    const days = envInt('POSTHOG_TOP_ROUTES_DAYS', 30, 1, 365);
    // Event name is interpolated into HogQL, so hard-restrict its charset.
    const rawEvent =
      process.env.POSTHOG_TOP_ROUTES_EVENT?.trim() || 'search_tickets_clicked';
    const event = rawEvent.replace(/[^a-zA-Z0-9_]/g, '');
    if (!event) throw new Error('invalid POSTHOG_TOP_ROUTES_EVENT');

    const hogql = `
      SELECT upper(trim(properties.from_code)) AS frm,
             upper(trim(properties.to_code)) AS dest,
             count() AS searches
      FROM events
      WHERE event = '${event}'
        AND timestamp > now() - INTERVAL ${days} DAY
        AND properties.from_code IS NOT NULL AND trim(properties.from_code) != ''
        AND properties.to_code IS NOT NULL AND trim(properties.to_code) != ''
      GROUP BY frm, dest
      ORDER BY searches DESC
      LIMIT ${limit}
    `.trim();

    const url = `${host}/api/projects/${encodeURIComponent(projectId)}/query/`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
      },
      QUERY_TIMEOUT_MS,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PostHog query ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { results?: unknown[] };
    const rows = Array.isArray(json.results) ? json.results : [];
    const routes: TopRoute[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const from = String(row[0] ?? '').trim().toUpperCase();
      const to = String(row[1] ?? '').trim().toUpperCase();
      const searches = Number(row[2] ?? 0);
      if (!CODE_RE.test(from) || !CODE_RE.test(to) || from === to) continue;
      routes.push({ from, to, searches });
    }
    this.logger.log(
      `[posthog-top-routes] event=${event} days=${days} -> ${routes.length} routes (limit=${limit})`,
    );
    return routes;
  }
}
