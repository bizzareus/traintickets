import type {
  AlternateClassOption,
  AlternateLeg,
} from "@/components/booking-v2/alternatePathsTypes";
import type { SplitBookingLeg } from "@/lib/split-booking";

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
  return option && hasClassFare(option) ? option : null;
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
      travelClass: option.travelClass,
      fare: option.fare,
      boardingDate: leg.boardingDate ?? "",
      departureTime: leg.departureTime,
      arrivalTime: leg.arrivalTime,
      durationMinutes: leg.durationMinutes,
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
