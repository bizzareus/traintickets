import type {
  AlternateClassOption,
  AlternateLeg,
} from "@/components/booking-v2/alternatePathsTypes";
import type {
  SplitBookingLeg,
  SplitBookingLegAvailabilityResult,
} from "@/lib/split-booking";
import { isAcClass } from "@/lib/trainClasses";

export type LegClassSelections = Partial<Record<number, string>>;

export function getLegClassOptions(leg: AlternateLeg): AlternateClassOption[] {
  if (leg.segmentKind !== "confirmed") return [];
  if (leg.confirmedClassOptions?.length) return leg.confirmedClassOptions;
  if (!leg.travelClass) return [];
  return [
    {
      travelClass: leg.travelClass,
      railDataStatus: leg.railDataStatus,
      availablityStatus: leg.availablityStatus,
      predictionPercentage: leg.predictionPercentage,
      availabilityDisplayName: leg.availabilityDisplayName,
      fare: leg.fare,
    },
  ];
}

export function hasClassFare(
  option: AlternateClassOption,
): option is AlternateClassOption & { fare: number } {
  return (
    Boolean(option.travelClass.trim()) &&
    option.fare !== null &&
    Number.isFinite(option.fare) &&
    option.fare > 0
  );
}

export const SKIP_LEG = "SKIP";

/** Multiple classes require an explicit choice; never silently choose the cheapest. */
export function getSelectedLegClass(leg: AlternateLeg, selectedClass?: string) {
  if (selectedClass === SKIP_LEG) return null;
  const options = getLegClassOptions(leg);
  const option = selectedClass
    ? options.find((candidate) => candidate.travelClass === selectedClass)
    : options.length === 1
      ? options[0]
      : undefined;
  return option && option.isConfirmed !== false && hasClassFare(option)
    ? option
    : null;
}

/** Apply matching live statuses without discarding quoted fares or cached data on errors. */
export function applyLegAvailability(
  leg: AlternateLeg,
  trainNumber: string,
  boardingDate: string,
  results: SplitBookingLegAvailabilityResult[],
): { leg: AlternateLeg; failed: boolean } {
  let failed = false;
  const confirmedClassOptions = getLegClassOptions(leg).map((option) => {
    const live = results.find(
      (row) =>
        row.from.toUpperCase() === leg.from.toUpperCase() &&
        row.to.toUpperCase() === leg.to.toUpperCase() &&
        row.travelClass.toUpperCase() === option.travelClass.toUpperCase() &&
        row.boardingDate === boardingDate &&
        (!row.trainNumber || row.trainNumber === trainNumber),
    );
    if (!live?.status?.trim() || ["CHECK_FAILED", "NO_DATA"].includes(live.status)) {
      failed = true;
      return option;
    }
    return {
      ...option,
      isConfirmed: live.isConfirmed,
      availabilityDisplayName: live.status,
      availablityStatus: live.status,
      railDataStatus: live.status,
    };
  });
  return { leg: { ...leg, confirmedClassOptions }, failed };
}

export function getLegAvailabilityText(
  option?: {
    availabilityDisplayName?: string | null;
    availablityStatus?: string | null;
    railDataStatus?: string | null;
  } | null,
  leg?: {
    availabilityDisplayName?: string | null;
    availablityStatus?: string | null;
    railDataStatus?: string | null;
  } | null,
): string | undefined {
  const disp =
    option?.availabilityDisplayName?.trim() ||
    leg?.availabilityDisplayName?.trim();
  const raw =
    option?.availablityStatus?.trim() || leg?.availablityStatus?.trim();
  const rail = option?.railDataStatus?.trim() || leg?.railDataStatus?.trim();

  if (disp && /^available$/i.test(disp) && raw && !/^available$/i.test(raw)) {
    return raw.replace(/#$/, "").trim();
  }
  const chosen = disp || raw || rail;
  return chosen ? chosen.replace(/#$/, "").trim() : undefined;
}

/** Single confirmed leg built from direct IRCTC availability for our booking engine. */
export function buildDirectBookingLegs(args: {
  from: string;
  to: string;
  boardingDate: string;
  classes: { cls: string; status: string; fare: number | null }[];
  cache?: Record<
    string,
    {
      availabilityDisplayName?: string | null;
      railDataStatus?: string | null;
      availablityStatus?: string | null;
    } | null
  >;
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
}): AlternateLeg[] | null {
  const { from, to, boardingDate, classes, cache } = args;
  if (classes.length === 0) return null;
  const options: AlternateClassOption[] = classes.map((c) => {
    const row = cache?.[c.cls];
    return {
      travelClass: c.cls,
      fare: c.fare,
      availabilityDisplayName: row?.availabilityDisplayName ?? c.status,
      railDataStatus: row?.railDataStatus ?? c.status,
      availablityStatus: row?.availablityStatus ?? null,
      predictionPercentage: null,
    };
  });
  const firstPriced = options.find((o) => o.fare != null && o.fare > 0);
  return [
    {
      from,
      to,
      segmentKind: "confirmed",
      travelClass: options[0].travelClass,
      railDataStatus: options[0].railDataStatus,
      availablityStatus: options[0].availablityStatus,
      predictionPercentage: null,
      availabilityDisplayName: options[0].availabilityDisplayName,
      fare: firstPriced?.fare ?? null,
      confirmedClassOptions: options,
      departureTime: args.departureTime ?? null,
      arrivalTime: args.arrivalTime ?? null,
      durationMinutes: args.durationMinutes ?? null,
      boardingDate,
    },
  ];
}

/** Class choices and the quoted fares are resolved together from the current result. At least 1 leg is mandatory; any leg can be skipped. */
export function buildSplitBookingSelection(
  legs: AlternateLeg[],
  choices: LegClassSelections,
) {
  const selectedLegs: SplitBookingLeg[] = [];
  const missingLegIndices: number[] = [];
  for (const [index, leg] of legs.entries()) {
    if (leg.segmentKind !== "confirmed") continue;
    if (choices[index] === SKIP_LEG) continue;
    const option = getSelectedLegClass(leg, choices[index]);
    if (!option) {
      missingLegIndices.push(index);
      continue;
    }
    selectedLegs.push({
      from: leg.from,
      to: leg.to,
      trainNumber: leg.trainNumber,
      trainName: leg.trainName,
      travelClass: option.travelClass,
      fare: option.fare,
      boardingDate: leg.boardingDate ?? "",
      departureTime: leg.departureTime,
      arrivalTime: leg.arrivalTime,
      durationMinutes: leg.durationMinutes,
      availability: getLegAvailabilityText(option, leg),
    });
  }
  return {
    legs: selectedLegs,
    missingLegIndices,
    totalFare:
      missingLegIndices.length || !selectedLegs.length
        ? null
        : selectedLegs.reduce(
            (sum, leg) => sum + Math.round(leg.fare * 100),
            0,
          ) / 100,
  };
}

/** Checks if an alternate leg has at least one confirmed AC class option. */
export function legHasAcOption(leg: AlternateLeg): boolean {
  return getLegClassOptions(leg).some((opt) => isAcClass(opt.travelClass));
}

/** Checks if an itinerary of alternate legs has at least one confirmed leg with an AC class. */
export function hasAtLeastOneAcLeg(
  legs?: readonly AlternateLeg[] | null,
): boolean {
  if (!legs || legs.length === 0) return false;
  return legs.some(
    (leg) => leg.segmentKind === "confirmed" && legHasAcOption(leg),
  );
}
