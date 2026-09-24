import diwaliTrainsData from "@/data/diwali-special-trains.json";

export type StationPoint = {
  code: string;
  name: string;
};

export type DiwaliSpecialTrain = {
  trainNumber: string;
  trainName: string;
  trainType: string;
  zone: string;
  dateFrom: string;
  dateTo: string;
  fromStation: StationPoint;
  departureTime: string;
  toStation: StationPoint;
  arrivalTime: string;
  duration: string;
  halts: number;
  runningDays: string[];
  classes: string[];
  distance: string;
  speed: string;
  returnTrainNumber?: string;
};

export type DiwaliTrainAvailabilityItem = {
  totalAvailableSeats: number;
  availableClasses: string[];
  lowestFare: number | null;
  dates: Record<
    string,
    {
      totalSeats: number;
      classes: Record<string, { status: string; count: number; fare?: number | null }>;
    }
  >;
  lastUpdated?: string;
};

export type DiwaliAvailabilitySummaryMap = Record<string, DiwaliTrainAvailabilityItem>;

/** Target dates in 2026 for Diwali travel peak (strictly Nov 4 - Nov 7, 2026). */
export const DIWALI_TARGET_DATES: ReadonlyArray<{
  date: string; // YYYY-MM-DD
  day: string;  // Short weekday (e.g. Wed)
  dmy: string;  // DD-MM-YYYY
}> = [
  { date: "2026-11-04", day: "Wed", dmy: "04-11-2026" },
  { date: "2026-11-05", day: "Thu", dmy: "05-11-2026" },
  { date: "2026-11-06", day: "Fri", dmy: "06-11-2026" },
  { date: "2026-11-07", day: "Sat", dmy: "07-11-2026" },
];

export const DEFAULT_DIWALI_SEARCH_DATE = "2026-11-05";

const MONTHS_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parses dates formatted like "Oct 07" or "Nov 25" into a UTC Date object in year 2026.
 */
export function parseFestivalDate(dateStr: string, year = 2026): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const m = MONTHS_MAP[parts[0]];
  const d = parseInt(parts[1], 10);
  if (m === undefined || Number.isNaN(d)) return null;
  return new Date(Date.UTC(year, m, d));
}

/**
 * Returns which target dates in Nov 4-7, 2026 a Diwali train is valid and scheduled to run.
 * Filters strictly to 4th - 7th November — no other dates.
 */
export function getDiwaliTrainRunningDates(
  train: DiwaliSpecialTrain,
  year = 2026,
): Array<{ date: string; day: string; dmy: string }> {
  const fromDate = parseFestivalDate(train.dateFrom, year);
  const toDate = parseFestivalDate(train.dateTo, year);
  if (!fromDate || !toDate) return [];

  const valid: Array<{ date: string; day: string; dmy: string }> = [];

  for (const target of DIWALI_TARGET_DATES) {
    const curDate = new Date(`${target.date}T00:00:00Z`);
    if (curDate >= fromDate && curDate <= toDate) {
      if (!train.runningDays || train.runningDays.length === 0 || train.runningDays.includes(target.day)) {
        valid.push(target);
      }
    }
  }

  return valid;
}

/**
 * Builds the search redirect URL for a Diwali train with destination, origin, and date 2026-11-05.
 */
export function buildDiwaliSearchRedirectUrl(
  train: {
    fromStation: { code: string; name?: string };
    toStation: { code: string; name?: string };
  },
  date = DEFAULT_DIWALI_SEARCH_DATE,
): string {
  const params = new URLSearchParams({
    from: train.fromStation.code.trim().toUpperCase(),
    to: train.toStation.code.trim().toUpperCase(),
    date,
  });
  if (train.fromStation.name) {
    params.set("fromName", train.fromStation.name.trim());
  }
  if (train.toStation.name) {
    params.set("toName", train.toStation.name.trim());
  }
  return `/?${params.toString()}`;
}

/**
 * Extracts numerical seat count from availability text (e.g. "AVAILABLE-0042" -> 42, "AVL 15" -> 15).
 */
export function extractAvailableSeatsCount(statusText?: string | null): number {
  if (!statusText) return 0;
  const match = statusText.match(/(?:AVAILABLE|AVAIL|CURR_AVBL|CURR_AVL|AVL)[-\s]*(\d+)/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) ? num : 0;
  }
  if (/^CNF|^CONFIRM/i.test(statusText.trim())) {
    return 1;
  }
  return 0;
}

export function getDiwaliSpecialTrains(): DiwaliSpecialTrain[] {
  return diwaliTrainsData.trains as DiwaliSpecialTrain[];
}
