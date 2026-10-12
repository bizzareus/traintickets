"use client";

import { apiClient } from "@/lib/api";
import { getAccessToken } from "@auth0/nextjs-auth0/client";

export const SEARCH_CREDITS_EXHAUSTED_CODE = "SEARCH_CREDITS_EXHAUSTED";
export const FREE_SEARCHES_PER_IP = 3;
export const CREDIT_PACK_PRICE_INR = 100;
export const CREDIT_PACK_QUANTITY = 100;

export type CreditBalance = {
  authenticated: boolean;
  freeUsed: number;
  freeRemaining: number;
  paidBalance: number;
};

export type ExhaustionInfo = {
  freeRemaining: number;
  paidBalance: number;
};

/** Null when signed out (or the session endpoint is unreachable). */
export async function getAccessTokenSafe(): Promise<string | null> {
  try {
    return await getAccessToken();
  } catch {
    return null;
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessTokenSafe();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function newSearchRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function fetchCreditBalance(): Promise<CreditBalance> {
  const r = await apiClient.get<CreditBalance>("/api/search-credits/balance", {
    headers: await authHeaders(),
  });
  return r.data;
}

/**
 * Admit a cached preview (shows instantly, charged as a completed search).
 * Throws ExhaustedError when the paywall must open.
 */
export async function admitCachedPreview(args: {
  trainNumber: string;
  from: string;
  to: string;
  date: string;
  classes?: string[];
  quota?: string;
}): Promise<{ requestId: string; source: string }> {
  try {
    const r = await apiClient.post(
      "/api/search-credits/admit",
      {
        searchRequestId: newSearchRequestId(),
        trainNumber: args.trainNumber,
        from: args.from,
        to: args.to,
        date: args.date,
        ...(args.classes && args.classes.length > 0
          ? { classes: args.classes }
          : {}),
        ...(args.quota ? { quota: args.quota } : {}),
        markCompleted: true,
      },
      { headers: await authHeaders() },
    );
    return r.data;
  } catch (err) {
    throw normalizeCreditsError(err);
  }
}

export class ExhaustedError extends Error {
  info: ExhaustionInfo;
  constructor(info: ExhaustionInfo) {
    super(
      `You've used your ${FREE_SEARCHES_PER_IP} free searches. Get ${CREDIT_PACK_QUANTITY} search credits for ₹${CREDIT_PACK_PRICE_INR}.`,
    );
    this.name = "ExhaustedError";
    this.info = info;
  }
}

/** Map an axios/fetch 402 with our code to ExhaustedError; else rethrow. */
export function normalizeCreditsError(err: unknown): unknown {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    | { code?: string; freeRemaining?: number; paidBalance?: number }
    | undefined;
  if (status === 402 && data?.code === SEARCH_CREDITS_EXHAUSTED_CODE) {
    return new ExhaustedError({
      freeRemaining: data.freeRemaining ?? 0,
      paidBalance: data.paidBalance ?? 0,
    });
  }
  if (err instanceof Response) return err;
  return err;
}

/** Read a 402 JSON denial from a raw fetch() stream call. */
export async function throwIfExhaustedResponse(resp: Response): Promise<void> {
  if (resp.status !== 402) return;
  let info: ExhaustionInfo = { freeRemaining: 0, paidBalance: 0 };
  try {
    const j = (await resp.json()) as {
      code?: string;
      freeRemaining?: number;
      paidBalance?: number;
    };
    if (j.code === SEARCH_CREDITS_EXHAUSTED_CODE) {
      info = {
        freeRemaining: j.freeRemaining ?? 0,
        paidBalance: j.paidBalance ?? 0,
      };
    }
  } catch {
    /* non-JSON 402 — still exhausted */
  }
  throw new ExhaustedError(info);
}

export type PurchaseStatus = {
  purchaseRef: string;
  status: "PENDING" | "PAID" | "FAILED";
  amount: number;
  credits: number;
  paidAt: string | null;
  balance: number;
  totalPurchased: number;
};

export async function createCreditPurchase(args: {
  contactEmail?: string;
  contactMobile?: string;
}): Promise<{ purchaseRef: string; payUrl: string; amount: number; credits: number }> {
  const r = await apiClient.post(
    "/api/search-credits/purchases",
    {
      ...(args.contactEmail ? { contactEmail: args.contactEmail } : {}),
      ...(args.contactMobile ? { contactMobile: args.contactMobile } : {}),
    },
    { headers: await authHeaders() },
  );
  return r.data;
}

export async function fetchPurchaseStatus(
  purchaseRef: string,
): Promise<PurchaseStatus> {
  const r = await apiClient.get<PurchaseStatus>(
    `/api/search-credits/purchases/${encodeURIComponent(purchaseRef)}`,
    { headers: await authHeaders() },
  );
  return r.data;
}

export async function verifyPurchase(
  purchaseRef: string,
): Promise<PurchaseStatus> {
  const r = await apiClient.post<PurchaseStatus>(
    `/api/search-credits/purchases/${encodeURIComponent(purchaseRef)}/verify`,
    {},
    { headers: await authHeaders() },
  );
  return r.data;
}
