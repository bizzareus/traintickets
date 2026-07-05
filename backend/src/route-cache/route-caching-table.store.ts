import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RouteCacheStore } from './route-cache.store';

/**
 * RouteCacheStore bound to the shared `route_caching` Postgres table. Multiple
 * cache *types* (best-trains, alternate-paths, …) live in this one table keyed by
 * distinct key prefixes; each is a thin subclass that only fixes the payload
 * type `T` and supplies its own key builder. All the caching/TTL/expiry logic is
 * inherited from RouteCacheStore.
 */
export abstract class RouteCachingTableStore<T> extends RouteCacheStore<T> {
  protected constructor(protected readonly prisma: PrismaService) {
    super();
  }

  protected async findByKey(key: string) {
    const row = await this.prisma.routeCaching.findUnique({
      where: { cacheKey: key },
    });
    if (!row) return null;
    return { value: row.value, cachedAt: row.cachedAt, expiresAt: row.expiresAt };
  }

  protected async upsert(key: string, value: T, expiresAt: Date) {
    const cachedAt = new Date();
    await this.prisma.routeCaching.upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, value: value as object, cachedAt, expiresAt },
      update: { value: value as object, cachedAt, expiresAt },
    });
  }

  protected async findManyByKeys(keys: string[]) {
    const rows = await this.prisma.routeCaching.findMany({
      where: { cacheKey: { in: keys } },
    });
    return rows.map((r) => ({
      key: r.cacheKey,
      value: r.value,
      cachedAt: r.cachedAt,
      expiresAt: r.expiresAt,
    }));
  }

  protected async upsertMany(
    items: Array<{ key: string; value: T }>,
    expiresAt: Date,
  ) {
    const cachedAt = new Date();
    const CHUNK = 200;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const values = chunk.map(
        (it) =>
          Prisma.sql`(${it.key}, ${JSON.stringify(it.value)}::jsonb, ${cachedAt}, ${expiresAt})`,
      );
      await this.prisma.$executeRaw`
        INSERT INTO "route_caching" ("cache_key", "value", "cached_at", "expires_at")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("cache_key") DO UPDATE SET
          "value" = EXCLUDED."value",
          "cached_at" = EXCLUDED."cached_at",
          "expires_at" = EXCLUDED."expires_at"
      `;
    }
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
