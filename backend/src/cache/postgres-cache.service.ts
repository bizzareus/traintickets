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
    if (row.expiresAt && row.expiresAt <= new Date()) {
      // Expired — delete lazily (fire-and-forget)
      void this.prisma.cacheEntry
        .delete({ where: { key } })
        .catch(() => undefined);
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
