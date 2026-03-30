import axios, { type AxiosError } from "axios";
import axiosRetry from "axios-retry";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3009";

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
});

apiClient.interceptors.request.use((config) => {
  config.headers = { ...getAuthHeaders(), ...config.headers } as typeof config.headers;
  return config;
});

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
