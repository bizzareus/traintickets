import axios, { type AxiosError } from "axios";
import axiosRetry from "axios-retry";
import { captureApiException } from "@/lib/analytics/track";

/** Report a backend/API error to PostHog, then let the original rejection flow on. */
function reportApiError(error: AxiosError): Promise<never> {
  const data = error.response?.data as { message?: string; error?: string } | undefined;
  captureApiException(error, {
    method: error.config?.method?.toUpperCase(),
    url: error.config?.url,
    status: error.response?.status,
    message: error.message,
    responseMessage:
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      undefined,
  });
  return Promise.reject(error);
}

const getInitialApiUrl = () => {
  const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3009";
  
  // Mixed-content protection: If the page is HTTPS, the API must be HTTPS (except on localhost)
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http://") && !url.includes("localhost")) {
    return url.replace("http://", "https://");
  }
  return url;
};

const API_URL = getInitialApiUrl();

const IRCTC_SCHEDULE_TIMEOUT_MS = 10_000;

export function getApiUrl(): string {
  return API_URL;
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return { "Content-Type": "application/json" };
  const token = localStorage.getItem("accessToken");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  // Send the httpOnly `admin_session` cookie on same-origin and cross-origin
  // requests so the backend can authenticate admin pages without a JS-readable
  // password. The backend's CORS already allows lastberth.com + localhost
  // with credentials.
  withCredentials: true,
  // Default per-request timeout so a hung request aborts (and can be retried)
  // instead of hanging until the user gives up. Calls that legitimately need
  // longer (e.g. live scans) pass their own `timeout`, which overrides this.
  timeout: 20_000,
});

// The autocomplete (and most GETs) fired a single request with no resilience,
// so a transient network drop (weak mobile signal) or a brief backend blip
// surfaced as a hard "Network Error" with no retry. Retry idempotent (GET)
// requests on network errors / timeouts / 5xx so those hiccups recover
// silently. Non-idempotent methods are never retried (no double-submit).
axiosRetry(apiClient, {
  retries: 2,
  shouldResetTimeout: true,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error: AxiosError) => {
    const method = (error.config?.method ?? "get").toLowerCase();
    const idempotent =
      method === "get" || method === "head" || method === "options";
    if (!idempotent) return false;
    if (axiosRetry.isNetworkError(error)) return true;
    if (error.code === "ECONNABORTED") return true;
    const status = error.response?.status;
    return status != null && (status >= 500 || status === 408 || status === 429);
  },
});

apiClient.interceptors.request.use((config) => {
  config.headers = { ...getAuthHeaders(), ...config.headers } as typeof config.headers;
  return config;
});

apiClient.interceptors.response.use((response) => response, reportApiError);

/**
 * Axios instance for IRCTC train schedule: 10s per attempt, up to 3 retries on
 * timeouts, network errors, and 5xx (not on 404 etc.).
 */
export const irctcScheduleClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: IRCTC_SCHEDULE_TIMEOUT_MS,
});

axiosRetry(irctcScheduleClient, {
  retries: 3,
  shouldResetTimeout: true,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error: AxiosError) => {
    if (axiosRetry.isNetworkError(error)) return true;
    if (error.code === "ECONNABORTED") return true;
    const status = error.response?.status;
    if (status === 408 || status === 429) return true;
    if (status != null && status >= 500) return true;
    return false;
  },
});

irctcScheduleClient.interceptors.request.use((config) => {
  config.headers = {
    ...getAuthHeaders(),
    ...config.headers,
  } as typeof config.headers;
  return config;
});
