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
  topTrains: { number: string; name: string }[];
  waitingListChance: "High" | "Medium" | "Low";
  popularBookingWindowDays: number;
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

const ROUTE_TRAINS: Record<string, { number: string; name: string }[]> = {
  "delhi-to-mumbai": [
    { number: "12952", name: "Mumbai Rajdhani Express" },
    { number: "12954", name: "August Kranti Tejas Rajdhani" },
  ],
  "mumbai-to-delhi": [
    { number: "12951", name: "Mumbai Rajdhani Express" },
    { number: "12953", name: "August Kranti Tejas Rajdhani" },
  ],
  "delhi-to-patna": [
    { number: "12310", name: "Patna Rajdhani Express" },
    { number: "12394", name: "Sampoorna Kranti Express" },
  ],
  "patna-to-delhi": [
    { number: "12309", name: "Patna Rajdhani Express" },
    { number: "12393", name: "Sampoorna Kranti Express" },
  ],
  "mumbai-to-danapur": [
    { number: "12141", name: "Mumbai LTT Patliputra Express" },
    { number: "12336", name: "Bhagalpur Express" },
  ],
  "pune-to-danapur": [
    { number: "12149", name: "Pune Danapur SF Express" },
  ],
  "delhi-to-varanasi": [
    { number: "22436", name: "Vande Bharat Express" },
    { number: "12560", name: "Shiv Ganga Express" },
  ],
  "mumbai-to-bengaluru": [
    { number: "11301", name: "Udyan Express" },
    { number: "11013", name: "Mumbai LTT Coimbatore Express" },
  ],
  "chennai-to-bengaluru": [
    { number: "12007", name: "Chennai KSR Bengaluru Shatabdi Express" },
    { number: "12027", name: "Chennai KSR Bengaluru Shatabdi Express" },
    { number: "12607", name: "Lalbagh Express" },
  ],
  "kolkata-to-delhi": [
    { number: "12301", name: "Howrah Rajdhani Express" },
    { number: "12381", name: "Poorva Express" },
  ],
  "delhi-to-kolkata": [
    { number: "12302", name: "Howrah Rajdhani Express" },
    { number: "12314", name: "Sealdah Rajdhani Express" },
  ],
  "bengaluru-to-chennai": [
    { number: "12008", name: "KSR Bengaluru Chennai Shatabdi Express" },
    { number: "12028", name: "KSR Bengaluru Chennai Shatabdi Express" },
    { number: "12608", name: "Lalbagh Express" },
  ],
  "delhi-to-jammu": [
    { number: "12425", name: "New Delhi Jammu Tawi Rajdhani Express" },
    { number: "12445", name: "Uttar Sampark Kranti Express" },
  ],
  "mumbai-to-ahmedabad": [
    { number: "12009", name: "Mumbai Central Ahmedabad Shatabdi Express" },
    { number: "12931", name: "Mumbai Central Ahmedabad Double Decker Express" },
  ],
  "delhi-to-lucknow": [
    { number: "12004", name: "Lucknow Swarna Shatabdi Express" },
    { number: "12230", name: "Lucknow Mail" },
  ],
  "mumbai-to-goa": [
    { number: "22229", name: "Mumbai CSMT Madgaon Vande Bharat Express" },
    { number: "10103", name: "Mandovi Express" },
  ],
  "kolkata-to-puri": [
    { number: "22895", name: "Howrah Puri Vande Bharat Express" },
    { number: "12837", name: "Howrah Puri Express" },
  ],
};

// In a real application, this would query the PostgreSQL database via Prisma
export async function getRouteData(originSlug: string, destSlug: string): Promise<RouteData | null> {
  const origin = STATIONS.find((s) => s.slug === originSlug);
  const dest = STATIONS.find((s) => s.slug === destSlug);

  if (!origin || !dest || origin.slug === dest.slug) return null;

  const key = `${origin.slug}-to-${dest.slug}`;
  const topTrains = ROUTE_TRAINS[key] || [
    { number: "12958", name: "Swran J Rajdhani Express" },
    { number: "12001", name: "New Delhi Bhopal Shatabdi Express" },
  ];

  // Pseudo-random generation based on station codes for demo purposes
  const distance = (origin.code.charCodeAt(0) * dest.code.charCodeAt(1)) % 2000 + 500;
  
  return {
    origin,
    destination: dest,
    distanceKm: distance,
    averageTrainsPerDay: (distance % 10) + 2,
    topTrains,
    waitingListChance: distance > 1500 ? "High" : "Medium",
    popularBookingWindowDays: (distance % 30) + 15,
  };
}

export async function getTopRoutes(): Promise<{ origin: string; dest: string }[]> {
  return [
    { origin: "delhi", dest: "mumbai" },
    { origin: "delhi", dest: "patna" },
    { origin: "mumbai", dest: "danapur" },
    { origin: "pune", dest: "danapur" },
    { origin: "delhi", dest: "varanasi" },
    { origin: "mumbai", dest: "bengaluru" },
    { origin: "chennai", dest: "bengaluru" },
    { origin: "kolkata", dest: "delhi" },
    { origin: "delhi", dest: "kolkata" },
    { origin: "bengaluru", dest: "chennai" },
    { origin: "delhi", dest: "jammu" },
    { origin: "mumbai", dest: "ahmedabad" },
    { origin: "delhi", dest: "lucknow" },
    { origin: "mumbai", dest: "goa" },
    { origin: "kolkata", dest: "puri" },
  ];
}

