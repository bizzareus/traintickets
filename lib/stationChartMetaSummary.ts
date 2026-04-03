import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";

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

  const lines: string[] = [];
  const c1 = meta?.chartOneTime?.trim();
  const c2 = meta?.chartTwoTime?.trim();
  if (c1) {
    lines.push(`First chart is usually prepared around ${c1} (IRCTC time at this station).`);
  }
  if (c2) {
    lines.push(
      meta?.chartTwoIsNextDay
        ? `Second chart is usually prepared around ${c2} on the next calendar day.`
        : `Second chart is usually prepared around ${c2}.`,
    );
  }
  const remote = meta?.chartRemoteStation?.trim();
  if (remote && remote !== code) {
    lines.push(`Remote charting station: ${remote}.`);
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
  if (c1) parts.push(`first chart around ${c1}`);
  if (c2) {
    parts.push(
      meta.chartTwoIsNextDay ? `second chart around ${c2} (next day)` : `second chart around ${c2}`,
    );
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
