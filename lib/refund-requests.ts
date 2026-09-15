import { apiClient } from "@/lib/api";

export interface RefundRequestInput {
  mobile: string;
  trainNumber: string;
  journeyDate: string;
  txnId?: string;
}

export interface RefundRequestResult {
  ok: boolean;
  id: string;
  duplicate: boolean;
}

/**
 * Submit a manual refund request (mobile + train + journey date, optional
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
