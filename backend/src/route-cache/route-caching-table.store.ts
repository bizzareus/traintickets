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
