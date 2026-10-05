import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteCachingTableStore } from '../route-cache/route-caching-table.store';
import type { FindAlternatePathsResult } from './booking-v2.service';

/**
 * Cache key for a per-train alternate-paths lookup. Includes the train's OD
 * (from/to are the train's start/end, matching how the frontend probes),
 * the train number, quota, the requested class set, and the date — so a single-class
 * "Find in SL" and an all-classes "Search all classes" are cached separately.
 *
 * `avlClasses` is normalized to a stable `CLASSKEY`: sorted, de-duped, upper-cased
 * and comma-joined; an empty/omitted set (the default full-class scan) → "ALL".
 */
export function alternatePathsCacheKey(
  from: string,
  to: string,
  trainNumber: string,
  avlClasses: string[] | undefined,
  normalizedDate: string | null,
  quota = 'GN',
): string | null {
  const f = String(from ?? '')
    .trim()
    .toUpperCase();
  const t = String(to ?? '')
    .trim()
    .toUpperCase();
  const tn = String(trainNumber ?? '').trim();
  if (!f || !t || !tn || !normalizedDate) return null;

  const classes = (avlClasses ?? [])
    .map((c) =>
      String(c ?? '')
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
  const classKey = classes.length
    ? Array.from(new Set(classes)).sort().join(',')
    : 'ALL';

  // v3 excludes legacy entries that could mix results from different quotas.
  return `alt-paths:v3:${f}:${t}:${tn}:${classKey}:${normalizedDate}:${quota.trim().toUpperCase() || 'GN'}`;
}

/**
 * Alternate-paths route cache — another thin subclass over the shared
 * `route_caching` table (distinct `alt-paths:` key prefix), so user-initiated
 * per-train/per-class lookups are cached alongside the best-train entries.
 */
@Injectable()
export class AlternatePathsRouteCache extends RouteCachingTableStore<FindAlternatePathsResult> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByRouteAndDate(
    from: string,
    to: string,
    normalizedDate: string,
    quota = 'GN',
  ): Promise<
    Array<{
      trainNumber: string;
      classKey: string;
      result: FindAlternatePathsResult;
    }>
  > {
    const f = String(from ?? '')
      .trim()
      .toUpperCase();
    const t = String(to ?? '')
      .trim()
      .toUpperCase();
    const q =
      String(quota ?? 'GN')
        .trim()
        .toUpperCase() || 'GN';
    if (!f || !t || !normalizedDate) return [];

    const prefix = `alt-paths:v3:${f}:${t}:`;
    const suffix = `:${normalizedDate}:${q}`;

    try {
      // Use only `startsWith: prefix` so PostgreSQL can use the B-Tree index
      // on primary key `cache_key`. `endsWith` prevents index range scans and forces
      // expensive sequential table scans. We filter `endsWith` in memory instead.
      const rows = await this.prisma.routeCaching.findMany({
        where: {
          cacheKey: {
            startsWith: prefix,
          },
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      const out: Array<{
        trainNumber: string;
        classKey: string;
        result: FindAlternatePathsResult;
      }> = [];

      for (const row of rows) {
        if (!row.cacheKey.endsWith(suffix)) continue;
        const parts = row.cacheKey.split(':');
        // Format: alt-paths:v3:FROM:TO:TRAINNUM:CLASSKEY:DATE:QUOTA
        if (parts.length < 8) continue;
        const trainNumber = parts[4];
        const classKey = parts[5];
        const result = row.value as FindAlternatePathsResult;
        if (
          !result ||
          !Array.isArray(result.legs) ||
          result.legs.length === 0
        ) {
          continue;
        }
        out.push({ trainNumber, classKey, result });
      }

      return out;
    } catch (e) {
      this.logger.warn(
        `findByRouteAndDate failed for ${f}->${t} on ${normalizedDate}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return [];
    }
  }
}
