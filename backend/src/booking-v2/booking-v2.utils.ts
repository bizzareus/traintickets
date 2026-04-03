export type ScheduleStopLike = { stationCode?: string | null };

/** Uppercase, trim, dedupe while preserving first-seen order (e.g. train `avlClasses`). */
export function normalizeAndDedupeClassCodes(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of codes) {
    const u = String(c ?? '')
      .trim()
      .toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Journey date from UI: `YYYY-MM-DD` → upstream `DD-MM-YYYY`. */
export function ymdToRailApiDdMmYyyy(ymd: string): string | null {
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
  /** Vendor prediction-style status text (normalized from upstream availability rows). */
  vendorPredictionStatus?: string | null;
  /**
   * Upstream `data.avlDayList[n].availablityType`:
   * `1` = ticket available, `3` = waiting (no ticket for this read).
   * When set, this takes precedence over loose string heuristics.
   */
  availablityType?: number | string | null;
};

/** Numeric `availablityType` from an availability day row (string or number in JSON). */
export function parseUpstreamAvailablityType(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function isLegConfirmed(avl: AvlDayLike | null | undefined): boolean {
  if (!avl) return false;
  const at = parseUpstreamAvailablityType(avl.availablityType);
  if (at === 3) return false;
  if (at === 1) return true;
  const ct = String(avl.vendorPredictionStatus ?? '').trim();
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

/**
 * Destination stop indices from `currentIdx` toward journey end (same priority at every board).
 * Matches manual order: full journey first, then shorter hops toward the boarding stop
 * (e.g. ST→BVI, ST→PLG, ST→VAPI, ST→BL, ST→NVS — indices from `targetIdx` down to `currentIdx + 1`).
 */
export function orderedDestinationIndices(
  currentIdx: number,
  targetIdx: number,
): number[] {
  if (currentIdx >= targetIdx) return [];
  const out: number[] = [];
  for (let j = targetIdx; j > currentIdx; j--) {
    out.push(j);
  }
  return out;
}

/** Match upstream `availablityDate` like "5-4-2026" to journey parts. */
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

/** True when vendor status text means the train has already left (hide from search). */
export function availabilityTextsIndicateTrainDeparted(
  parts: readonly (string | number | null | undefined)[],
): boolean {
  const blob = parts
    .map((x) => String(x ?? '').trim().toLowerCase())
    .filter((s) => s.length > 0)
    .join(' ');
  if (!blob) return false;
  if (blob.includes('train departed')) return true;
  if (/\bhas\s+departed\b/.test(blob)) return true;
  return false;
}

/**
 * ConfirmTkt `trainList` row: if any `availabilityCache` class shows departure, the train is omitted.
 */
export function trainSearchRowIndicatesDeparted(train: unknown): boolean {
  if (!train || typeof train !== 'object') return false;
  const row = train as Record<string, unknown>;
  const cache = row.availabilityCache;
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return false;
  for (const v of Object.values(cache)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const e = v as Record<string, unknown>;
    if (
      availabilityTextsIndicateTrainDeparted([
        e.availabilityDisplayName,
        e.railDataStatus,
        e.availablityStatus,
      ])
    ) {
      return true;
    }
  }
  return false;
}

/** Removes departed trains from `{ data: { trainList } }` search payloads (mutates copy only). */
export function filterDepartedTrainsFromSearchResponse(root: unknown): unknown {
  if (root == null || typeof root !== 'object' || Array.isArray(root)) return root;
  const o = root as Record<string, unknown>;
  const data = o.data;
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return root;
  const d = data as Record<string, unknown>;
  const list = d.trainList;
  if (!Array.isArray(list)) return root;
  const trainList = list.filter((row) => !trainSearchRowIndicatesDeparted(row));
  return { ...o, data: { ...d, trainList } };
}
