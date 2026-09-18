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

export interface SplitBookingPaymentResponse {
  bookingRef: string;
  amount: number;
  orderId: string;
  qrImageUrl: string;
  upiIntent?: string;
  gpayIntent?: string;
  phonepeIntent?: string;
}

export interface SplitBookingStatus {
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
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  bookingStatus: "IDLE" | "QUEUED" | "IN_PROGRESS" | "CONFIRMED" | "FAILED";
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
