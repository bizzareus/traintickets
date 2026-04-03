export type ScheduleStopLike = { stationCode?: string | null };

/** Journey date from UI: `YYYY-MM-DD` → ConfirmTkt `DD-MM-YYYY`. */
export function ymdToConfirmTktDate(ymd: string): string | null {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

/** Ordered station codes from boarding to destination (inclusive), or null if invalid. */
export function stationCodesBetweenStops(
  stationList: ScheduleStopLike[] | null | undefined,
  fromCode: string,
  toCode: string,
): string[] | null {
  if (!Array.isArray(stationList) || stationList.length < 2) return null;
  const codes = stationList
    .map((s) => String(s.stationCode ?? '').trim().toUpperCase())
    .filter(Boolean);
  const a = fromCode.trim().toUpperCase();
  const b = toCode.trim().toUpperCase();
  const i = codes.indexOf(a);
  const j = codes.indexOf(b);
  if (i < 0 || j < 0 || i >= j) return null;
  return codes.slice(i, j + 1);
}

export type AvlDayLike = {
  availablityStatus?: string | null;
  confirmTktStatus?: string | null;
};

export function isLegConfirmed(avl: AvlDayLike | null | undefined): boolean {
  if (!avl) return false;
  const ct = String(avl.confirmTktStatus ?? '').trim();
  if (ct === 'Confirm' || ct === 'Probable') return true;
  const st = String(avl.availablityStatus ?? '').trim().toUpperCase();
  return st.startsWith('AVAILABLE');
}

/**
 * Given parallel arrays (same length): availability rows and destination station indices,
 * return the farthest destination index whose leg is confirmed.
 */
export function pickFarthestConfirmedStationIndex(
  results: (AvlDayLike | null)[],
  candidateStationIndices: number[],
): number | null {
  if (results.length !== candidateStationIndices.length) return null;
  for (let k = results.length - 1; k >= 0; k--) {
    if (isLegConfirmed(results[k] ?? undefined)) return candidateStationIndices[k];
  }
  return null;
}

/** Match ConfirmTkt `availablityDate` like "5-4-2026" to journey parts. */
export function avlDayMatchesJourneyDate(
  availablityDate: string | null | undefined,
  journeyDdMmYyyy: string,
): boolean {
  if (!availablityDate || !journeyDdMmYyyy) return false;
  const jParts = journeyDdMmYyyy.split('-').map((x) => parseInt(x, 10));
  if (jParts.length !== 3 || jParts.some((n) => Number.isNaN(n))) return false;
  const [jd, jm, jy] = jParts;
  const m = String(availablityDate).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  return d === jd && mo === jm && y === jy;
}
