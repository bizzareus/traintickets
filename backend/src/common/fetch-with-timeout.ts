/**
 * fetch() with a hard timeout via AbortController.
 *
 * Bare fetch() has no timeout, so a single slow/hung IRCTC upstream call could
 * run for 50-70s and dominate a request's p95 (and pin a connection/worker the
 * whole time). Wrapping these calls bounds the wait: on timeout the fetch
 * rejects (AbortError) and the caller treats the upstream as unavailable.
 */
export const DEFAULT_IRCTC_TIMEOUT_MS = (() => {
  const n = Number.parseInt(process.env.IRCTC_FETCH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n >= 1000 && n <= 60_000 ? n : 12_000;
})();

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_IRCTC_TIMEOUT_MS,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  return fetch(input, { ...init, signal });
}

export async function readResponseText(
  response: Response,
  maxBytes = 5 * 1024 * 1024,
): Promise<string> {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Transient network-error signatures worth retrying on a FRESH connection.
 * The big one is Akamai intermittently resetting an HTTP/2 stream
 * (`NGHTTP2_INTERNAL_ERROR`) on a reused keep-alive connection: the connection
 * is poisoned, but undici/got evict it on error, so the next attempt gets a new
 * connection and usually succeeds. Also covers ordinary resets/hangs.
 */
const TRANSIENT_ERROR_PATTERNS = [
  'nghttp2',
  'err_http2',
  'econnreset',
  'econnrefused',
  'etimedout',
  'epipe',
  'enotfound',
  'eai_again',
  'socket hang up',
  'stream closed',
  'other side closed',
  'terminated',
  'und_err',
  'fetch failed',
  'network',
  'aborted', // AbortError from our own timeout — often a poisoned/hung connection
];

/** True if the error (or any nested cause) looks like a transient network blip. */
export function isTransientNetworkError(err: unknown): boolean {
  const haystack: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur != null; depth++) {
    if (typeof cur === 'string') {
      haystack.push(cur);
      break;
    }
    if (cur instanceof Error) {
      haystack.push(cur.message, cur.name);
      const code = (cur as { code?: unknown }).code;
      if (typeof code === 'string' || typeof code === 'number') {
        haystack.push(`${code}`);
      }
      cur = (cur as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  const hay = haystack.join(' ').toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((p) => hay.includes(p));
}

/**
 * Run an async operation, retrying on transient network errors (see above) with
 * a short linear backoff. Non-transient errors (HTTP 4xx/5xx via got's
 * HTTPError, JSON errors, etc.) are thrown immediately — this only shields
 * against connection-level flakiness. Retries only fire on failure, so there is
 * no added latency on the happy path.
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    backoffMs?: number;
    onRetry?: (attempt: number, err: unknown) => void;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const backoffMs = opts.backoffMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts && isTransientNetworkError(err)) {
        opts.onRetry?.(attempt, err);
        await new Promise((r) => setTimeout(r, backoffMs * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
