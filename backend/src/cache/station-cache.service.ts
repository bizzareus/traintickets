import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type StationRow = {
  stationCode: string;
  stationName: string;
  [key: string]: unknown;
};

/** Minimum number of DB results required to treat a station autocomplete query as a cache hit. */
const MIN_STATION_RESULTS = 5;

/**
 * Dedicated cache for station autocomplete.
 *
 * Unlike the generic CacheService (exact key lookup), station search requires
 * substring matching across stationCode and stationName — backed by indexed
 * Postgres ILIKE queries against the StationCache table.
 */
@Injectable()
export class StationCacheService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search cached stations by code prefix or name substring.
   * Returns null when results are below the minimum threshold (caller should fall back to API).
   */
  async search(q: string): Promise<StationRow[] | null> {
    const normalized = q.trim().toUpperCase();
    if (normalized.length < 2) return null;

    const rows = await this.prisma.stationCache.findMany({
      where: {
        OR: [
          { stationCode: { startsWith: normalized, mode: 'insensitive' } },
          { stationName: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { stationCode: 'asc' },
    });

    if (rows.length < MIN_STATION_RESULTS) return null;

    return rows.map((r) => ({
      stationCode: r.stationCode,
      stationName: r.stationName,
      ...(r.metadata as object),
    }));
  }

  /**
   * Bulk-upsert stations into the cache. Safe to call fire-and-forget.
   */
  async upsertMany(stations: StationRow[]): Promise<void> {
    if (stations.length === 0) return;

    // Using chunks to avoid overwhelming the database or connection pool.
    // We avoid $transaction here to prevent 'Expired Transaction' errors on large datasets.
    const CHUNK_SIZE = 50;
    for (let i = 0; i < stations.length; i += CHUNK_SIZE) {
      const chunk = stations.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map((s) =>
          this.prisma.stationCache.upsert({
            where: { stationCode: s.stationCode.trim().toUpperCase() },
            create: {
              stationCode: s.stationCode.trim().toUpperCase(),
              stationName: s.stationName.trim().toUpperCase(),
              metadata: s as object,
            },
            update: {
              stationName: s.stationName.trim().toUpperCase(),
              metadata: s as object,
            },
          }),
        ),
      );
    }
  }
}
