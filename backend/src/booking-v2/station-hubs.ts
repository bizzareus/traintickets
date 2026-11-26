/**
 * City-hub grouping for the best-seats cache.
 *
 * Many metros have several stations (Delhi: NDLS/DLI/NZM/ANVT/DEE; Mumbai:
 * MMCT/CSMT/LTT/BDTS/DDR/BVI; ...). Keying the route cache by the exact station
 * code means a cached NDLS->MMCT entry never serves a DEE->BDTS search. To lift
 * the hit rate we canonicalize every sibling station to its city's PRIMARY code,
 * and build the cache key from those hubs — so one entry per city-pair serves all
 * station combinations within those cities.
 *
 * The primary of each group is the code used in the curated route list
 * (POPULAR_ROUTE_PAIRS), so the cron's computed entry naturally lands on the
 * canonical key. Extend HUB_MEMBERS as more multi-station metros matter.
 */
const HUB_MEMBERS: Record<string, readonly string[]> = {
  // Delhi
  NDLS: ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE', 'DSA', 'SZM', 'DSB'],
  // Mumbai
  MMCT: [
    'MMCT',
    'BCT',
    'CSMT',
    'CSTM',
    'LTT',
    'BDTS',
    'DDR',
    'DR',
    'BVI',
    'ADH',
  ],
  // Bengaluru
  SBC: ['SBC', 'YPR', 'SMVB', 'SMVT', 'BNC', 'BNCE', 'KJM'],
  // Chennai
  MAS: ['MAS', 'MS', 'MSB', 'TBM', 'MSC'],
  // Kolkata
  HWH: ['HWH', 'SDAH', 'KOAA', 'SRC', 'SHM'],
  // Secunderabad / Hyderabad
  SC: ['SC', 'HYB', 'KCG'],
  // Patna
  PNBE: ['PNBE', 'RJPB', 'PPTA'],
  // Ahmedabad
  ADI: ['ADI', 'SBIB'],
};

/** member station code -> primary hub code and full hub members list (built once from HUB_MEMBERS). */
const ALIAS_TO_PRIMARY: Record<string, string> = {};
const ALIAS_TO_MEMBERS: Record<string, readonly string[]> = {};
for (const [primary, members] of Object.entries(HUB_MEMBERS)) {
  for (const code of members) {
    ALIAS_TO_PRIMARY[code] = primary;
    ALIAS_TO_MEMBERS[code] = members;
  }
}

function normalizeCode(code: string): string {
  return String(code ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Canonical hub code for a station: the city's primary code when the station is a
 * known sibling, else the (normalized) code itself. Used to build the best-seats
 * cache key so every station in a city shares one cached entry.
 */
export function canonicalStation(code: string): string {
  const c = normalizeCode(code);
  return ALIAS_TO_PRIMARY[c] ?? c;
}

/** All sibling station codes in the same city hub (or `[code]` if standalone). */
export function hubMembers(code: string): readonly string[] {
  const c = normalizeCode(code);
  if (!c) return [];
  return ALIAS_TO_MEMBERS[c] ?? [c];
}

/** True when `code` is a non-primary sibling (i.e. canonicalizes to a different code). */
export function isNearbyStation(code: string): boolean {
  const c = normalizeCode(code);
  const primary = ALIAS_TO_PRIMARY[c];
  return primary != null && primary !== c;
}
