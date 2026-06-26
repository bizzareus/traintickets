/**
 * Client-safe formatting of chart-preparation times for display.
 *
 * Chart times are stored as a local `HH:MM` plus a day offset from the train's
 * start date (0 = same day, 1 = next day…). How we render them depends on
 * whether the visitor picked a journey date:
 *   - date picked  -> absolute calendar date, e.g. "2nd July 2026 at 10 PM"
 *   - no date       -> relative,            e.g. "Same day at 10 PM" / "Next day at 10 PM"
 *   - no chart time -> "NA"
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** `16:40` -> `4:40 PM`, `22:00` -> `10 PM`. */
export function formatClock12h(hhmm: string): string {
  return to12Hour(hhmm);
}

/** `16:40` -> `4:40 PM`, `22:00` -> `10 PM`. */
function to12Hour(hhmm: string): string {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm.trim();
  const h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = h >= 12 ? "PM" : "AM";
  let hr = h % 12;
  if (hr === 0) hr = 12;
  return min === 0 ? `${hr} ${ampm}` : `${hr}:${String(min).padStart(2, "0")} ${ampm}`;
}

function relativeDayLabel(offset: number): string {
  if (offset <= 0) return "Same day";
  if (offset === 1) return "Next day";
  return `+${offset} days`;
}

/**
 * Format a chart preparation time for display, returning "NA" when no time is set.
 * `journeyDateYmd` (the train's start/journey date) makes the output an absolute date.
 */
export function formatChartPrep(
  time: string | null | undefined,
  dayOffset: number | null | undefined,
  journeyDateYmd?: string | null,
): string {
  const t = (time ?? "").trim();
  if (!t) return "NA";
  const clock = to12Hour(t);
  const offset = dayOffset ?? 0;

  const ymd = (journeyDateYmd ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, mo, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d + offset));
    return `${ordinal(dt.getUTCDate())} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()} at ${clock}`;
  }
  return `${relativeDayLabel(offset)} at ${clock}`;
}
