export type ScheduleStopLike = { stationCode?: string | null };

/** Uppercase, trim, dedupe while preserving first-seen order (e.g. train `avlClasses`). */
export function normalizeAndDedupeClassCodes(
  codes: readonly string[],
): string[] {
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
  const m = String(ymd)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
    .map((s) =>
      String(s.stationCode ?? '')
        .trim()
        .toUpperCase(),
    )
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
  const st = String(avl.availablityStatus ?? '')
    .trim()
    .toUpperCase();
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
    if (isLegConfirmed(results[k] ?? undefined))
      return candidateStationIndices[k];
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
  const m = String(availablityDate)
    .trim()
    .match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  return d === jd && mo === jm && y === jy;
}

/** True when vendor status text means the train has already left (hide from search). */
export function availabilityTextsIndicateTrainDeparted(
  parts: readonly unknown[],
): boolean {
  const blob = parts
    .map((x) =>
      typeof x === 'string'
        ? x.trim().toLowerCase()
        : String((x as any) || '')
            .trim()
            .toLowerCase(),
    )
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
  if (root == null || typeof root !== 'object' || Array.isArray(root))
    return root;
  const o = root as Record<string, unknown>;
  const data = o.data;
  if (data == null || typeof data !== 'object' || Array.isArray(data))
    return root;
  const d = data as Record<string, unknown>;
  const list = d.trainList;
  if (!Array.isArray(list)) return root;
  const trainList = list.filter((row) => !trainSearchRowIndicatesDeparted(row));
  return { ...o, data: { ...d, trainList } };
}

/** IRCTC schedule row subset used for leg timing (see `trnscheduleenquiry` / seed shapes). */
export type IrctcScheduleStopLite = {
  stationCode?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  dayCount?: unknown;
};

export function normalizeScheduleStationCode(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function parseIrctcScheduleClock(
  raw: string | null | undefined,
): { display: string; minutes: number } | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (t === '' || t === '--') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return {
    display: `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`,
    minutes: h * 60 + min,
  };
}

export function parseScheduleDayCount(raw: unknown): number | null {
  if (raw == null) return null;
  const s = typeof raw === 'string' ? raw.trim() : String(raw as any).trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Departure/arrival clocks and duration for one onboard leg using IRCTC schedule rows.
 * Uses `dayCount` when present so multi-day and overnight legs stay correct.
 */
export function legScheduleTiming(
  stationList: IrctcScheduleStopLite[] | null | undefined,
  fromCode: string,
  toCode: string,
): {
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes: number | null;
} {
  if (!Array.isArray(stationList) || stationList.length === 0) {
    return { departureTime: null, arrivalTime: null, durationMinutes: null };
  }
  const a = normalizeScheduleStationCode(fromCode);
  const b = normalizeScheduleStationCode(toCode);
  const fromStop = stationList.find(
    (s) => normalizeScheduleStationCode(s.stationCode) === a,
  );
  const toStop = stationList.find(
    (s) => normalizeScheduleStationCode(s.stationCode) === b,
  );
  if (!fromStop || !toStop) {
    return { departureTime: null, arrivalTime: null, durationMinutes: null };
  }

  const depPick =
    parseIrctcScheduleClock(fromStop.departureTime as string | undefined) ??
    parseIrctcScheduleClock(fromStop.arrivalTime as string | undefined);
  const arrPick =
    parseIrctcScheduleClock(toStop.arrivalTime as string | undefined) ??
    parseIrctcScheduleClock(toStop.departureTime as string | undefined);

  const dayFrom = parseScheduleDayCount(fromStop.dayCount) ?? 1;
  const dayTo = parseScheduleDayCount(toStop.dayCount) ?? dayFrom;

  let durationMinutes: number | null = null;
  if (depPick && arrPick) {
    let delta = arrPick.minutes - depPick.minutes + (dayTo - dayFrom) * 24 * 60;
    if (delta < 0) delta += 24 * 60;
    durationMinutes = delta;
  }

  return {
    departureTime: depPick?.display ?? null,
    arrivalTime: arrPick?.display ?? null,
    durationMinutes,
  };
}

/** Same collapsed-suffix OD as frontend `partitionAlternatePathLegsForModal`. */
export function collapsibleRealtimeRemainderEndpoints(
  legs: readonly { from: string; to: string; segmentKind: string }[],
  journeyDestinationCode: string,
): { from: string; to: string } | null {
  const d = journeyDestinationCode.trim().toUpperCase();
  const n = legs.length;
  if (n === 0) return null;
  const last = legs[n - 1];
  if (String(last.to).trim().toUpperCase() !== d) return null;
  if (last.segmentKind !== 'check_realtime') return null;

  let start = n - 1;
  for (let i = n - 2; i >= 0; i--) {
    const leg = legs[i];
    if (leg.segmentKind !== 'check_realtime') break;
    if (
      String(leg.to).trim().toUpperCase() !==
      String(legs[i + 1].from)
        .trim()
        .toUpperCase()
    ) {
      break;
    }
    start = i;
  }
  return { from: legs[start].from, to: legs[n - 1].to };
}
