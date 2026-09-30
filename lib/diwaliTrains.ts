import diwaliTrainsData from "@/data/diwali-special-trains.json";
import {
  type StationPoint,
  type SpecialTrain,
  parseFestivalDate,
  extractAvailableSeatsCount,
} from "./specialTrains";

export type { StationPoint };

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
  date: string;
  day: string;
  dmy: string;
}> = [
  { date: "2026-11-04", day: "Wed", dmy: "04-11-2026" },
  { date: "2026-11-05", day: "Thu", dmy: "05-11-2026" },
  { date: "2026-11-06", day: "Fri", dmy: "06-11-2026" },
  { date: "2026-11-07", day: "Sat", dmy: "07-11-2026" },
];

export const DEFAULT_DIWALI_SEARCH_DATE = "2026-11-05";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export { parseFestivalDate };

/**
 * Returns which target dates in Nov 4-7, 2026 a Diwali train is valid and scheduled to run.
 * Filters strictly to 4th - 7th November — no other dates.
 */
export function getDiwaliTrainRunningDates(
  train: Pick<SpecialTrain, "dateFrom" | "dateTo" | "runningDays">,
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

/** Returns the train's operating date nearest the preferred festival date. */
export function getDiwaliTrainSearchDate(
  train: Pick<SpecialTrain, "dateFrom" | "dateTo" | "runningDays">,
  preferredDate = DEFAULT_DIWALI_SEARCH_DATE,
): string {
  const fromDate = parseFestivalDate(train.dateFrom);
  const toDate = parseFestivalDate(train.dateTo);
  const preferred = new Date(`${preferredDate}T00:00:00Z`);
  if (!fromDate || !toDate || Number.isNaN(preferred.getTime())) {
    return preferredDate;
  }

  let nearest: Date | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let time = fromDate.getTime(); time <= toDate.getTime(); time += DAY_MS) {
    const candidate = new Date(time);
    const runsOnCandidate =
      !train.runningDays ||
      train.runningDays.length === 0 ||
      train.runningDays.includes(WEEKDAY_NAMES[candidate.getUTCDay()]);
    if (!runsOnCandidate) continue;

    const distance = Math.abs(time - preferred.getTime());
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest?.toISOString().slice(0, 10) ?? preferredDate;
}

/**
 * Builds the search redirect URL using a date when the train actually runs.
 */
export function buildDiwaliSearchRedirectUrl(
  train: {
    fromStation: { code: string; name?: string };
    toStation: { code: string; name?: string };
    dateFrom?: string;
    dateTo?: string;
    runningDays?: string[];
  },
  date?: string,
): string {
  const searchDate =
    date ??
    (train.dateFrom && train.dateTo && train.runningDays
      ? getDiwaliTrainSearchDate({
          dateFrom: train.dateFrom,
          dateTo: train.dateTo,
          runningDays: train.runningDays,
        })
      : DEFAULT_DIWALI_SEARCH_DATE);
  const params = new URLSearchParams({
    from: train.fromStation.code.trim().toUpperCase(),
    to: train.toStation.code.trim().toUpperCase(),
    date: searchDate,
  });
  if (train.fromStation.name) {
    params.set("fromName", train.fromStation.name.trim());
  }
  if (train.toStation.name) {
    params.set("toName", train.toStation.name.trim());
  }
  return `/?${params.toString()}`;
}

export { extractAvailableSeatsCount };

export function getDiwaliSpecialTrains(): DiwaliSpecialTrain[] {
  return diwaliTrainsData.trains as DiwaliSpecialTrain[];
}
