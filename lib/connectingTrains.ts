import { apiClient } from "@/lib/api";
import type {
  AlternateLeg,
  AlternatePathsResponse,
} from "@/components/booking-v2/alternatePathsTypes";
import type { SplitTicketBookingFlowProps } from "@/components/booking-v2/SplitTicketBookingFlow";

export interface ConnectingLegClassOption {
  travelClass: string;
  fare: number | null;
  availabilityDisplayName: string | null;
  isConfirmed: boolean;
}

export interface ConnectingJourneyLegDto {
  trainNumber: string;
  trainName: string;
  from: string;
  to: string;
  boardingDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  arrivalTime: string; // HH:mm
  durationMinutes: number;
  travelClass: string;
  fare: number;
  availabilityDisplayName: string;
  availablityStatus: string | null;
  isConfirmed: boolean;
  confirmedClassOptions: ConnectingLegClassOption[];
}

export interface ConnectingJourneyDto {
  id: string;
  from: string;
  to: string;
  intermediateStation: string;
  intermediateStationName: string;
  journeyDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  arrivalTime: string; // HH:mm
  arrivalDate: string; // YYYY-MM-DD
  totalDurationMinutes: number;
  layoverMinutes: number;
  totalFare: number;
  preferredClass: string;
  isFullyConfirmed: boolean;
  legs: [ConnectingJourneyLegDto, ConnectingJourneyLegDto];
}

export interface ConnectingTrainsResponseDto {
  from: string;
  to: string;
  date: string;
  isSupportedCorridor: boolean;
  totalFound: number;
  confirmedCount: number;
  journeys: ConnectingJourneyDto[];
}

export async function fetchConnectingTrains(params: {
  from: string;
  to: string;
  date: string;
  classes?: string[];
  minLayoverMinutes?: number;
  maxLayoverMinutes?: number;
}): Promise<ConnectingTrainsResponseDto> {
  const queryParams: Record<string, string> = {
    from: params.from,
    to: params.to,
    date: params.date,
  };
  if (params.classes && params.classes.length > 0) {
    queryParams.classes = params.classes.join(",");
  }
  if (params.minLayoverMinutes) {
    queryParams.minLayover = String(params.minLayoverMinutes);
  }
  if (params.maxLayoverMinutes) {
    queryParams.maxLayover = String(params.maxLayoverMinutes);
  }

  const res = await apiClient.get<ConnectingTrainsResponseDto>(
    "/api/booking-v2/connecting-trains",
    { params: queryParams },
  );
  return res.data;
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatLayover(minutes: number): string {
  return formatDuration(minutes);
}

export function buildFallbackConnectingLeg(
  leg: ConnectingJourneyLegDto,
  selectedClass: string,
  segmentKind: "confirmed" | "check_realtime",
  availabilityDisplayName: string,
  fare: number | null,
): AlternateLeg {
  const confirmedOptions =
    segmentKind === "confirmed"
      ? (leg.confirmedClassOptions ?? [])
          .filter((o) => o.isConfirmed)
          .map((o) => ({
            travelClass: o.travelClass,
            isConfirmed: true,
            railDataStatus: o.availabilityDisplayName,
            availablityStatus: "AVAILABLE",
            predictionPercentage: null,
            availabilityDisplayName: o.availabilityDisplayName,
            fare: o.fare,
          }))
      : [];

  return {
    from: leg.from,
    to: leg.to,
    segmentKind,
    trainNumber: leg.trainNumber,
    trainName: leg.trainName,
    travelClass: selectedClass,
    railDataStatus:
      segmentKind === "confirmed" ? "AVAILABLE" : leg.availablityStatus,
    availablityStatus:
      segmentKind === "confirmed" ? "AVAILABLE" : leg.availablityStatus,
    predictionPercentage: null,
    availabilityDisplayName,
    fare,
    confirmedClassOptions:
      confirmedOptions.length > 0 ? confirmedOptions : undefined,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    durationMinutes: leg.durationMinutes,
    boardingDate: leg.boardingDate,
  };
}

export function mapScannedConnectingLeg(
  leg: ConnectingJourneyLegDto,
  res: AlternatePathsResponse | null,
  selectedClass: string,
  chosenOpt: ConnectingLegClassOption | undefined,
  fallbackFare: number,
): { hasSeats: boolean; legs: AlternateLeg[] } {
  if (res?.legs && res.legs.length > 0) {
    return {
      hasSeats: res.legs.some(
        (l) => l.segmentKind === "confirmed" && Boolean(l.travelClass),
      ),
      legs: res.legs.map((l) => ({
        ...l,
        trainNumber: leg.trainNumber,
        trainName: leg.trainName,
      })),
    };
  }

  const hasSeats = Boolean(chosenOpt ? chosenOpt.isConfirmed : leg.isConfirmed);
  const displayName =
    chosenOpt?.availabilityDisplayName ??
    leg.availabilityDisplayName ??
    (hasSeats ? "Available" : "Waitlisted");

  return {
    hasSeats,
    legs: [
      buildFallbackConnectingLeg(
        leg,
        selectedClass,
        hasSeats ? "confirmed" : "check_realtime",
        displayName,
        hasSeats ? fallbackFare : null,
      ),
    ],
  };
}

export function sumConfirmedConnectingFare(
  legs: AlternateLeg[],
): number | null {
  const confirmed = legs.filter((l) => l.segmentKind === "confirmed");
  if (
    confirmed.length === 0 ||
    !confirmed.every((l) => typeof l.fare === "number" && l.fare > 0)
  ) {
    return null;
  }
  return confirmed.reduce((sum, l) => sum + (l.fare ?? 0), 0);
}

export function buildConnectingAlternateResult({
  journey,
  res1,
  res2,
  legs,
  totalFare,
  fromName,
  toName,
}: {
  journey: ConnectingJourneyDto;
  res1?: AlternatePathsResponse | null;
  res2?: AlternatePathsResponse | null;
  legs: AlternateLeg[];
  totalFare: number | null;
  fromName?: string;
  toName?: string;
}): AlternatePathsResponse {
  const leg1 = journey.legs[0];
  const leg2 = journey.legs[1];
  const confirmedLegCount = legs.filter(
    (l) => l.segmentKind === "confirmed",
  ).length;

  return {
    trainNumber: `${leg1.trainNumber} / ${leg2.trainNumber}`,
    legs,
    totalFare,
    legCount: confirmedLegCount,
    isComplete:
      legs.length > 0 && legs.every((l) => l.segmentKind === "confirmed"),
    stationCodesOnRoute: [
      journey.from,
      journey.intermediateStation,
      journey.to,
    ],
    stationNameMap: {
      [journey.from]: fromName || journey.from,
      [journey.intermediateStation]: journey.intermediateStationName,
      [journey.to]: toName || journey.to,
      ...(res1?.stationNameMap || {}),
      ...(res2?.stationNameMap || {}),
    },
    trainStartDate: journey.journeyDate,
  };
}

/**
 * Converts a connecting journey into the standard SplitTicketBookingFlow props.
 */
export function connectingJourneyToBookingProps(
  journey: ConnectingJourneyDto,
  onClose: () => void,
): SplitTicketBookingFlowProps {
  const train1 = journey.legs[0];
  const train2 = journey.legs[1];

  const compositeTrainNumber = `${train1.trainNumber} / ${train2.trainNumber}`;
  const compositeTrainName = `${train1.trainName} ➔ ${train2.trainName}`;

  const alternateLegs: AlternateLeg[] = journey.legs.map((leg) => ({
    from: leg.from,
    to: leg.to,
    segmentKind: "confirmed" as const,
    trainNumber: leg.trainNumber,
    trainName: leg.trainName,
    travelClass: leg.travelClass,
    railDataStatus: leg.availabilityDisplayName,
    availablityStatus: leg.availablityStatus,
    predictionPercentage: null,
    availabilityDisplayName: leg.availabilityDisplayName,
    fare: leg.fare,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    durationMinutes: leg.durationMinutes,
    boardingDate: leg.boardingDate,
    confirmedClassOptions: (leg.confirmedClassOptions || []).map((opt) => ({
      travelClass: opt.travelClass,
      railDataStatus: opt.availabilityDisplayName,
      availablityStatus: null,
      predictionPercentage: null,
      availabilityDisplayName: opt.availabilityDisplayName,
      fare: opt.fare,
    })),
  }));

  return {
    trainNumber: compositeTrainNumber,
    trainName: compositeTrainName,
    journeyDate: journey.journeyDate,
    legs: alternateLegs,
    stationNameMap: {
      [journey.from]: journey.from,
      [journey.intermediateStation]: journey.intermediateStationName,
      [journey.to]: journey.to,
    },
    onClose,
  };
}
