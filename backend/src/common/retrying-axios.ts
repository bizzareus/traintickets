import axios, { type AxiosError, type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

export type RetryingAxiosClientOptions = {
  retries?: number;
  retryPost?: boolean;
  retryStatuses?: number[];
};

export function createRetryingAxiosClient(
  opts: RetryingAxiosClientOptions = {},
): AxiosInstance {
  const retries = opts.retries ?? 3;
  const retryStatuses = new Set(opts.retryStatuses ?? [429, 500, 502, 503, 504]);
  const client = axios.create();

  axiosRetry(client, {
    retries,
    retryDelay: (retryCount, error) =>
      axiosRetry.exponentialDelay(retryCount, error, 1_000),
    retryCondition: (err: AxiosError) => {
      const method = err.config?.method?.toUpperCase();
      if (opts.retryPost !== true && method === 'POST') return false;
      if (axiosRetry.isNetworkOrIdempotentRequestError(err)) return true;

      const status = err.response?.status;
      return typeof status === 'number' && retryStatuses.has(status);
    },
  });

  return client;
}
