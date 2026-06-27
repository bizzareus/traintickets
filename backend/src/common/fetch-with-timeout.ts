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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
