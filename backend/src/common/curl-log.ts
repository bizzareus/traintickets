/**
 * Build a copy-pasteable `curl` command for an outbound HTTP request, for
 * debugging what we actually send to upstreams (e.g. IRCTC). Sensitive header
 * values are redacted so secrets never reach logs / Sentry — the goal is to see
 * the final URL + headers, not to leak the cookie.
 */

const SENSITIVE_HEADERS = new Set([
  'cookie',
  'x-rapidapi-key',
  'authorization',
]);

/** Single-quote-safe value for a POSIX shell. */
function shellEscape(value: string): string {
  // Close quote, emit an escaped quote, reopen — the standard '\'' trick.
  return value.replace(/'/g, `'\\''`);
}

export function buildCurl(opts: {
  method?: string;
  url: string;
  headers?: Record<string, string | undefined>;
  body?: string;
}): string {
  const method = (opts.method ?? 'GET').toUpperCase();
  const parts: string[] = [`curl '${shellEscape(opts.url)}'`];
  if (method !== 'GET') parts.push(`-X ${method}`);

  for (const [key, raw] of Object.entries(opts.headers ?? {})) {
    if (raw == null) continue;
    const value = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? '<redacted>'
      : raw;
    parts.push(`-H '${shellEscape(key)}: ${shellEscape(value)}'`);
  }

  if (opts.body) parts.push(`--data-raw '${shellEscape(opts.body)}'`);
  return parts.join(' ');
}

/** Curl logging is on by default; set IRCTC_CURL_LOG=false to mute. */
export function curlLogEnabled(): boolean {
  return process.env.IRCTC_CURL_LOG?.trim().toLowerCase() !== 'false';
}
