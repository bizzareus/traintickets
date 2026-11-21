/**
 * Route Linker: Automatically converts high-demand Indian Railways route mentions
 * in blog content into internal links pointing to /routes/[slug].
 *
 * Implements a single-pass regex scanner to avoid nested replacements and guarantee
 * zero link corruption or performance degradation.
 */
import { isPublishedRoute } from "./routes-db";

const ROUTE_PHRASE_MAP: Record<string, string> = {
  "delhi to mumbai": "delhi-to-mumbai",
  "delhi–mumbai": "delhi-to-mumbai",
  "delhi-mumbai": "delhi-to-mumbai",
  "mumbai to delhi": "mumbai-to-delhi",
  "mumbai–delhi": "mumbai-to-delhi",
  "delhi to patna": "delhi-to-patna",
  "delhi–patna": "delhi-to-patna",
  "delhi-patna": "delhi-to-patna",
  "anand vihar to patna": "delhi-to-patna",
  "anand vihar–patna": "delhi-to-patna",
  "patna to delhi": "patna-to-delhi",
  "patna–delhi": "patna-to-delhi",
  "mumbai to danapur": "mumbai-to-danapur",
  "mumbai–danapur": "mumbai-to-danapur",
  "pune to danapur": "pune-to-danapur",
  "pune–danapur": "pune-to-danapur",
  "delhi to varanasi": "delhi-to-varanasi",
  "delhi–varanasi": "delhi-to-varanasi",
  "mumbai to bengaluru": "mumbai-to-bengaluru",
  "mumbai–bengaluru": "mumbai-to-bengaluru",
  "mumbai to bangalore": "mumbai-to-bengaluru",
  "chennai to bengaluru": "chennai-to-bengaluru",
  "chennai–bengaluru": "chennai-to-bengaluru",
  "chennai to bangalore": "chennai-to-bengaluru",
  "kolkata to delhi": "kolkata-to-delhi",
  "kolkata–delhi": "kolkata-to-delhi",
  "delhi to kolkata": "delhi-to-kolkata",
  "delhi–kolkata": "delhi-to-kolkata",
  "bengaluru to chennai": "bengaluru-to-chennai",
  "bengaluru–chennai": "bengaluru-to-chennai",
  "delhi to jammu": "delhi-to-jammu",
  "delhi–jammu": "delhi-to-jammu",
  "mumbai to ahmedabad": "mumbai-to-ahmedabad",
  "mumbai–ahmedabad": "mumbai-to-ahmedabad",
  "delhi to lucknow": "delhi-to-lucknow",
  "delhi–lucknow": "delhi-to-lucknow",
  "mumbai to goa": "mumbai-to-goa",
  "mumbai–goa": "mumbai-to-goa",
  "kolkata to puri": "kolkata-to-puri",
  "kolkata–puri": "kolkata-to-puri",
  "mumbai to pune": "mumbai-to-pune",
  "mumbai–pune": "mumbai-to-pune",
  "pune to mumbai": "pune-to-mumbai",
  "pune–mumbai": "pune-to-mumbai",
  "ahmedabad to mumbai": "ahmedabad-to-mumbai",
  "ahmedabad–mumbai": "ahmedabad-to-mumbai",
  "mumbai to surat": "mumbai-to-surat",
  "mumbai–surat": "mumbai-to-surat",
  "surat to mumbai": "surat-to-mumbai",
  "surat–mumbai": "surat-to-mumbai",
  "delhi to chandigarh": "delhi-to-chandigarh",
  "delhi–chandigarh": "delhi-to-chandigarh",
  "chandigarh to delhi": "chandigarh-to-delhi",
  "chandigarh–delhi": "chandigarh-to-delhi",
  "delhi to amritsar": "delhi-to-amritsar",
  "delhi–amritsar": "delhi-to-amritsar",
  "amritsar to delhi": "amritsar-to-delhi",
  "amritsar–delhi": "amritsar-to-delhi",
  "delhi to kanpur": "delhi-to-kanpur",
  "delhi–kanpur": "delhi-to-kanpur",
  "kanpur to delhi": "kanpur-to-delhi",
  "kanpur–delhi": "kanpur-to-delhi",
  "varanasi to delhi": "varanasi-to-delhi",
  "varanasi–delhi": "varanasi-to-delhi",
  "lucknow to delhi": "lucknow-to-delhi",
  "lucknow–delhi": "lucknow-to-delhi",
  "bengaluru to hyderabad": "bengaluru-to-hyderabad",
  "bengaluru–hyderabad": "bengaluru-to-hyderabad",
  "hyderabad to bengaluru": "hyderabad-to-bengaluru",
  "hyderabad–bengaluru": "hyderabad-to-bengaluru",
  "delhi to jaipur": "delhi-to-jaipur",
  "delhi–jaipur": "delhi-to-jaipur",
  "jaipur to delhi": "jaipur-to-delhi",
  "jaipur–delhi": "jaipur-to-delhi",
  "kolkata to patna": "kolkata-to-patna",
  "kolkata–patna": "kolkata-to-patna",
  "patna to kolkata": "patna-to-kolkata",
  "patna–kolkata": "patna-to-kolkata",
};

let cachedRouteRegex: RegExp | null = null;

function getRouteRegex(): RegExp {
  if (cachedRouteRegex) return cachedRouteRegex;

  // Sort by length descending to match longer specific phrases first
  const phrases = Object.keys(ROUTE_PHRASE_MAP).sort(
    (a, b) => b.length - a.length,
  );
  const escaped = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // Match: code blocks (`...`), markdown links (`[...]`), headers (`#...`), or standalone route phrase
  cachedRouteRegex = new RegExp(
    `\`[^\`]*\`|\\[[^\\]]*\\]\\([^\\)]*\\)|^#{1,6}\\s+.*$|\\b(${escaped.join("|")})\\b`,
    "gim",
  );
  return cachedRouteRegex;
}

/**
 * Links up to 1 instance of each route phrase per article to prevent over-linking.
 */
export function autoLinkRoutes(markdown: string): string {
  if (!markdown) return markdown;

  const regex = getRouteRegex();
  const linkedRoutes = new Set<string>();

  return markdown.replace(regex, (match, routeMatch) => {
    // If not a captured route phrase, it was a code block, existing link, or header -> preserve as-is
    if (!routeMatch) return match;

    const lower = routeMatch.toLowerCase();
    const slug = ROUTE_PHRASE_MAP[lower];
    if (!slug || !isPublishedRoute(slug) || linkedRoutes.has(slug)) {
      return match;
    }

    // Only link first occurrence
    linkedRoutes.add(slug);
    return `[${match}](/routes/${slug})`;
  });
}
