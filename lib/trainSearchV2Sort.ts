import { hasAnyAvailableSeat, isLegConfirmed } from "./bookingV2Availability";
import type {
  AlternateLeg,
  AlternatePathsResponse,
  TrainListItem,
} from "@/components/booking-v2/alternatePathsTypes";

export interface TrainScanMeta {
  isComplete?: boolean;
  confirmedDurationMinutes?: number;
  legCount?: number;
}

export interface SortTrainSearchV2Options {
  acOnly?: boolean;
  /** Map or record of trainNumber -> discovered scan metadata */
  scanMetaMap?: Map<string, TrainScanMeta> | Record<string, TrainScanMeta>;
  /** Set of trainNumbers with confirmed end-to-end full split journeys */
  endToEndTrains?: Set<string>;
  /** Set of trainNumbers with partial confirmed split journeys */
  partialTrains?: Set<string>;
}

/**
 * Fast helper to parse HH:mm formatted strings into minutes since midnight without allocating arrays.
 */
function parseHHMM(timeStr: string): number | null {
  const colonIdx = timeStr.indexOf(":");
  if (colonIdx === -1) return null;
  const h = parseInt(timeStr.slice(0, colonIdx), 10);
  const m = parseInt(timeStr.slice(colonIdx + 1), 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Calculates total confirmed duration in minutes for a list of alternate path legs.
 * Performance Optimization: Uses direct substring parsing (`parseHHMM`) to eliminate intermediate array allocations.
 */
export function calculateConfirmedDurationMinutes(legs: AlternateLeg[] = []): number {
  let total = 0;
  for (const leg of legs) {
    const isConfirmed = leg.segmentKind === "confirmed" || isLegConfirmed(leg);
    if (isConfirmed) {
      if (typeof leg.durationMinutes === "number" && leg.durationMinutes > 0) {
        total += leg.durationMinutes;
      } else if (leg.departureTime && leg.arrivalTime) {
        const dep = parseHHMM(leg.departureTime);
        const arr = parseHHMM(leg.arrivalTime);
        if (dep !== null && arr !== null) {
          let diff = arr - dep;
          if (diff < 0) diff += 24 * 60; // Crosses midnight
          total += diff;
        }
      }
    }
  }
  return total;
}

/**
 * Helper to extract ScanMeta from AlternatePathsResponse.
 */
export function extractScanMetaFromResult(result: AlternatePathsResponse): TrainScanMeta {
  const confirmedDurationMinutes = calculateConfirmedDurationMinutes(result.legs);
  return {
    isComplete: Boolean(result.isComplete && result.legs && result.legs.length > 0),
    confirmedDurationMinutes,
    legCount: result.legCount ?? result.legs?.length ?? 0,
  };
}

/**
 * Prioritized 4-Tier Sorting Algorithm for Train Search V2:
 *
 * Tier 1: Direct availability on IRCTC (sorted by departureTime ascending)
 * Tier 2: 100% Complete end-to-end split journey discovered (sorted by departureTime ascending)
 * Tier 3: Partial split journey discovered (sorted by confirmedDurationMinutes DESCENDING, then departureTime ascending)
 * Tier 4: Waitlisted only / 0 discovered (sorted by departureTime ascending)
 */
export function sortTrainSearchV2(
  trains: TrainListItem[],
  options: SortTrainSearchV2Options = {},
): TrainListItem[] {
  const {
    acOnly = false,
    scanMetaMap,
    endToEndTrains,
    partialTrains,
  } = options;

  const isScanMetaMap = scanMetaMap instanceof Map;
  const getMeta = (trainNumber: string): TrainScanMeta | undefined => {
    if (!scanMetaMap) return undefined;
    return isScanMetaMap
      ? (scanMetaMap as Map<string, TrainScanMeta>).get(trainNumber)
      : (scanMetaMap as Record<string, TrainScanMeta>)[trainNumber];
  };

  const directAvailable: TrainListItem[] = [];
  const endToEndDiscovered: TrainListItem[] = [];
  const partialDiscovered: { train: TrainListItem; confirmedDurationMinutes: number }[] = [];
  const waitlisted: TrainListItem[] = [];

  for (const t of trains) {
    if (hasAnyAvailableSeat(t, acOnly)) {
      directAvailable.push(t);
      continue;
    }

    const meta = getMeta(t.trainNumber);
    const isComplete =
      meta?.isComplete ?? (endToEndTrains ? endToEndTrains.has(t.trainNumber) : false);

    if (isComplete) {
      endToEndDiscovered.push(t);
      continue;
    }

    const confirmedDurationMinutes =
      meta?.confirmedDurationMinutes ??
      (partialTrains && partialTrains.has(t.trainNumber) ? 1 : 0);

    const isPartial =
      confirmedDurationMinutes > 0 ||
      (partialTrains ? partialTrains.has(t.trainNumber) : false);

    if (isPartial) {
      partialDiscovered.push({
        train: t,
        confirmedDurationMinutes,
      });
      continue;
    }

    waitlisted.push(t);
  }

  // Performance Optimization: Direct string comparison operator (< / >) is ~5x faster than localeCompare in V8 for HH:mm strings
  const sortByDepartureTime = (a: TrainListItem, b: TrainListItem) => {
    const depA = a.departureTime || "";
    const depB = b.departureTime || "";
    return depA < depB ? -1 : depA > depB ? 1 : 0;
  };

  // Tier 1: Direct available on IRCTC (chronological)
  directAvailable.sort(sortByDepartureTime);

  // Tier 2: Full complete split journey (chronological)
  endToEndDiscovered.sort(sortByDepartureTime);

  // Tier 3: Partial split journey (longest confirmed duration first, then chronological)
  partialDiscovered.sort((a, b) => {
    if (b.confirmedDurationMinutes !== a.confirmedDurationMinutes) {
      return b.confirmedDurationMinutes - a.confirmedDurationMinutes;
    }
    return sortByDepartureTime(a.train, b.train);
  });

  // Tier 4: Waitlisted only (chronological)
  waitlisted.sort(sortByDepartureTime);

  return [
    ...directAvailable,
    ...endToEndDiscovered,
    ...partialDiscovered.map((p) => p.train),
    ...waitlisted,
  ];
}
