/**
 * Pure helpers shared by the alternate-paths renderer and `app/(main)/page.tsx`.
 *
 * Extracted from page.tsx so `AlternatePathContent`/`SearchPnrPanel` and the
 * homepage can both use them without duplicating declarations.
 */

import moment from "moment";
import type { AlternateLeg } from "./alternatePathsTypes";

export const MONITOR_CONTACT_STORAGE_KEY = "lastBerth_monitor_contact";
export const LEG_ALERT_STORAGE_PREFIX = "lastBerth_leg_alert_";
export const IST_UTC_OFFSET_MINUTES = 330;

export function legAlertKey(
  trainNumber: string,
  from: string,
  to: string,
  date: string,
): string {
  const raw = `${trainNumber.trim()}|${from.trim().toUpperCase()}|${to.trim().toUpperCase()}|${date.trim().slice(0, 10)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `${LEG_ALERT_STORAGE_PREFIX}${Math.abs(hash).toString(36)}`;
}

export function isLegAlertSet(
  trainNumber: string,
  from: string,
  to: string,
  date: string,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(legAlertKey(trainNumber, from, to, date)) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function markLegAlertSet(
  trainNumber: string,
  from: string,
  to: string,
  date: string,
): void {
  try {
    window.localStorage.setItem(legAlertKey(trainNumber, from, to, date), "1");
  } catch {
    /* ignore */
  }
}

export function parseChartDateTimeIst(
  ymd: string,
  time: string,
  addDays: number,
): moment.Moment | null {
  const datePart = ymd.trim().slice(0, 10);
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !match) return null;
  const chartMoment = moment
    .parseZone(`${datePart}T${match[1].padStart(2, "0")}:${match[2]}:00+05:30`)
    .add(addDays, "days");
  return chartMoment.isValid() ? chartMoment : null;
}

export function chartMomentHasPassedIst(chartMoment: moment.Moment): boolean {
  return Date.now() > chartMoment.valueOf();
}

export function formatChartMomentIst(chartMoment: moment.Moment): string {
  return chartMoment
    .clone()
    .utcOffset(IST_UTC_OFFSET_MINUTES)
    .format("ddd, MMM DD [at] h:mm A");
}

/** Convert 24h "HH:MM" to 12h "h:mm A" using moment. Returns original if parsing fails. */
export function formatTimeAmPm(time: string | null | undefined): string | null {
  if (!time?.trim()) return null;
  const m = moment(time.trim(), "HH:mm", true);
  return m.isValid() ? m.format("h:mm A") : time.trim();
}

export function formatDurationMinutes(mins: number | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function getStationDisplayName(
  code: string,
  map?: Record<string, string>,
): string {
  if (!code) return code;
  const name = map?.[code.trim().toUpperCase()];
  if (name) return `${name} (${code})`;
  return code;
}

export function collapsedAlternatePathTimingSummary(legs: AlternateLeg[]): {
  timePart: string | null;
  durationLabel: string | null;
} | null {
  if (legs.length === 0) return null;
  const dep = formatTimeAmPm(legs[0]?.departureTime);
  const arr = formatTimeAmPm(legs[legs.length - 1]?.arrivalTime);
  const allDur = legs.every(
    (l) =>
      l.durationMinutes != null && !Number.isNaN(l.durationMinutes as number),
  );
  const totalMins = allDur
    ? legs.reduce((s, l) => s + (l.durationMinutes as number), 0)
    : null;
  let timePart: string | null = null;
  if (dep && arr) timePart = `${dep} → ${arr}`;
  else if (dep) timePart = `Dep ${dep}`;
  else if (arr) timePart = `Arr ${arr}`;
  const durationLabel =
    totalMins != null ? formatDurationMinutes(totalMins) : null;
  if (!timePart && !durationLabel) return null;
  return { timePart, durationLabel };
}
