import { CacheService } from './cache.service';

/**
 * Process-local, non-persistent CacheService (a Map with TTLs). Used for the
 * best-seats cron's per-segment availability probes so a run dedupes probes in
 * memory and NEVER writes to the shared Postgres `cache_entry` table — the write
 * storm that exhausted the DB. Not a DI provider; instantiate per cron run.
 */
export class InMemoryCacheService extends CacheService {
  private readonly store = new Map<
    string,
    { value: unknown; expiresAt: number | null }
  >();

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt != null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [k, e] of this.store) {
      if (e.expiresAt != null && e.expiresAt <= now) {
        this.store.delete(k);
        removed += 1;
      }
    }
    return removed;
  }
}
