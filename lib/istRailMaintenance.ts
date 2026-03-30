/**
 * Indian Railways / IRCTC nightly maintenance is commonly advertised around
 * 11:45 PM – 12:20 AM IST. Uses Asia/Kolkata (no DST).
 */
const START_MINUTES_IST = 23 * 60 + 45; // 23:45
/** First minute after maintenance: 00:20 IST (services resume). */
const END_MINUTE_FROM_MIDNIGHT_IST = 20;

function getIstYmdHm(date: Date): {
  y: number;
  mo: number;
  d: number;
  h: number;
  min: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const v = (t: string) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? "NaN", 10);
  return {
    y: v("year"),
    mo: v("month"),
    d: v("day"),
    h: v("hour"),
    min: v("minute"),
  };
}

export function isIstIndianRailwaysNightlyMaintenanceWindow(
  date: Date = new Date(),
): boolean {
  const { h, min } = getIstYmdHm(date);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return false;
  const mins = h * 60 + min;
  return mins >= START_MINUTES_IST || mins < END_MINUTE_FROM_MIDNIGHT_IST;
}

/**
 * Whole minutes until 00:20 IST (exclusive end of maintenance). Only valid
 * while {@link isIstIndianRailwaysNightlyMaintenanceWindow} is true.
 */
export function getMinutesUntilIndianRailwaysMaintenanceEnds(
  date: Date = new Date(),
): number | null {
  if (!isIstIndianRailwaysNightlyMaintenanceWindow(date)) return null;
  const { y, mo, d, h, min } = getIstYmdHm(date);
  if (![y, mo, d, h, min].every((n) => Number.isFinite(n))) return 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const midnightIstMs = Date.parse(
    `${y}-${pad(mo)}-${pad(d)}T00:00:00+05:30`,
  );
  if (!Number.isFinite(midnightIstMs)) return 1;
  const minsNow = h * 60 + min;
  const endMs =
    minsNow >= START_MINUTES_IST
      ? midnightIstMs +
        24 * 60 * 60 * 1000 +
        END_MINUTE_FROM_MIDNIGHT_IST * 60 * 1000
      : midnightIstMs + END_MINUTE_FROM_MIDNIGHT_IST * 60 * 1000;
  const diffMin = Math.ceil((endMs - date.getTime()) / 60_000);
  return Math.max(1, diffMin);
}

/** UI string — keep aligned with 23:45–00:20 IST above. */
export const IST_NIGHTLY_MAINTENANCE_WINDOW_LABEL =
  "11:45 PM and 12:20 AM IST";

export function comebackInMinutesSentence(minutes: number): string {
  const n = Math.max(1, Math.floor(minutes));
  return `Come back in ${n} minute${n === 1 ? "" : "s"}.`;
}
