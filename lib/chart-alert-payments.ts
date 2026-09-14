import { apiClient } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

/** Amount charged per chart-alert subscription (display only; backend enforces). */
export const CHART_ALERT_PRICE_RUPEES = Number(
  process.env.NEXT_PUBLIC_CHART_ALERT_PRICE_RUPEES ?? 5,
);

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
 * payment link, records analytics, and redirects the browser to pay.
 * Persist contact details before calling; handle thrown errors with
 * {@link getChartAlertErrorMessage}.
 */
export async function startChartAlertPayment(
  input: ChartAlertPaymentCreateInput,
  source: "page" | "row" | "search_panel",
): Promise<void> {
  const { payUrl } = await createChartAlertPaymentLink(input);
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
  redirectToPayment(payUrl);
}

/** Normalize backend `{ error }`, axios, and generic errors to a message. */
export function getChartAlertErrorMessage(
  err: unknown,
  fallback: string,
): string {
  const e = err as {
    response?: {
      data?: { message?: string; errors?: Array<{ message?: string }> };
    };
    message?: string;
  };
  const msg =
    e?.response?.data?.errors?.[0]?.message ||
    e?.response?.data?.message ||
    (typeof e?.message === "string" && e.message) ||
    fallback;
  return typeof msg === "string" ? msg : JSON.stringify(msg);
}

export async function fetchChartAlertPaymentStatus(
  ref: string,
): Promise<ChartAlertPaymentStatus> {
  const res = await apiClient.get<
    ChartAlertPaymentStatus | { error?: string; status?: string }
  >(`/api/chart-alert-payments/status/${encodeURIComponent(ref)}`);
  const data = res.data as ChartAlertPaymentStatus & { error?: string };
  if (!data || (typeof data.status !== "string" && !data.error)) {
    throw new Error("Could not check payment status. Please try again.");
  }
  if (data.error && data.status !== "paid" && data.status !== "pending" && data.status !== "failed") {
    throw new Error(data.error);
  }
  return data as ChartAlertPaymentStatus;
}
