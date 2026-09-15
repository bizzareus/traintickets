import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

/** Amount charged per chart-alert subscription (display only; backend enforces). */
const parsedPrice = Number(process.env.NEXT_PUBLIC_CHART_ALERT_PRICE_RUPEES);
export const CHART_ALERT_PRICE_RUPEES =
  Number.isFinite(parsedPrice) && parsedPrice >= 1
    ? Math.floor(parsedPrice)
    : 5;

export interface ChartAlertPaymentCreateInput {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  stationCodesToMonitor?: string[];
  email?: string;
  mobile?: string;
  trainStartDate?: string;
  /** Pinned chart times from the chart-times page row (optional). */
  chartTimeLocal?: string;
  chartOneDayOffset?: number;
  chartTwoTimeLocal?: string;
  chartTwoDayOffset?: number;
}

export interface ChartAlertPaymentLink {
  ref: string;
  payUrl: string;
  amount: number;
}

export interface ChartAlertPaymentStatus {
  status: "pending" | "paid" | "failed";
  ref: string;
  journeyCreated: boolean;
  journey: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode: string;
  } | null;
  refund?: {
    status: string;
    amount: number | null;
    razorpayRefundId: string | null;
    initiatedAt: string | null;
    refundedAt: string | null;
    error: string | null;
  } | null;
}

/**
 * Start a paid chart-alert subscription via the Muzobox payment proxy.
 * Resolves with the hosted `payUrl` — redirect the browser there.
 */
export async function createChartAlertPaymentLink(
  input: ChartAlertPaymentCreateInput,
): Promise<ChartAlertPaymentLink> {
  const res = await apiClient.post<
    ChartAlertPaymentLink | { error?: string; payUrl?: string }
  >("/api/chart-alert-payments/create", input);
  const data = res.data as ChartAlertPaymentLink & { error?: string };
  if (!data?.payUrl || typeof data.payUrl !== "string") {
    throw new Error(
      (typeof data?.error === "string" && data.error) ||
        "Could not start payment. Please try again.",
    );
  }
  return data;
}

export function redirectToPayment(payUrl: string): void {
  window.location.assign(payUrl);
}

/**
 * Shared paid-subscription flow for chart-alert surfaces: creates the Muzobox
 * payment link and records analytics. Returns the link — callers open it in
 * the {@link ChartAlertPaymentModal} iframe (fallback: redirectToPayment).
 * Persist contact details before calling; handle thrown errors with
 * {@link getChartAlertErrorMessage}.
 */
export async function startChartAlertPayment(
  input: ChartAlertPaymentCreateInput,
  source: "page" | "row" | "search_panel",
): Promise<ChartAlertPaymentLink> {
  const link = await createChartAlertPaymentLink(input);
  trackAnalyticsEvent({
    name: "chart_alert_payment_started",
    properties: {
      source,
      train_number: input.trainNumber.trim(),
      from_code: input.fromStationCode.trim().toUpperCase(),
      to_code: (input.toStationCode ?? "").trim().toUpperCase(),
      journey_date: input.journeyDate.trim().slice(0, 10),
      class_code: input.classCode.trim().toUpperCase(),
      price: CHART_ALERT_PRICE_RUPEES,
      has_email: Boolean(input.email?.trim()),
      has_mobile: Boolean(input.mobile?.trim()),
    },
  });
  return link;
}

/**
 * Free alert creation for admins (localStorage admin flag). POSTs directly
 * to the journey monitoring engine — no payment link, no popup. Works while
 * `REQUIRE_JOURNEY_PAYMENT` is off; throws otherwise.
 */
export async function createFreeChartAlert(
  input: ChartAlertPaymentCreateInput,
): Promise<void> {
  await apiClient.post("/api/availability/journey", input);
}

/** Normalize backend `{ error }`, axios, and generic errors to a message.
 */
export function getChartAlertErrorMessage(
  err: unknown,
  fallback: string,
): string {
  const e = err as {
    response?: {
      data?: {
        message?: string | string[];
        error?: string;
        errors?: Array<{ message?: string }>;
      };
    };
    message?: string;
  };
  const raw =
    e?.response?.data?.errors?.[0]?.message ??
    (Array.isArray(e?.response?.data?.message)
      ? e.response.data.message[0]
      : e?.response?.data?.message) ??
    e?.response?.data?.error ??
    (typeof e?.message === "string" && e.message) ??
    fallback;
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

export async function fetchChartAlertPaymentStatus(
  ref: string,
): Promise<ChartAlertPaymentStatus> {
  // Backend throws proper HTTP errors (400/404/503) — axios rejects and the
  // caller's catch maps it via getChartAlertErrorMessage. Only validate shape here.
  const res = await apiClient.get<ChartAlertPaymentStatus>(
    `/api/chart-alert-payments/status/${encodeURIComponent(ref)}`,
  );
  const data = res.data as ChartAlertPaymentStatus;
  if (!data || typeof data.status !== "string") {
    throw new Error("Could not check payment status. Please try again.");
  }
  return data;
}
