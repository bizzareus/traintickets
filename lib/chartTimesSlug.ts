/**
 * Client-safe slug helpers for chart-times pages (no filesystem / node deps),
 * so both the server data layer (`lib/chartTimes.ts`) and client components
 * (the train finder) can build/parse the same URLs.
 */

/** `Trivandrum Rajdhani Express` -> `trivandrum-rajdhani-express`. */
export function slugifyTrainName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** `12952` + `Mumbai Rajdhani` -> `12952-mumbai-rajdhani-chart-times`. */
export function buildChartTimesSlug(trainNumber: string, trainName: string): string {
  const num = String(trainNumber || "").trim();
  const namePart = slugifyTrainName(trainName);
  return namePart ? `${num}-${namePart}-chart-times` : `${num}-chart-times`;
}

/** Extract the leading train number from a chart-times slug (e.g. `12952-...-chart-times` -> `12952`). */
export function parseTrainNumberFromSlug(slug: string): string | null {
  const m = String(slug || "").match(/^(\d{3,6})(?:-|$)/);
  return m ? m[1] : null;
}
