import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteCacheStore } from '../route-cache/route-cache.store';
import type { AlternatePathLeg } from './booking-v2.service';

/**
 * Trimmed best-train payload — only what the homepage best-seat card renders.
 * We deliberately do NOT store the full BestTrainSearchResult (ranked list,
 * per-class options, debug logs) to keep rows small at millions-of-routes scale.
 * `found: false` is an explicit "computed, but no confirmed train" marker so the
 * request path can distinguish a computed miss from an un-cached route.
 */
export type CachedBestTrain =
  | {
      found: true;
      train: {
        trainNumber: string;
        trainName: string | null;
        departureTime: string | null;
        arrivalTime: string | null;
      };
      /** The confirmed booking path (legs) for the top candidate. */
      legs: AlternatePathLeg[];
      totalFare: number | null;
      isComplete: boolean;
      rankReason: string;
    }
  | { found: false };

/**
 * Cache key for the best-train-per-route lookup — the single source of truth for
 * the key. For now `from`/`to` are the train's start/end station codes; a search
 * over the same OD reuses the entry. Returns null when the date can't be
 * normalized so callers treat it as an un-cacheable/un-lookable input.
 */
export function bestTrainsCacheKey(
  from: string,
  to: string,
  normalizedDate: string | null,
): string | null {
  const f = String(from ?? '')
    .trim()
    .toUpperCase();
  const t = String(to ?? '')
    .trim()
    .toUpperCase();
  if (!f || !t || !normalizedDate) return null;
  return `best-trains:v1:${f}:${t}:${normalizedDate}`;
}

/**
 * Best-train route cache backed by the `route_caching` table. A thin subclass of
 * the reusable RouteCacheStore — all caching behaviour is inherited; this only
 * binds the three Prisma hooks to the table.
 */
@Injectable()
export class BestTrainsRouteCache extends RouteCacheStore<CachedBestTrain> {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected async findByKey(key: string) {
    const row = await this.prisma.routeCaching.findUnique({
      where: { cacheKey: key },
    });
    if (!row) return null;
    return { value: row.value, cachedAt: row.cachedAt, expiresAt: row.expiresAt };
  }

  protected async upsert(key: string, value: CachedBestTrain, expiresAt: Date) {
    const cachedAt = new Date();
    await this.prisma.routeCaching.upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, value: value as object, cachedAt, expiresAt },
      update: { value: value as object, cachedAt, expiresAt },
    });
  }

  protected async deleteByKey(key: string) {
    await this.prisma.routeCaching
      .delete({ where: { cacheKey: key } })
      .catch((e: unknown) => {
        // Ignore "record not found"; surface anything unexpected.
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: string }).code === 'P2025'
        )
          return;
        throw e;
      });
  }
}
