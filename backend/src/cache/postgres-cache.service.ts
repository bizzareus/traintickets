import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from './cache.service';

@Injectable()
export class PostgresCacheService extends CacheService {
  private readonly logger = new Logger(PostgresCacheService.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async get<T>(key: string): Promise<T | null> {
    const row = await this.prisma.cacheEntry.findUnique({ where: { key } });
    if (!row) return null;
    // Treat an expired row as a miss, but do NOT delete it here — a per-read
    // DELETE on every expired hit was ~12% of all DB time. A hot key gets
    // overwritten by the next set() (upsert); cold expired rows are reaped in
    // bulk by deleteExpired() (see the best-seats cron).
    if (row.expiresAt && row.expiresAt <= new Date()) {
      return null;
    }
    return row.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
    await this.prisma.cacheEntry.upsert({
      where: { key },
      create: { key, value: value as object, expiresAt },
      update: { value: value as object, expiresAt, updatedAt: new Date() },
    });
  }

  async deleteExpired(): Promise<number> {
    const res = await this.prisma.cacheEntry.deleteMany({
      where: { expiresAt: { not: null, lt: new Date() } },
    });
    if (res.count > 0) {
      this.logger.log(`[cache] swept ${res.count} expired cache_entry rows`);
    }
    return res.count;
  }

  async del(key: string): Promise<void> {
    await this.prisma.cacheEntry
      .delete({ where: { key } })
      .catch((e: unknown) => {
        // Ignore not-found; re-throw unexpected errors
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: string }).code === 'P2025'
        )
          return;
        this.logger.error(`cache del failed key=${key}`, e);
      });
  }
}
