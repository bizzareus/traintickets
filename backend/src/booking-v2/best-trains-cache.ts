import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteCachingTableStore } from '../route-cache/route-caching-table.store';
import { canonicalStation } from './station-hubs';
import type { AlternatePathLeg } from './booking-v2.service';

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
 * Best-train route cache — a thin subclass over the shared `route_caching` table.
 * All caching behaviour and the table binding are inherited; this only fixes the
 * payload type and (via bestTrainsCacheKey) the key prefix.
 */
@Injectable()
export class BestTrainsRouteCache extends RouteCachingTableStore<CachedBestTrain> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
