import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteCachingTableStore } from '../route-cache/route-caching-table.store';
import type { FindAlternatePathsResult } from './booking-v2.service';

/**
 * Cache key for a per-train alternate-paths lookup. Includes the train's OD
 * (from/to are the train's start/end, matching how the frontend probes),
 * the train number, the requested class set, and the date — so a single-class
 * "Find in SL" and an all-classes "Search all classes" are cached separately.
 *
 * `avlClasses` is normalized to a stable `CLASSKEY`: sorted, de-duped, upper-cased
 * and comma-joined; an empty/omitted set (the default full-class scan) → "ALL".
 */
export function alternatePathsCacheKey(
  from: string,
  to: string,
  trainNumber: string,
  avlClasses: string[] | undefined,
  normalizedDate: string | null,
): string | null {
  const f = String(from ?? '')
    .trim()
    .toUpperCase();
  const t = String(to ?? '')
    .trim()
    .toUpperCase();
  const tn = String(trainNumber ?? '').trim();
  if (!f || !t || !tn || !normalizedDate) return null;

  const classes = (avlClasses ?? [])
    .map((c) =>
      String(c ?? '')
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
  const classKey = classes.length
    ? Array.from(new Set(classes)).sort().join(',')
    : 'ALL';

  return `alt-paths:v1:${f}:${t}:${tn}:${classKey}:${normalizedDate}`;
}

/**
 * Alternate-paths route cache — another thin subclass over the shared
 * `route_caching` table (distinct `alt-paths:` key prefix), so user-initiated
 * per-train/per-class lookups are cached alongside the best-train entries.
 */
@Injectable()
export class AlternatePathsRouteCache extends RouteCachingTableStore<FindAlternatePathsResult> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
