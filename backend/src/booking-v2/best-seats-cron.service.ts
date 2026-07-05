import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import moment from 'moment';
import { captureSentryException } from '../common/sentry-report';
import { ChartCronLeaderService } from '../chart-cron/chart-cron-leader.service';
import { BookingV2Service } from './booking-v2.service';
import { bestTrainsCacheKey, BestTrainsRouteCache } from './best-trains-cache';
import { canonicalStation } from './station-hubs';
import { PostHogTopRoutesService } from './posthog-top-routes.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

/**
 * The curated popular routes to keep warm, as IRCTC station-code pairs.
 * Source of truth for the slug list is the frontend `lib/seo/routes-db.ts`
 * (getTopRoutes + STATIONS); mirrored here as codes because the backend can't
 * import frontend modules. Keep in sync if that list changes.
 */
const POPULAR_ROUTE_PAIRS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'NDLS', to: 'MMCT' }, // delhi -> mumbai
  { from: 'NDLS', to: 'PNBE' }, // delhi -> patna
  { from: 'MMCT', to: 'SBC' }, // mumbai -> bengaluru
  { from: 'MAS', to: 'SBC' }, // chennai -> bengaluru
  { from: 'HWH', to: 'NDLS' }, // kolkata -> delhi
  { from: 'SBC', to: 'MAS' }, // bengaluru -> chennai
  { from: 'NDLS', to: 'JAT' }, // delhi -> jammu
  { from: 'MMCT', to: 'ADI' }, // mumbai -> ahmedabad
  { from: 'NDLS', to: 'HWH' }, // delhi -> kolkata
];

/** How many days ahead to cache, starting today (IST). 0..5 => 6 dates. */
const DAYS_AHEAD = 5;
const IST_UTC_OFFSET = '+05:30';

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/**
 * Keeps the best-train cache warm across today + the next 5 days (IST) for the
 * curated popular routes plus the top routes users actually search (pulled from
 * PostHog; see PostHogTopRoutesService). Runs every 6h and refreshes every route
 * whose cached entry is missing or older than the refresh threshold — i.e. the
 * whole set each run (per-run cap is high enough to cover it). The old 5-min
 * cadence churned the segment-availability cache (millions of DB writes); a 6h
 * cadence + 6h segment TTL cuts that dramatically. Each run also bulk-sweeps
 * expired cache_entry rows (replacing per-read deletes).
 *
 * Single-replica: gated by the shared ChartCronLeaderService lease, so only the
 * leader replica does the work (same mechanism as ChartCronService).
 *
 * Tunables:
 *   BEST_SEATS_CACHE_ENABLED  '0'/'false' to disable entirely (default on)
 *   BEST_SEATS_REFRESH_MS     recompute an entry older than this (default 6h)
 *   BEST_SEATS_MAX_PER_TICK   max recomputes per run (default 200 — covers all)
 *   BEST_SEATS_CONCURRENCY    concurrent recomputes (default 3)
 */
@Injectable()
export class BestSeatsCronService {
  private readonly logger = new Logger(BestSeatsCronService.name);
  private running = false;

  private readonly ownerId =
    process.env.RAILWAY_REPLICA_ID?.trim() ||
    process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
    null;

  constructor(
    private readonly bookingV2: BookingV2Service,
    private readonly bestTrainsCache: BestTrainsRouteCache,
    private readonly leader: ChartCronLeaderService,
    private readonly topRoutes: PostHogTopRoutesService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private get enabled(): boolean {
    // Never run on a dev machine — this hits IRCTC hard and writes shared cache.
    if (process.env.NODE_ENV === 'development') return false;
    const v = process.env.BEST_SEATS_CACHE_ENABLED?.trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleCron(): Promise<void> {
    if (!this.enabled) return;
    if (!(await this.leader.isLeader())) return;
    if (this.running) return;

    this.running = true;
    try {
      // One bulk sweep of expired cache_entry rows per run, replacing the old
      // per-read DELETE storm. Best-effort — never block the refresh.
      await this.cache.deleteExpired().catch((e) =>
        this.logger.warn(
          `[best-seats-cron] cache sweep failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
      await this.refreshDueEntries();
    } catch (err) {
      this.logger.error(
        `[best-seats-cron] tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      captureSentryException(err, { tags: { service: 'best-seats-cron' } });
    } finally {
      this.running = false;
    }
  }

  /**
   * Run one refresh pass on demand — bypasses the 5-min schedule, the
   * NODE_ENV=development gate, and the leader lease (for a manual admin/local
   * trigger). Still respects the in-process `running` guard so it won't overlap a
   * scheduled tick. Only combos that are missing or older than BEST_SEATS_REFRESH_MS
   * are recomputed; set BEST_SEATS_REFRESH_MS low (e.g. 1) to force-refresh all.
   */
  async runNow(): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: false, error: 'a run is already in progress' };
    this.running = true;
    try {
      this.logger.log('[best-seats-cron] manual run triggered');
      await this.refreshDueEntries();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[best-seats-cron] manual run failed: ${msg}`);
      captureSentryException(err, {
        tags: { service: 'best-seats-cron', trigger: 'manual' },
      });
      return { ok: false, error: msg };
    } finally {
      this.running = false;
    }
  }

  /**
   * All (route, date) combos to keep warm across today + the next 5 days: the
   * curated popular routes plus the top routes users actually search (pulled from
   * PostHog, deduped). PostHog results are cached in-process for an hour, so
   * calling this every tick is cheap.
   */
  private async targetCombos(): Promise<
    Array<{ from: string; to: string; date: string }>
  > {
    const dates: string[] = [];
    for (let i = 0; i <= DAYS_AHEAD; i += 1) {
      dates.push(
        moment().utcOffset(IST_UTC_OFFSET).add(i, 'days').format('YYYY-MM-DD'),
      );
    }

    // Merge curated + PostHog top-searched routes, canonicalized to their city
    // hub and deduped — so DEE->BDTS and NDLS->MMCT collapse to one primary
    // (NDLS->MMCT) that the cache key also resolves to. Keeps the representative
    // computed result on the city's main station.
    const pairs = new Map<string, { from: string; to: string }>();
    const addPair = (from: string, to: string) => {
      const f = canonicalStation(from);
      const t = canonicalStation(to);
      if (!f || !t || f === t) return;
      pairs.set(`${f}:${t}`, { from: f, to: t });
    };
    for (const r of POPULAR_ROUTE_PAIRS) addPair(r.from, r.to);
    const top = await this.topRoutes.getTopRoutes();
    for (const r of top) addPair(r.from, r.to);

    const combos: Array<{ from: string; to: string; date: string }> = [];
    for (const route of pairs.values()) {
      for (const date of dates) {
        combos.push({ from: route.from, to: route.to, date });
      }
    }
    return combos;
  }

  private async refreshDueEntries(): Promise<void> {
    const refreshMs = envInt(
      'BEST_SEATS_REFRESH_MS',
      6 * 60 * 60 * 1000,
      60_000,
      24 * 60 * 60 * 1000,
    );
    // High cap: at a 6h cadence each run should refresh the whole due set (not
    // stagger across ticks like the old 5-min cron). Keep concurrency low — the
    // DB is cross-region and small, so a big parallel write burst causes lock
    // contention / connection exhaustion. 2 is gentle; raise via env if the DB
    // is co-located/upsized.
    const maxPerTick = envInt('BEST_SEATS_MAX_PER_TICK', 200, 1, 1000);
    const concurrency = envInt('BEST_SEATS_CONCURRENCY', 2, 1, 6);
    const cutoff = new Date(Date.now() - refreshMs);

    const combos = await this.targetCombos();

    // Figure out which combos are due (missing or stale), oldest-first, so a
    // refresh wave rolls through over successive ticks rather than all at once.
    const due: Array<{
      from: string;
      to: string;
      date: string;
      cachedAt: Date | null;
    }> = [];
    for (const combo of combos) {
      const key = bestTrainsCacheKey(
        combo.from,
        combo.to,
        this.bookingV2.normalizeToRailApiDate(combo.date),
      );
      if (!key) continue;
      const record = await this.bestTrainsCache.getRecord(key);
      if (!record || record.cachedAt <= cutoff) {
        due.push({ ...combo, cachedAt: record?.cachedAt ?? null });
      }
    }

    if (due.length === 0) return;

    due.sort((a, b) => {
      const at = a.cachedAt ? a.cachedAt.getTime() : 0; // missing = oldest
      const bt = b.cachedAt ? b.cachedAt.getTime() : 0;
      return at - bt;
    });
    const batch = due.slice(0, maxPerTick);

    const startedAt = new Date();
    let refreshed = 0;
    let failed = 0;
    const routes: Array<{
      from: string;
      to: string;
      date: string;
      status: 'ok' | 'empty' | 'failed';
      train: string | null;
    }> = [];
    await this.mapWithConcurrency(batch, concurrency, async (combo) => {
      try {
        const { found, trainNumber } =
          await this.bookingV2.computeAndCacheBestTrain(
            combo.from,
            combo.to,
            combo.date,
          );
        refreshed += 1;
        routes.push({
          from: combo.from,
          to: combo.to,
          date: combo.date,
          status: found ? 'ok' : 'empty',
          train: trainNumber,
        });
      } catch (err) {
        failed += 1;
        routes.push({
          from: combo.from,
          to: combo.to,
          date: combo.date,
          status: 'failed',
          train: null,
        });
        this.logger.warn(
          `[best-seats-cron] refresh failed ${combo.from}->${combo.to} ${combo.date}: ${err instanceof Error ? err.message : String(err)}`,
        );
        captureSentryException(err, {
          tags: { service: 'best-seats-cron' },
          extra: { from: combo.from, to: combo.to, date: combo.date },
        });
      }
    });

    this.logger.log(
      `[best-seats-cron] due=${due.length} batch=${batch.length} refreshed=${refreshed} failed=${failed} skipped=${combos.length - due.length}`,
    );

    // Record the run for the admin dashboard (best-effort — never fail the tick).
    try {
      await this.prisma.bestSeatsCronRun.create({
        data: {
          startedAt,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          due: due.length,
          batch: batch.length,
          refreshed,
          failed,
          skipped: combos.length - due.length,
          routes,
          ownerId: this.ownerId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `[best-seats-cron] failed to record run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async mapWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const run = async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index]);
      }
    };
    const count = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: count }, run));
  }
}
