import { apiClient } from "@/lib/api";

export type StationRow = {
  stationCode: string;
  stationName: string;
  city?: string;
  state?: string;
  [key: string]: unknown;
};

const MAX_CACHE_ENTRIES = 200;
const stationQueryCache = new Map<string, StationRow[]>();
const inflightRequests = new Map<string, Promise<StationRow[]>>();

function normalizeQuery(query: string): string {
  return (query || "").trim().toUpperCase();
}

/**
 * Synchronously retrieve cached station suggestions for an instant 0ms UI render.
 */
export function getCachedStationSuggestions(query: string): StationRow[] | undefined {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  return stationQueryCache.get(q);
}

/**
 * Fetch station suggestions with client-side memory caching and inflight deduplication.
 */
export async function fetchStationSuggestions(query: string): Promise<StationRow[]> {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];

  const cached = stationQueryCache.get(q);
  if (cached) return cached;

  const pending = inflightRequests.get(q);
  if (pending) return pending;

  const promise = apiClient
    .get<{ data?: { stationList?: StationRow[] } }>(
      "/api/booking-v2/stations/suggest",
      { params: { q, searchString: q } },
    )
    .then((r) => {
      const list = r.data?.data?.stationList ?? [];
      if (stationQueryCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = stationQueryCache.keys().next().value;
        if (oldestKey) stationQueryCache.delete(oldestKey);
      }
      stationQueryCache.set(q, list);
      return list;
    })
    .finally(() => {
      inflightRequests.delete(q);
    });

  inflightRequests.set(q, promise);
  return promise;
}
