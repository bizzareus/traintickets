export type Station = {
  code: string;
  name: string;
  slug: string;
};

export type RouteData = {
  origin: Station;
  destination: Station;
  originCity: string;
  destinationCity: string;
  trainNumbers: string[];
};

export const STATIONS: Station[] = [
  { code: "NDLS", name: "New Delhi", slug: "delhi" },
  { code: "MMCT", name: "Mumbai Central", slug: "mumbai" },
  { code: "HWH", name: "Howrah", slug: "kolkata" },
  { code: "MAS", name: "Chennai Central", slug: "chennai" },
  { code: "SBC", name: "KSR Bengaluru", slug: "bengaluru" },
  { code: "PNBE", name: "Patna Jn", slug: "patna" },
  { code: "DNR", name: "Danapur", slug: "danapur" },
  { code: "PUNE", name: "Pune Jn", slug: "pune" },
  { code: "BSB", name: "Varanasi Jn", slug: "varanasi" },
  { code: "LKO", name: "Lucknow Charbagh", slug: "lucknow" },
  { code: "SC", name: "Secunderabad", slug: "hyderabad" },
  { code: "ADI", name: "Ahmedabad", slug: "ahmedabad" },
  { code: "JAT", name: "Jammu Tawi", slug: "jammu" },
  { code: "MAO", name: "Madgaon Goa", slug: "goa" },
  { code: "PURI", name: "Puri", slug: "puri" },
  { code: "ST", name: "Surat", slug: "surat" },
  { code: "DBG", name: "Darbhanga", slug: "darbhanga" },
  { code: "CDG", name: "Chandigarh", slug: "chandigarh" },
];

const ROUTE_TRAINS: Record<string, string[]> = {
  "delhi-to-mumbai": ["12952", "12954"],
  "delhi-to-patna": ["12310", "12394"],
  "mumbai-to-danapur": ["12141", "12336"],
  "pune-to-danapur": ["12149"],
  "delhi-to-varanasi": ["22436", "12560"],
  "mumbai-to-bengaluru": ["11301", "11013"],
  "chennai-to-bengaluru": ["12007", "12027", "12607"],
  "kolkata-to-delhi": ["12301", "12381"],
  "delhi-to-kolkata": ["12302", "12314"],
  "bengaluru-to-chennai": ["12008", "12028", "12608"],
  "delhi-to-jammu": ["12425", "12445"],
  "mumbai-to-ahmedabad": ["12009", "12931"],
  "delhi-to-lucknow": ["12004", "12230"],
  "mumbai-to-goa": ["22229", "10103"],
  "kolkata-to-puri": ["22895", "12837"],
  "mumbai-to-delhi": ["12951", "12953"],
  "patna-to-delhi": ["12309", "12393"],
};

export function isPublishedRoute(slug: string): boolean {
  return Object.hasOwn(ROUTE_TRAINS, slug);
}

// Performance Optimization: Map lookup is O(1) compared to STATIONS.find which is O(N) per station scan.
const STATION_BY_SLUG = new Map<string, Station>(
  STATIONS.map((s) => [s.slug, s]),
);

const STATION_BY_CODE = new Map<string, Station>(
  STATIONS.map((s) => [s.code.toUpperCase(), s]),
);

const STATION_BY_LOWER_NAME = new Map<string, Station>(
  STATIONS.map((s) => [s.name.toLowerCase(), s]),
);

/**
 * Performance Optimization: Finds a station by exact code match or exact lowercase name match in O(1) time first,
 * falling back to case-insensitive name inclusion match if code or exact name is not found.
 */
export function getStationByCodeOrName(
  stationCodeOrName: string,
): Station | undefined {
  if (!stationCodeOrName) return undefined;
  const upper = stationCodeOrName.trim().toUpperCase();
  const byCode = STATION_BY_CODE.get(upper);
  if (byCode) return byCode;

  const lower = stationCodeOrName.trim().toLowerCase();
  const byName = STATION_BY_LOWER_NAME.get(lower);
  if (byName) return byName;

  return STATIONS.find((s) => s.name.toLowerCase().includes(lower));
}

export async function getRouteData(
  originSlug: string,
  destSlug: string,
): Promise<RouteData | null> {
  const origin = STATION_BY_SLUG.get(originSlug);
  const dest = STATION_BY_SLUG.get(destSlug);
  const trainNumbers = ROUTE_TRAINS[`${originSlug}-to-${destSlug}`];
  if (!origin || !dest || !trainNumbers) return null;

  return {
    origin,
    destination: dest,
    originCity: originSlug[0].toUpperCase() + originSlug.slice(1),
    destinationCity: destSlug[0].toUpperCase() + destSlug.slice(1),
    trainNumbers,
  };
}

export async function getTopRoutes(): Promise<
  { origin: string; dest: string }[]
> {
  return Object.keys(ROUTE_TRAINS).map((slug) => {
    const [origin, dest] = slug.split("-to-");
    return { origin, dest };
  });
}
