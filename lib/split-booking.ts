import { apiClient } from "@/lib/api";

export interface SplitBookingPassenger {
  name: string;
  age: number;
  gender: "Male" | "Female" | "Transgender";
  berthPreference?: string;
  seniorCitizen?: boolean;
}

export interface SplitBookingChildPassenger {
  name: string;
  age: number;
  gender: "Male" | "Female" | "Transgender";
}

export interface SplitBookingLeg {
  from: string;
  to: string;
  travelClass: string;
  fare: number;
  boardingDate: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
}

export interface CreateSplitBookingPayload {
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

export interface SplitBookingPrice {
  totalFare: number;
  serviceFee: number;
  amount: number;
}

export interface SplitBookingPaymentResponse extends SplitBookingPrice {
  bookingRef: string;
  bookingMode: "AI" | "MANUAL";
  payUrl: string;
}

export interface SplitBookingStatus extends SplitBookingPrice {
  bookingRef: string;
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  contactMobile: string;
  contactEmail: string;
  bookingMode: "AI" | "MANUAL";
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  payUrl: string | null;
  bookingStatus:
    | "IDLE"
    | "QUEUED"
    | "IN_PROGRESS"
    | "MANUAL_PENDING"
    | "CONFIRMED"
    | "FAILED";
  pnrs: string[];
  pnrLeg1?: string | null;
  pnrLeg2?: string | null;
  bookingError?: string | null;
  logs: Array<{ timestamp: string; step: string; message: string }>;
  paidAt?: string | null;
  completedAt?: string | null;
}

/**
 * Creates a split-ticket assisted booking and payment intent.
 */
export async function createSplitBooking(
  payload: CreateSplitBookingPayload,
): Promise<SplitBookingPaymentResponse> {
  const res = await apiClient.post<SplitBookingPaymentResponse>(
    "/api/split-booking/create",
    payload,
  );
  return res.data;
}

/**
 * Fetches status of the booking and payment.
 */
export async function fetchSplitBookingStatus(
  bookingRef: string,
): Promise<SplitBookingStatus> {
  const res = await apiClient.get<SplitBookingStatus>(
    `/api/split-booking/status/${encodeURIComponent(bookingRef)}`,
  );
  return res.data;
}

/**
 * Simulates payment confirmation in development/test environment.
 */
export async function simulateSplitBookingPayment(
  bookingRef: string,
): Promise<SplitBookingStatus> {
  const res = await apiClient.post<SplitBookingStatus>(
    `/api/split-booking/simulate-pay/${encodeURIComponent(bookingRef)}`,
  );
  return res.data;
}

export interface CancellationBookingDetails {
  bookingRef: string;
  trainNumber: string;
  trainName?: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  quota: string;
  totalFare: number;
  serviceFee: number;
  amount: number;
  passengers: {
    adults: Array<{
      name: string;
      age: number;
      gender: string;
      berthPreference?: string;
    }>;
    children?: Array<{ name: string; age: number; gender: string }>;
  };
  legsPayload: Array<{
    from: string;
    to: string;
    travelClass: string;
    fare: number;
  }>;
  bookingStatus: string;
  paymentStatus: string;
  pnrs: string[];
  pnrLeg1?: string | null;
  pnrLeg2?: string | null;
  createdAt: string;
  existingCancellation?: {
    id: string;
    status: "PENDING" | "PROCESSED" | "REJECTED";
    createdAt: string;
  } | null;
}

/**
 * Validates booking reference & mobile number to fetch ticket details for cancellation.
 */
export async function lookupBookingForCancellation(payload: {
  bookingRef: string;
  mobile: string;
}): Promise<CancellationBookingDetails> {
  const res = await apiClient.post<CancellationBookingDetails>(
    "/api/split-booking/cancellation/lookup",
    payload,
  );
  return res.data;
}

/**
 * Submits a cancellation request for a confirmed/in-progress booking.
 */
export async function submitBookingCancellation(payload: {
  bookingRef: string;
  mobile: string;
  reason?: string;
}): Promise<{ success: boolean; requestId: string; message: string }> {
  const res = await apiClient.post<{
    success: boolean;
    requestId: string;
    message: string;
  }>("/api/split-booking/cancellation/request", payload);
  return res.data;
}

