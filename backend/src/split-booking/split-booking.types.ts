import type {
  SplitBookingMode,
  SplitBookingPaymentStatus,
  SplitBookingFulfillmentStatus,
} from '@prisma/client';

export interface SplitBookingPassenger {
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Transgender';
  berthPreference?: string;
  seniorCitizen?: boolean;
}

export interface SplitBookingChildPassenger {
  name: string;
  age: number; // below 5
  gender: 'Male' | 'Female' | 'Transgender';
}

export interface SplitBookingLeg {
  from: string;
  to: string;
  travelClass: string;
  fare: number;
  boardingDate: string; // YYYY-MM-DD at this leg's boarding station
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes?: number;
}

export interface CreateSplitBookingDto {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string; // YYYY-MM-DD
  travelClass: string;
  quota?: string;
  totalFare: number;
  legs: SplitBookingLeg[];
  passengers: SplitBookingPassenger[];
  childPassengers?: SplitBookingChildPassenger[];
  autoUpgrade?: boolean;
  contactMobile: string;
  contactEmail: string;
}

export interface SplitBookingStatusResponse {
  bookingRef: string;
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  totalFare: number;
  contactMobile: string;
  contactEmail: string;
  bookingMode: SplitBookingMode;
  serviceFee: number;
  amount: number;
  paymentStatus: SplitBookingPaymentStatus;
  bookingStatus: SplitBookingFulfillmentStatus;
  pnrs: string[];
  pnrLeg1?: string | null;
  pnrLeg2?: string | null;
  bookingError?: string | null;
  logs: Array<{ timestamp: string; step: string; message: string }>;
  paidAt?: string | null;
  completedAt?: string | null;
}
