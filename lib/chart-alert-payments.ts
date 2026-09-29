import { apiClient, PAYMENT_SYSTEM_UNAVAILABLE_MESSAGE } from "@/lib/api";
import * as Sentry from "@sentry/nextjs";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

/**
 * Class-based chart-alert pricing (display only; backend enforces).
 * ANY covers every available class, 1A/2A/3A pay the premium tier, and
 * every other class pays standard. Keep in sync with the backend pricing rule.
 */
const PREMIUM_ALERT_CLASSES = new Set(["1A", "2A", "3A"]);
export const CHART_ALERT_ANY_PRICE_RUPEES = 50;
export const CHART_ALERT_PREMIUM_PRICE_RUPEES = 25;
export const CHART_ALERT_STANDARD_PRICE_RUPEES = 10;

export function chartAlertPriceForClass(classCode?: string | null): number {
  const normalized = (classCode ?? "").trim().toUpperCase();
  if (normalized === "ANY") return CHART_ALERT_ANY_PRICE_RUPEES;
  return PREMIUM_ALERT_CLASSES.has(normalized)
    ? CHART_ALERT_PREMIUM_PRICE_RUPEES
    : CHART_ALERT_STANDARD_PRICE_RUPEES;
}

export function chartAlertListPriceForClass(
  classCode?: string | null,
): number {
  return chartAlertPriceForClass(classCode) * 2;
}

export function chartAlertClassPriceLabel(
  classLabel: string,
  classCode: string,
): string {
  const price = chartAlertPriceForClass(classCode);
  return `${classLabel} — ₹${price * 2} → ₹${price} (50% off)`;
}

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
  amount: number;
  orderId: string;
  /** Payment URL if generated via proxy. */
  payUrl?: string;
  /** Razorpay-hosted QR PNG for the single-use UPI QR. */
  qrImageUrl: string;
  /** `upi://pay?...` — works in any UPI app (mobile only). */
  upiIntent?: string;
  /** Google Pay deep link (`tez://`). */
  gpayIntent?: string;
  /** PhonePe deep link (`phonepe://`). */
  phonepeIntent?: string;
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
 * Start a paid chart-alert subscription via Razorpay (order + single-use
 * UPI QR). Resolves with the QR image and per-app intent links — the
 * modal renders its own checkout, no redirect.
 */
export async function createChartAlertPaymentLink(
  input: ChartAlertPaymentCreateInput,
): Promise<ChartAlertPaymentLink> {
  const res = await apiClient.post<
    ChartAlertPaymentLink | { error?: string }
  >("/api/chart-alert-payments/create", input);
  const data = res.data as ChartAlertPaymentLink & { error?: string };
  if (!data?.qrImageUrl || typeof data.qrImageUrl !== "string") {
    throw new Error(
      (typeof data?.error === "string" && data.error) ||
        "Could not start payment. Please try again.",
    );
  }
  return data;
}

/**
 * Shared paid-subscription flow for chart-alert surfaces: creates the
 * Razorpay order + UPI QR and records analytics. Returns the payment —
 * callers render it in the {@link ChartAlertPaymentModal} (QR + app
 * buttons). Persist contact details before calling; handle thrown errors
 * with {@link getChartAlertErrorMessage}.
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
      price: chartAlertPriceForClass(input.classCode),
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
    __sentry_reported__?: boolean;
  };
  const raw =
    e?.response?.data?.errors?.[0]?.message ??
    (Array.isArray(e?.response?.data?.message)
      ? e.response.data.message[0]
      : e?.response?.data?.message) ??
    e?.response?.data?.error ??
    (typeof e?.message === "string" && e.message) ??
    fallback;
  const message = typeof raw === "string" ? raw : JSON.stringify(raw);

  if (
    (message === PAYMENT_SYSTEM_UNAVAILABLE_MESSAGE ||
      message.includes(PAYMENT_SYSTEM_UNAVAILABLE_MESSAGE)) &&
    !e?.__sentry_reported__
  ) {
    if (e && typeof e === "object") {
      e.__sentry_reported__ = true;
    }
    Sentry.captureException(err instanceof Error ? err : new Error(message), {
      tags: { payment_system: "unavailable" },
      extra: { message },
    });
  }

  return message;
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
