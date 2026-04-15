import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";

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

function parseYmdParts(ymd: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

/**
 * Journey calendar day + clock time, e.g. `2026-04-06` + `19:18` → `6 Apr, 19:18`.
 * `addCalendarDays` shifts the date (e.g. 1 when the second chart is the next day).
 */
function formatJourneyDayAndChartTime(
  journeyDateYmd: string,
  timeStr: string,
  addCalendarDays: number,
): string {
  const ymd = journeyDateYmd.trim().slice(0, 10);
  const parts = parseYmdParts(ymd);
  const t = timeStr.trim();
  if (!parts || !t) return t || ymd;
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + addCalendarDays));
  const day = dt.getUTCDate();
  const mon = MONTHS_SHORT[dt.getUTCMonth()];
  return `${day} ${mon}, ${t}`;
}

/** UTC calendar label for YYYY-MM-DD (matches booking v2 `formatDateLabel`). */
export function formatJourneyDateUtcLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, mo, d] = ymd.split("-").map(Number);
  const w = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
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
  ];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${w[dt.getUTCDay()]}, ${d} ${months[mo - 1]} ${y}`;
}

export type ChartPrepDescription = {
  /** e.g. `BL · Fri, 3 Apr 2026` */
  title: string;
  lines: string[];
};

/**
 * Human-readable chart preparation schedule for one station on the journey date.
 * Uses IRCTC/DB chart window times when present; otherwise explains missing data.
 */
export function describeChartPreparationForStation(
  meta: StationChartMetaItem | null | undefined,
  stationCode: string,
  journeyDateYmd: string,
): ChartPrepDescription {
  const code = stationCode.trim().toUpperCase();
  const dateLabel = formatJourneyDateUtcLabel(journeyDateYmd.trim().slice(0, 10));
  const title = `${code} · ${dateLabel}`;

  const ymd = journeyDateYmd.trim().slice(0, 10);
  const lines: string[] = [];
  const c1 = meta?.chartOneTime?.trim();
  const c2 = meta?.chartTwoTime?.trim();
  const c1Offset = meta?.chartOneDayOffset ?? 0;
  const c2Offset =
    meta?.chartTwoDayOffset !== null && meta?.chartTwoDayOffset !== undefined
      ? meta.chartTwoDayOffset
      : meta?.chartTwoIsNextDay
        ? 1
        : 0;

  if (c1) {
    lines.push(
      `First chart is usually prepared around ${formatJourneyDayAndChartTime(ymd, c1, c1Offset)}.`,
    );
  }
  if (c2) {
    lines.push(
      `Second chart is usually prepared around ${formatJourneyDayAndChartTime(ymd, c2, c2Offset)}.`,
    );
  }
  const remote = meta?.chartRemoteStation?.trim();
  if (remote && remote !== code) {
    lines.push(`Remote charting station: ${remote}.`);
  }
  const nextRemote = meta?.chartNextRemoteStation?.trim();
  if (nextRemote) {
    lines.push(`Next chart is prepared at ${nextRemote}.`);
  }
  const fb = meta?.chartTimesFallbackFromStation?.trim();
  if (fb && fb !== code) {
    lines.push(`Times shown from ${fb} until IRCTC publishes this station’s chart window.`);
  }
  if (lines.length === 0) {
    if (meta?.compositionError?.trim()) {
      lines.push(`IRCTC status: ${meta.compositionError.trim()}.`);
    }
    lines.push(
      `Expected preparation date/time for this station on ${dateLabel} is not available yet — try again closer to departure.`,
    );
  }
  return { title, lines };
}

/** One or two sentences for chart prep at a boarding station (IRCTC / DB meta). */
export function summarizeStationChartPreparation(
  meta: StationChartMetaItem | null | undefined,
  boardingStationCode: string,
): string | null {
  if (!meta) return null;
  const st = boardingStationCode.trim().toUpperCase();
  const parts: string[] = [];
  const c1 = meta.chartOneTime?.trim();
  const c2 = meta.chartTwoTime?.trim();
  const c1Offset = meta.chartOneDayOffset ?? 0;
  const c2Offset =
    meta.chartTwoDayOffset !== null && meta.chartTwoDayOffset !== undefined
      ? meta.chartTwoDayOffset
      : meta.chartTwoIsNextDay
        ? 1
        : 0;

  if (c1) {
    const timeLabel = c1Offset !== 0 ? `${c1} (${c1Offset > 0 ? "+" : ""}${c1Offset} day${Math.abs(c1Offset) !== 1 ? "s" : ""})` : c1;
    parts.push(`first chart around ${timeLabel}`);
  }
  if (c2) {
    const timeLabel = c2Offset !== 0 ? `${c2} (${c2Offset > 0 ? "+" : ""}${c2Offset} day${Math.abs(c2Offset) !== 1 ? "s" : ""})` : c2;
    parts.push(`second chart around ${timeLabel}`);
  }
  const remote = meta.chartRemoteStation?.trim();
  if (remote && remote !== st) {
    parts.push(`IRCTC remote charting station ${remote}`);
  }
  const fb = meta.chartTimesFallbackFromStation?.trim();
  if (fb) {
    parts.push(`times aligned with station ${fb}`);
  }
  if (parts.length === 0) {
    if (meta.compositionError?.trim()) {
      return `IRCTC chart info: ${meta.compositionError.trim()}`;
    }
    return null;
  }
  return `Chart preparation for boarding at ${st}: ${parts.join("; ")}.`;
}

/**
 * Short phrase for post-subscribe copy: journey date plus IRCTC chart-window hints when meta is loaded.
 */
export function buildJourneyChartAlertSchedulePhrase(args: {
  journeyDateYmd: string;
  metaLoading: boolean;
  metaErr: string | null;
  metaFrom: StationChartMetaItem | null | undefined;
  metaTo: StationChartMetaItem | null | undefined;
  legFromCode: string;
  legToCode: string;
  sameLegEndpoints: boolean;
}): string {
  const ymd = args.journeyDateYmd.trim().slice(0, 10);
  const dateLabel = formatJourneyDateUtcLabel(ymd);
  if (args.metaLoading || args.metaErr) {
    return dateLabel;
  }
  const fromSummary = summarizeStationChartPreparation(args.metaFrom, args.legFromCode);
  const toSummary = args.sameLegEndpoints ? null : summarizeStationChartPreparation(args.metaTo, args.legToCode);
  const bits = [fromSummary, toSummary].filter((s): s is string => Boolean(s));
  if (bits.length > 0) {
    return `${dateLabel} (${bits.join(" ")})`;
  }
  return dateLabel;
}
