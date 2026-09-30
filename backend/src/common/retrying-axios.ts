import axios, { type AxiosError, type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

export type RetryingAxiosClientOptions = {
  client?: AxiosInstance;
  retries?: number;
  serviceName?: string;
  retryPost?: boolean;
  retryStatuses?: number[];
  retryDelayMs?: number;
  retryCondition?: (error: AxiosError) => boolean;
  retryDelay?: (retryCount: number, error: AxiosError) => number;
  logRetries?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRequestBytes?: number;
};

export function createRetryingAxiosClient(
  opts: RetryingAxiosClientOptions = {},
): AxiosInstance {
  const retries = opts.retries ?? 3;
  const retryStatuses = new Set(
    opts.retryStatuses ?? [429, 500, 502, 503, 504],
  );
  const client =
    opts.client ??
    axios.create({
      timeout: opts.timeoutMs ?? 15_000,
      maxContentLength: opts.maxResponseBytes ?? 5 * 1024 * 1024,
      maxBodyLength: opts.maxRequestBytes ?? 1024 * 1024,
    });
  if (!client.defaults) client.defaults = {} as AxiosInstance['defaults'];
  const currentTimeout = client.defaults.timeout;
  const currentResponseLimit = client.defaults.maxContentLength;
  const currentRequestLimit = client.defaults.maxBodyLength;
  client.defaults.timeout =
    opts.timeoutMs ??
    (typeof currentTimeout === 'number' && currentTimeout > 0
      ? currentTimeout
      : 15_000);
  client.defaults.maxContentLength =
    opts.maxResponseBytes ??
    (typeof currentResponseLimit === 'number' && currentResponseLimit >= 0
      ? currentResponseLimit
      : 5 * 1024 * 1024);
  client.defaults.maxBodyLength =
    opts.maxRequestBytes ??
    (typeof currentRequestLimit === 'number' && currentRequestLimit >= 0
      ? currentRequestLimit
      : 1024 * 1024);

  axiosRetry(client, {
    retries,
    retryDelay:
      opts.retryDelay ??
      ((retryCount, error) =>
        typeof opts.retryDelayMs === 'number'
          ? opts.retryDelayMs
          : axiosRetry.exponentialDelay(retryCount, error, 1_000)),
    shouldResetTimeout: false,
    retryCondition:
      opts.retryCondition ??
      ((err: AxiosError) => {
        const method = err.config?.method?.toUpperCase();
        if (
          err.code === 'ERR_CANCELED' ||
          err.code === 'ECONNABORTED' ||
          /maxContentLength|maxBodyLength/i.test(err.message)
        ) {
          return false;
        }
        if (opts.retryPost !== true && method === 'POST') return false;
        if (axiosRetry.isNetworkOrIdempotentRequestError(err)) return true;

        const status = err.response?.status;
        return typeof status === 'number' && retryStatuses.has(status);
      }),
    onRetry: (retryCount, err, config) => {
      if (opts.logRetries === false) return;
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
