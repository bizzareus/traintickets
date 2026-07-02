import {
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BestSeatsCronService } from './best-seats-cron.service';

/**
 * Admin dashboard data for the best-seats cache cron: recent runs (when it ran,
 * outcome counts, which routes it updated) plus a summary of what's currently
 * cached. Gated by the shared admin password (CHART_TIME_INGESTION_PASSWORD) via
 * the x-admin-password header, matching the other admin tools.
 */
@Controller('api/admin/best-seats-cron')
export class BestSeatsCronController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cron: BestSeatsCronService,
  ) {}

  /**
   * Force one refresh pass now, bypassing the schedule / dev gate / leader lease.
   * Handy for populating the cache locally or on demand. Runs synchronously and
   * can take a while (multiple full best-train scans), so give it a long client
   * timeout. Combos already fresh (< BEST_SEATS_REFRESH_MS) are skipped — set
   * BEST_SEATS_REFRESH_MS=1 to force-refresh everything.
   *
   * Authenticated with the dedicated BEST_SEATS_CRON_API_KEY (x-api-key header),
   * not the admin password — this is a machine/automation trigger.
   */
  @Post('run')
  async run(@Headers('x-api-key') apiKey?: string) {
    this.assertApiKey(apiKey);
    return this.cron.runNow();
  }

  private assertPassword(pw?: string): void {
    const expected = String(
      process.env.CHART_TIME_INGESTION_PASSWORD ?? '',
    ).trim();
    if (!expected) {
      throw new UnauthorizedException('Admin password is not configured.');
    }
    if (String(pw ?? '') !== expected) {
      throw new UnauthorizedException('Invalid admin password.');
    }
  }

  /** Machine auth for the run trigger: a dedicated API key (x-api-key header). */
  private assertApiKey(key?: string): void {
    const expected = String(process.env.BEST_SEATS_CRON_API_KEY ?? '').trim();
    if (!expected) {
      throw new UnauthorizedException(
        'BEST_SEATS_CRON_API_KEY is not configured.',
      );
    }
    if (String(key ?? '') !== expected) {
      throw new UnauthorizedException('Invalid API key.');
    }
  }

  @Get()
  async status(@Headers('x-admin-password') pw?: string) {
    this.assertPassword(pw);

    const runs = await this.prisma.bestSeatsCronRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 30,
    });

    // Cache summary by type (best-trains vs alt-paths), from the shared table.
    const summary = await this.prisma.$queryRaw<
      Array<{
        type: string;
        rows: bigint;
        unexpired: bigint;
        routes: bigint;
        newest: Date | null;
      }>
    >`
      SELECT split_part("cache_key", ':', 1) AS type,
             count(*) AS rows,
             count(*) FILTER (WHERE "expires_at" > now()) AS unexpired,
             count(DISTINCT split_part("cache_key", ':', 3) || ':' || split_part("cache_key", ':', 4)) AS routes,
             max("cached_at") AS newest
      FROM "route_caching"
      GROUP BY 1
      ORDER BY rows DESC
    `;

    return {
      enabled: this.cronEnabled(),
      runs: runs.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        durationMs: r.durationMs,
        due: r.due,
        batch: r.batch,
        refreshed: r.refreshed,
        failed: r.failed,
        skipped: r.skipped,
        ownerId: r.ownerId,
        routes: r.routes,
      })),
      cache: summary.map((s) => ({
        type: s.type,
        rows: Number(s.rows),
        unexpired: Number(s.unexpired),
        routes: Number(s.routes),
        newest: s.newest ? s.newest.toISOString() : null,
      })),
    };
  }

  private cronEnabled(): boolean {
    if (process.env.NODE_ENV === 'development') return false;
    const v = process.env.BEST_SEATS_CACHE_ENABLED?.trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
  }
}
