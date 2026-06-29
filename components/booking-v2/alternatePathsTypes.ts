/**
 * Shared types for the booking-v2 alternate-paths engine and PNR experience.
 *
 * These were previously declared inline in `app/(main)/page.tsx`. They now live
 * here so both the homepage tabs and the standalone `/pnr-status` page can share
 * the same `useAlternatePaths` hook, `AlternatePathContent` renderer, and
 * `SearchPnrPanel` without duplicating/conflicting type declarations.
 */

// PNR status types are owned by SmartPnrPredictor; re-export so callers have a
// single import site and avoid duplicate `PnrStatusData` declarations.
export type {
  PnrPassengerStatus,
  PnrStatusData,
} from "@/components/booking-v2/SmartPnrPredictor";

import type { PnrStatusData } from "@/components/booking-v2/SmartPnrPredictor";

export interface PnrStatusResponse {
  status: boolean;
  message?: string;
  data?: PnrStatusData;
}

export type AvailabilityCacheEntry = {
  travelClass?: string;
  fare?: string;
  availabilityDisplayName?: string;
  railDataStatus?: string;
  /** Upstream `availablityType`: 1 = bookable on IRCTC, 3 = waiting, etc. */
  availablityType?: number | string | null;
  availablityStatus?: string | null;
  vendorPredictionStatus?: string | null;
};

export type TrainListItem = {
  trainNumber: string;
  trainName: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: number;
  fromStnCode?: string;
  toStnCode?: string;
  avlClasses?: string[];
  availabilityCache?: Record<string, AvailabilityCacheEntry>;
  trainStartDate?: string;
};

export type AlternateClassOption = {
  travelClass: string;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

export type AlternateLeg = {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
  travelClass: string | null;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
  /** All confirmed class options for this segment, sorted cheapest-first. */
  confirmedClassOptions?: AlternateClassOption[];
  /** Set from IRCTC schedule when the API includes leg timing (HH:MM). */
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
};

/** Mirror of backend AlternatePathProgressEvent. */
export type AlternatePathProgressEvent =
  | { type: "schedule_ok"; trainName: string | null; stopCount: number }
  | { type: "schedule_fail" }
  | { type: "route_ok"; from: string; to: string; stopCount: number }
  | { type: "route_fail"; from: string; to: string }
  | {
      type: "hop_confirmed";
      from: string;
      to: string;
      travelClass: string;
      fare: number | null;
      hopIndex: number;
    }
  | { type: "hop_unavailable"; from: string; to: string; hopIndex: number }
  | {
      type: "done";
      isComplete: boolean;
      legCount: number;
      totalFare: number | null;
    };

export type AlternatePathsResponse = {
  trainNumber: string;
  legs: AlternateLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  /** Code → full station name from the IRCTC schedule. */
  stationNameMap?: Record<string, string>;
  trainOriginCode?: string | null;
  trainOriginDepartureTime?: string | null;
  remainderMergedSchedule?: {
    from: string;
    to: string;
    departureTime: string | null;
    arrivalTime: string | null;
    durationMinutes: number | null;
  } | null;
  debugLog?: string[];
  trainStartDate?: string;
};
