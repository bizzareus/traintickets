/**
 * Helpers to keep local development noise out of Sentry and PostHog. When the
 * app runs on localhost we don't want its traces, transactions or product
 * events polluting production telemetry, so the Sentry configs and the PostHog
 * browser init use these to drop/skip anything originating from localhost.
 */

const LOCALHOST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

/** Strip brackets/port, leaving a bare hostname (handles IPv6 like [::1]:80). */
function normalizeHost(hostname: string): string {
  let h = hostname.toLowerCase().trim();
  if (h.startsWith("[")) {
    // Bracketed IPv6, optionally with a port: [::1] or [::1]:3009
    const end = h.indexOf("]");
    if (end !== -1) return h.slice(1, end);
  }
  // Only strip a port when there's a single colon (IPv4 / domain), never from
  // a bare IPv6 address like ::1 which has several colons.
  if ((h.match(/:/g) || []).length === 1) {
    h = h.slice(0, h.indexOf(":"));
  }
  return h;
}

/** True for localhost / loopback / *.local / *.localhost hostnames. */
export function isLocalhostHostname(hostname?: string | null): boolean {
  if (!hostname) return false;
  const h = normalizeHost(hostname);
  if (LOCALHOST_HOSTS.has(h)) return true;
  return h.endsWith(".local") || h.endsWith(".localhost");
}

/** True when a URL string points at a localhost host. */
export function isLocalhostUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    return isLocalhostHostname(new URL(url).hostname);
  } catch {
    return /(^|\/\/|@)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(
      url,
    );
  }
}

/** True when running in a browser whose page is served from localhost. */
export function isBrowserOnLocalhost(): boolean {
  return (
    typeof window !== "undefined" &&
    isLocalhostHostname(window.location?.hostname)
  );
}
