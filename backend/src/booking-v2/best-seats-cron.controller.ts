import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin dashboard data for the best-seats cache cron: recent runs (when it ran,
 * outcome counts, which routes it updated) plus a summary of what's currently
 * cached. Gated by the shared admin password (CHART_TIME_INGESTION_PASSWORD) via
 * the x-admin-password header, matching the other admin tools.
 */
@Controller('api/admin/best-seats-cron')
export class BestSeatsCronController {
  constructor(private readonly prisma: PrismaService) {}

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
    const v = process.env.BEST_SEATS_CACHE_ENABLED?.trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
  }
}
