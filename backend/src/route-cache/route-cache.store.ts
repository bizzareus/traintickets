import { Logger } from '@nestjs/common';

/** A stored cache row: the trimmed payload plus when it was written. */
export type RouteCacheRecord<T> = {
  value: T;
  cachedAt: Date;
  expiresAt: Date;
};

/**
 * Reusable JSON route-cache pattern.
 *
 * All caching/TTL/expiry logic lives here once; each concrete cache *type*
 * (best-trains now, class-level later) is a thin subclass that implements the
 * three Prisma hooks against **its own table** and supplies its own key builder
 * and payload type. This keeps the store swappable per cache family while the
 * behaviour (lazy-expiry reads, TTL writes, getOrCompute) stays identical.
 *
 * Backed by Postgres, so every Railway replica shares the same cache — writes by
 * the leader-elected cron are immediately readable by all replicas' request paths.
 */
export abstract class RouteCacheStore<T> {
  protected readonly logger = new Logger(this.constructor.name);

  /** Fetch the raw row for `key`, or null when absent. Implemented per table. */
  protected abstract findByKey(
    key: string,
  ): Promise<{ value: unknown; cachedAt: Date; expiresAt: Date } | null>;

  /** Insert-or-replace the row for `key`. Implemented per table. */
  protected abstract upsert(
    key: string,
    value: T,
    expiresAt: Date,
  ): Promise<void>;

  /** Remove the row for `key` (no-op if already gone). Implemented per table. */
  protected abstract deleteByKey(key: string): Promise<void>;

  /**
   * Full record (value + age metadata) for `key`, or null on miss. An expired
   * row is treated as a miss and lazily deleted (fire-and-forget). The `cachedAt`
   * lets callers (e.g. a refresh cron) judge staleness without a second query.
   */
  async getRecord(key: string): Promise<RouteCacheRecord<T> | null> {
    let row: { value: unknown; cachedAt: Date; expiresAt: Date } | null;
    try {
      row = await this.findByKey(key);
    } catch (e) {
      this.logger.warn(
        `route-cache read failed key=${key}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    if (!row) return null;
    if (row.expiresAt <= new Date()) {
      void this.deleteByKey(key).catch(() => undefined);
      return null;
    }
    return {
      value: row.value as T,
      cachedAt: row.cachedAt,
      expiresAt: row.expiresAt,
    };
  }

  /** Cached value for `key`, or null on miss/expiry. */
  async get(key: string): Promise<T | null> {
    const record = await this.getRecord(key);
    return record ? record.value : null;
  }

  /** Persist `value` under `key` with a TTL (ms from now). */
  async set(key: string, value: T, ttlMs: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.upsert(key, value, expiresAt);
  }

  /** Return the cached value, or compute it via `factory`, cache it, and return it. */
  async getOrCompute(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const hit = await this.get(key);
    if (hit !== null) return hit;
    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  /** Remove the cached row for `key`. */
  async del(key: string): Promise<void> {
    await this.deleteByKey(key);
  }
}
