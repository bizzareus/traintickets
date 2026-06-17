export type Station = {
  code: string;
  name: string;
  slug: string;
};

export type RouteData = {
  origin: Station;
  destination: Station;
  distanceKm: number;
  averageTrainsPerDay: number;
  topTrains: string[];
  waitingListChance: "High" | "Medium" | "Low";
  popularBookingWindowDays: number;
};

const STATIONS: Station[] = [
  { code: "NDLS", name: "New Delhi", slug: "delhi" },
  { code: "MMCT", name: "Mumbai Central", slug: "mumbai" },
  { code: "HWH", name: "Howrah", slug: "kolkata" },
  { code: "MAS", name: "Chennai Central", slug: "chennai" },
  { code: "SBC", name: "KSR Bengaluru", slug: "bengaluru" },
  { code: "PNBE", name: "Patna Jn", slug: "patna" },
];

// In a real application, this would query the PostgreSQL database via Prisma
export async function getRouteData(originSlug: string, destSlug: string): Promise<RouteData | null> {
  const origin = STATIONS.find((s) => s.slug === originSlug);
  const dest = STATIONS.find((s) => s.slug === destSlug);

  if (!origin || !dest || origin.slug === dest.slug) return null;

  // Pseudo-random generation based on station codes for demo purposes
  const distance = (origin.code.charCodeAt(0) * dest.code.charCodeAt(1)) % 2000 + 500;
  
  return {
    origin,
    destination: dest,
    distanceKm: distance,
    averageTrainsPerDay: (distance % 10) + 2,
    topTrains: [`${(distance % 9000) + 10000} Express`, `${(distance % 8000) + 20000} Superfast`],
    waitingListChance: distance > 1500 ? "High" : "Medium",
    popularBookingWindowDays: (distance % 30) + 15,
  };
}

export async function getTopRoutes(): Promise<{ origin: string; dest: string }[]> {
  // Generate a few combinations
  return [
    { origin: "delhi", dest: "mumbai" },
    { origin: "delhi", dest: "patna" },
    { origin: "mumbai", dest: "bengaluru" },
    { origin: "chennai", dest: "bengaluru" },
    { origin: "kolkata", dest: "delhi" },
  ];
}
