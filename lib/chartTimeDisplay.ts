/**
 * Client-safe formatting of chart-preparation times for display.
 *
 * Chart times are stored as a local `HH:MM` plus a day offset from the train's
 * start date (0 = same day, 1 = next day…). How we render them depends on
 * whether the visitor picked a train-start date (`?date=`, the Day-1 origin
 * departure):
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

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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
 * `journeyDateYmd` is the train-start date (Day-1 origin departure) and makes
 * the output an absolute date.
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

/**
 * Station-aware variant of {@link formatChartPrep} for the chart-times table.
 *
 * `dayOffset` is anchored at the TRAIN-START date (IRCTC chart date minus
 * trainStartDate, see `chartTimesFromCompositionResponse`), and `journeyDateYmd`
 * (`?date=`) is that same train-start date — the day the train leaves its
 * origin (Day 1). Every row in the table belongs to one physical run, so the
 * anchor is shared: chart date = train-start date + offset, regardless of the
 * station's own day count. A Day-2 station boards on train-start + 1, but its
 * chart (often prepared at the origin) is still dated from train-start.
 */
export function formatStationChartPrep(
  time: string | null | undefined,
  dayOffset: number | null | undefined,
  journeyDateYmd?: string | null,
  _stationDay?: number | null,
): string {
  return formatChartPrep(time, dayOffset, journeyDateYmd);
}

/** Shift a YYYY-MM-DD by `days` (UTC, so DST/midnight boundaries can't skew it). */
export function addYmdDays(ymd: string, days: number): string | null {
  const v = (ymd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, mo, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + Math.trunc(days)));
  return (
    `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-` +
    String(dt.getUTCDate()).padStart(2, "0")
  );
}

/** Boarding calendar date at a Day-N station for a run starting `trainStartYmd`. */
export function boardingYmdForStation(
  trainStartYmd: string | null | undefined,
  stationDay?: number | null,
): string | null {
  const v = (trainStartYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const day = Math.max(1, Math.trunc(Number(stationDay) || 1));
  return addYmdDays(v, day - 1);
}

/** Short boarding label (`2026-09-17` -> `17 Sep`) for the Day column. */
export function formatBoardingShort(
  stationDay: number | null | undefined,
  trainStartYmd?: string | null,
): string | null {
  const b = boardingYmdForStation(trainStartYmd, stationDay);
  if (!b) return null;
  const [y, mo, d] = b.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${dt.getUTCDate()} ${MONTHS_SHORT[dt.getUTCMonth()]}`;
}
