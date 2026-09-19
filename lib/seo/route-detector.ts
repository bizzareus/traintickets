export type DetectedRoute = {
  fromCode: string;
  toCode: string;
  fromName: string;
  toName: string;
  routeSlug: string;
  label: string;
};

export type BlogIntentType = "festival" | "waitlist" | "charting" | "vandebharat" | "general";

export type RouteCtaContext = {
  intentType: BlogIntentType;
  primaryRoute?: DetectedRoute;
  popularRoutes: DetectedRoute[];
};

export const POPULAR_DEFAULT_ROUTES: DetectedRoute[] = [
  { fromCode: "NDLS", toCode: "MMCT", fromName: "New Delhi", toName: "Mumbai Central", routeSlug: "delhi-to-mumbai", label: "Delhi ➔ Mumbai" },
  { fromCode: "NDLS", toCode: "PNBE", fromName: "New Delhi", toName: "Patna Jn", routeSlug: "delhi-to-patna", label: "Delhi ➔ Patna" },
  { fromCode: "MMCT", toCode: "SBC", fromName: "Mumbai Central", toName: "KSR Bengaluru", routeSlug: "mumbai-to-bengaluru", label: "Mumbai ➔ Bengaluru" },
  { fromCode: "MAS", toCode: "SBC", fromName: "Chennai Central", toName: "KSR Bengaluru", routeSlug: "chennai-to-bengaluru", label: "Chennai ➔ Bengaluru" },
  { fromCode: "HWH", toCode: "NDLS", fromName: "Howrah", toName: "New Delhi", routeSlug: "kolkata-to-delhi", label: "Kolkata ➔ Delhi" },
];

export const FESTIVAL_SPECIAL_ROUTES: DetectedRoute[] = [
  { fromCode: "NDLS", toCode: "PNBE", fromName: "New Delhi", toName: "Patna Jn", routeSlug: "delhi-to-patna", label: "Delhi ➔ Patna" },
  { fromCode: "MMCT", toCode: "DNR", fromName: "Mumbai Central", toName: "Danapur", routeSlug: "mumbai-to-danapur", label: "Mumbai ➔ Danapur" },
  { fromCode: "PUNE", toCode: "DNR", fromName: "Pune Jn", toName: "Danapur", routeSlug: "pune-to-danapur", label: "Pune ➔ Danapur" },
  { fromCode: "NDLS", toCode: "DBG", fromName: "New Delhi", toName: "Darbhanga", routeSlug: "delhi-to-darbhanga", label: "Delhi ➔ Darbhanga" },
  { fromCode: "ST", toCode: "PNBE", fromName: "Surat", toName: "Patna Jn", routeSlug: "surat-to-patna", label: "Surat ➔ Patna" },
];

export const VANDE_BHARAT_ROUTES: DetectedRoute[] = [
  { fromCode: "NDLS", toCode: "BSB", fromName: "New Delhi", toName: "Varanasi Jn", routeSlug: "delhi-to-varanasi", label: "Delhi ➔ Varanasi" },
  { fromCode: "NDLS", toCode: "JAT", fromName: "New Delhi", toName: "Jammu Tawi", routeSlug: "delhi-to-jammu", label: "Delhi ➔ Katra / Jammu" },
  { fromCode: "MMCT", toCode: "MAO", fromName: "Mumbai Central", toName: "Madgaon Goa", routeSlug: "mumbai-to-goa", label: "Mumbai ➔ Goa" },
  { fromCode: "MAS", toCode: "SBC", fromName: "Chennai Central", toName: "KSR Bengaluru", routeSlug: "chennai-to-bengaluru", label: "Chennai ➔ Bengaluru" },
  { fromCode: "HWH", toCode: "PURI", fromName: "Howrah", toName: "Puri", routeSlug: "kolkata-to-puri", label: "Howrah ➔ Puri" },
];

/**
 * Fast, deterministic route context detector.
 * Scans slug, title, and tags to detect specific corridors and user intent.
 */
export function detectRouteContext(slug: string, title?: string, tags: string[] = []): RouteCtaContext {
  const combined = `${slug} ${title || ""} ${tags.join(" ")}`.toLowerCase();

  // 1. Festival / Special Train Intent (Chhath, Diwali, Holiday specials)
  if (combined.includes("chhath") || combined.includes("diwali") || combined.includes("festival") || combined.includes("special-train") || combined.includes("bihar")) {
    return {
      intentType: "festival",
      primaryRoute: FESTIVAL_SPECIAL_ROUTES[0], // Delhi to Patna
      popularRoutes: FESTIVAL_SPECIAL_ROUTES,
    };
  }

  // 2. Vande Bharat Intent
  if (combined.includes("vande-bharat") || combined.includes("vande bharat")) {
    return {
      intentType: "vandebharat",
      primaryRoute: VANDE_BHARAT_ROUTES[0], // Delhi to Varanasi
      popularRoutes: VANDE_BHARAT_ROUTES,
    };
  }

  // 3. Charting & Vacant Berth Intent
  if (combined.includes("chart") || combined.includes("curr_avbl") || combined.includes("current-availab") || combined.includes("vacant")) {
    return {
      intentType: "charting",
      popularRoutes: POPULAR_DEFAULT_ROUTES,
    };
  }

  // 4. Waitlist & Confirmation Intent
  if (combined.includes("waiting") || combined.includes("wl") || combined.includes("rac") || combined.includes("confirm") || combined.includes("regret") || combined.includes("pnr")) {
    return {
      intentType: "waitlist",
      popularRoutes: POPULAR_DEFAULT_ROUTES,
    };
  }

  // 5. Default General Travel Intent
  return {
    intentType: "general",
    popularRoutes: POPULAR_DEFAULT_ROUTES,
  };
}
