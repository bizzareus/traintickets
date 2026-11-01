export interface ConnectingCorridorConfig {
  fromHub: string;
  toHub: string;
  intermediateHubs: string[];
  defaultMinLayoverMinutes: number;
  defaultMaxLayoverMinutes: number;
}

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
