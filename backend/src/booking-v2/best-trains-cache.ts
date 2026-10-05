import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteCachingTableStore } from '../route-cache/route-caching-table.store';
import { canonicalStation } from './station-hubs';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';
import type { AlternatePathLeg } from './booking-v2.service';
import type { RouteCacheRecord } from '../route-cache/route-cache.store';

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
      /** Station code -> display name for every code used in `legs`. */
      stationNames: Record<string, string>;
      totalFare: number | null;
      isComplete: boolean;
      rankReason: string;
    }
  | { found: false };

/**
 * Cache key for the best-train-per-route lookup — the single source of truth for
 * the key. from/to are canonicalized to their city hub (see canonicalStation), so
 * every sibling station in a city shares one entry: a cached NDLS->MMCT result
 * also serves DEE->BDTS, NZM->BCT, etc. Returns null when the date can't be
 * normalized so callers treat it as an un-cacheable/un-lookable input.
 */
export function bestTrainsCacheKey(
  from: string,
  to: string,
  normalizedDate: string | null,
): string | null {
  const f = canonicalStation(from);
  const t = canonicalStation(to);
  if (!f || !t || !normalizedDate) return null;
  return `best-trains:v2:${f}:${t}:${normalizedDate}`;
}

/**
 * Best-train route cache — caches best-train entries in DynamoDB with PostgreSQL fallback.
 */
@Injectable()
export class BestTrainsRouteCache extends RouteCachingTableStore<CachedBestTrain> {
  constructor(
    prisma: PrismaService,
    @Optional() private readonly dynamoDb?: DynamoDbSeatCacheService,
  ) {
    super(prisma);
  }

  /** Override set to save in DynamoDB and PostgreSQL */
  override async set(
    key: string,
    value: CachedBestTrain,
    ttlMs: number,
  ): Promise<void> {
    if (this.dynamoDb?.isAvailable) {
      try {
        const parts = key.split(':');
        // Format: best-trains:v2:FROM:TO:DATE
        if (parts.length >= 5) {
          const from = parts[2];
          const to = parts[3];
          const date = parts[4];
          const ttlSeconds = Math.max(60, Math.floor(ttlMs / 1000));
          await this.dynamoDb.saveBestTrain(
            from,
            to,
            date,
            value as unknown as Record<string, unknown>,
            ttlSeconds,
          );
        }
      } catch (e) {
        this.logger.warn(
          `Failed saving best train to DynamoDB: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    await super.set(key, value, ttlMs);
  }

  /** Override setMany to save in DynamoDB and PostgreSQL */
  override async setMany(
    items: Array<{ key: string; value: CachedBestTrain }>,
    ttlMs: number,
  ): Promise<void> {
    if (this.dynamoDb?.isAvailable) {
      const ttlSeconds = Math.max(60, Math.floor(ttlMs / 1000));
      for (const item of items) {
        try {
          const parts = item.key.split(':');
          if (parts.length >= 5) {
            const from = parts[2];
            const to = parts[3];
            const date = parts[4];
            await this.dynamoDb.saveBestTrain(
              from,
              to,
              date,
              item.value as unknown as Record<string, unknown>,
              ttlSeconds,
            );
          }
        } catch {
          // best-effort
        }
      }
    }

    await super.setMany(items, ttlMs);
  }

  /** Override getRecord to read from DynamoDB first, falling back to PostgreSQL */
  override async getRecord(
    key: string,
  ): Promise<RouteCacheRecord<CachedBestTrain> | null> {
    if (this.dynamoDb?.isAvailable) {
      try {
        const parts = key.split(':');
        if (parts.length >= 5) {
          const from = parts[2];
          const to = parts[3];
          const date = parts[4];
          const record = await this.dynamoDb.getBestTrain(from, to, date);
          if (record) {
            return {
              value: record.value as CachedBestTrain,
              cachedAt: record.cachedAt,
              expiresAt: record.expiresAt,
            };
          }
        }
      } catch (e) {
        this.logger.warn(
          `Failed reading best train from DynamoDB: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return super.getRecord(key);
  }
}
