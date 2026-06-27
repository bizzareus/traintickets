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
   * Cache stations. Safe to call fire-and-forget.
   *
   * Station code/name are effectively static, so we only INSERT rows that don't
   * already exist instead of upserting every station on every search. The old
   * upsert-everything path rewrote the same ~6k rows hundreds of thousands of
   * times (a top DB write cost). We read the existing codes once (indexed PK
   * lookup), then bulk-insert only the new ones with skipDuplicates as a
   * race-safe backstop.
   */
  async upsertMany(stations: StationRow[]): Promise<void> {
    if (stations.length === 0) return;

    // Normalize + dedupe input by station code.
    const byCode = new Map<string, { stationCode: string; stationName: string; metadata: object }>();
    for (const s of stations) {
      const code = s.stationCode.trim().toUpperCase();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, {
          stationCode: code,
          stationName: s.stationName.trim().toUpperCase(),
          metadata: s as object,
        });
      }
    }
    if (byCode.size === 0) return;

    const codes = [...byCode.keys()];
    const existing = await this.prisma.stationCache.findMany({
      where: { stationCode: { in: codes } },
      select: { stationCode: true },
    });
    const known = new Set(existing.map((r) => r.stationCode));
    const toInsert = codes.filter((c) => !known.has(c)).map((c) => byCode.get(c)!);
    if (toInsert.length === 0) return;

    // createMany is a single statement per chunk; skipDuplicates handles the
    // race where a concurrent search inserts the same code between our read
    // and write.
    const CHUNK_SIZE = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      await this.prisma.stationCache.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }
  }
}
