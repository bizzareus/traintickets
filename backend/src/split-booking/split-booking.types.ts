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
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  bookingStatus: 'IDLE' | 'QUEUED' | 'IN_PROGRESS' | 'CONFIRMED' | 'FAILED';
  pnrLeg1?: string | null;
  pnrLeg2?: string | null;
  bookingError?: string | null;
  logs: Array<{ timestamp: string; step: string; message: string }>;
  paidAt?: string | null;
  completedAt?: string | null;
}
