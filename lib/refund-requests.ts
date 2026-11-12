import { apiClient } from "@/lib/api";

export interface RefundRequestInput {
  email: string;
  trainNumber: string;
  journeyDate: string;
  txnId?: string;
}

export interface RefundRequestResult {
  ok: boolean;
  id: string;
  duplicate: boolean;
  autoRefunded?: boolean;
  amount?: number;
  refundId?: string | null;
}

export interface RefundQuoteResult {
  ok: boolean;
  found: boolean;
  amount: number;
  currency: string;
  autoRefundEligible: boolean;
  trainNumber?: string;
  journeyDate?: string;
}

/**
 * Fetch the quoted refund amount for a transaction before submitting.
 */
export async function getRefundQuote(
  input: RefundRequestInput,
): Promise<RefundQuoteResult> {
  const res = await apiClient.post<RefundQuoteResult>(
    "/api/refund-requests/quote",
    input,
  );
  return res.data;
}

/**
 * Submit a manual refund request (email + train + journey date, optional
 * transaction id). Resolves with the stored request id.
 */
export async function createRefundRequest(
  input: RefundRequestInput,
): Promise<RefundRequestResult> {
  const res = await apiClient.post<RefundRequestResult>(
    "/api/refund-requests",
    input,
  );
  const data = res.data as RefundRequestResult & { error?: string };
  if (!data?.ok || typeof data.id !== "string") {
    throw new Error(
      (typeof data?.error === "string" && data.error) ||
        "Could not submit your refund request. Please try again.",
    );
  }
  return data;
}
