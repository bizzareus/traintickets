import axios, { type AxiosError, type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

export type RetryingAxiosClientOptions = {
  retries?: number;
  serviceName?: string;
  retryPost?: boolean;
  retryTimeouts?: boolean;
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
    shouldResetTimeout: true,
    retryCondition: (err: AxiosError) => {
      const method = err.config?.method?.toUpperCase();
      if (opts.retryPost !== true && method === 'POST') return false;
      if (opts.retryTimeouts === true && err.code === 'ECONNABORTED') {
        return true;
      }
      if (axiosRetry.isNetworkOrIdempotentRequestError(err)) return true;

      const status = err.response?.status;
      return typeof status === 'number' && retryStatuses.has(status);
    },
    onRetry: (retryCount, err, config) => {
      const method = config.method?.toUpperCase() ?? 'UNKNOWN';
      const url = config.url ?? 'unknown-url';
      const code = err.code ?? 'n/a';
      const status = err.response?.status ?? 'n/a';
      const prefix = opts.serviceName
        ? `[${opts.serviceName}] `
        : '[external-api] ';
      console.warn(
        `${prefix}retry attempt=${retryCount}/${retries} method=${method} url=${url} status=${status} code=${code} message=${err.message}`,
      );
    },
  });

  return client;
}
