import Cronitor from 'cronitor';
import axiosRetry from 'axios-retry';
import axios, { type AxiosInstance } from 'axios';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { CRONITOR_API_VERSION } from './cronitor.config';

/** The SDK logs rejected ping errors. Strip credentials/config before they reach it. */
export class CronitorRequestError extends Error {
  constructor(
    readonly status?: number,
    detail = '',
  ) {
    super(
      `Cronitor request failed (${status ?? 'network unavailable'})${detail ? `: ${detail}` : ''}`,
    );
  }
}

export function createCronitorClient(
  key: string,
  environment: string,
  timeout: number,
  management = false,
) {
  const sdk = Cronitor(key, {
    apiVersion: CRONITOR_API_VERSION,
    environment,
    timeout,
  });
  const http = createRetryingAxiosClient({
    client: sdk._api.axios as AxiosInstance,
    retries: management ? 1 : 0,
    retryCondition: (error) => error.response?.status === 429,
    retryDelay: (attempt, error) => {
      const body = error.response?.data as
        | { retry_after_seconds?: unknown }
        | undefined;
      const seconds = Number(body?.retry_after_seconds);
      return Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : axiosRetry.exponentialDelay(attempt, error);
    },
    logRetries: false,
  });
  http.defaults.maxRedirects = 0;
  http.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (error instanceof CronitorRequestError) return Promise.reject(error);
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      const body = axios.isAxiosError(error)
        ? (error.response?.data as
            | {
                message?: unknown;
                upgrade_url?: unknown;
                error?: { message?: unknown };
              }
            | undefined)
        : undefined;
      const detail = management
        ? [body?.message ?? body?.error?.message, body?.upgrade_url]
            .filter((value) => typeof value === 'string')
            .join(' ')
            .replaceAll(key, '[redacted]')
            .slice(0, 1000)
        : '';
      return Promise.reject(new CronitorRequestError(status, detail));
    },
  );
  return { sdk, http };
}
