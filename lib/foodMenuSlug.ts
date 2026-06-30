/**
 * Client-safe slug helpers for IRCTC train food-menu pages (no fs/node deps),
 * so both the server data layer (`lib/trainFoodMenu.ts`) and client components
 * (the menu finder) build/parse the same URLs.
 *
 * Slug shape is name-first, number-last: `ndls-svdk-vande-bharat-express-22439`.
 */

/** `NDLS-SVDK Vande Bharat Express` -> `ndls-svdk-vande-bharat-express`. */
export function slugifyTrainName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** `NDLS-SVDK Vande Bharat Express` + `22439` -> `ndls-svdk-vande-bharat-express-22439`. */
export function buildFoodMenuSlug(trainName: string, trainNumber: string): string {
  const namePart = slugifyTrainName(trainName);
  const num = String(trainNumber || "").trim();
  return namePart ? `${namePart}-${num}` : num;
}

/** Extract the trailing train number from a food-menu slug. */
export function parseTrainNumberFromFoodSlug(slug: string): string | null {
  const m = String(slug || "").match(/(\d{3,6})$/);
  return m ? m[1] : null;
}
