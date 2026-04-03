/**
 * Abstract cache service interface.
 *
 * Backed by PostgresCacheService (Postgres) today.
 * To migrate to Redis: create RedisCacheService implementing this abstract class
 * and swap the provider in cache.module.ts — all consumers get Redis automatically.
 */
export abstract class CacheService {
  abstract get<T>(key: string): Promise<T | null>;
  abstract set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  abstract del(key: string): Promise<void>;

  /**
   * Return the cached value for `key`, or call `factory`, cache the result, and return it.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }
}
