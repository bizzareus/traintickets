import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { isBenignUpstreamErrorMessage } from './common/expected-upstream-errors';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function normalizeHost(hostname: string): string {
  let h = hostname.toLowerCase().trim();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end !== -1) return h.slice(1, end);
  }
  if ((h.match(/:/g) || []).length === 1) {
    h = h.slice(0, h.indexOf(':'));
  }
  return h;
}

function isLocalhostHostname(hostname?: string | null): boolean {
  if (!hostname) return false;
  const h = normalizeHost(hostname);
  return (
    LOCALHOST_HOSTS.has(h) || h.endsWith('.local') || h.endsWith('.localhost')
  );
}

function isLocalhostUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    return isLocalhostHostname(new URL(url).hostname);
  } catch {
    return /(^|\/\/|@)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(
      url,
    );
  }
}

/** Drop events/traces tied to a localhost host, keeping local dev out of Sentry. */
function isLocalhostEvent(event: {
  request?: { url?: string };
  server_name?: string;
}): boolean {
  return (
    isLocalhostUrl(event.request?.url) || isLocalhostHostname(event.server_name)
  );
}

/**
 * Final backstop: drop events whose exception message is a known expected
 * upstream condition (e.g. "Chart not prepared"), in case one reaches Sentry
 * via a path that bypasses the manual capture / global filter gates.
 */
function isBenignUpstreamEvent(event: {
  exception?: { values?: Array<{ value?: string }> };
}): boolean {
  return Boolean(
    event.exception?.values?.some((v) =>
      isBenignUpstreamErrorMessage(v?.value),
    ),
  );
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function defaultSampleRate(): number {
  return process.env.NODE_ENV === 'production' ? 0.2 : 1.0;
}

/** Prefer SENTRY_PROFILE_SESSION_SAMPLE_RATE; SENTRY_PROFILES_SAMPLE_RATE kept for older docs. */
function profileSessionSampleRate(): number {
  return parseSampleRate(
    process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE?.trim() ||
      process.env.SENTRY_PROFILES_SAMPLE_RATE?.trim(),
    defaultSampleRate(),
  );
}

/** Matches Sentry wizard: true unless SENTRY_SEND_DEFAULT_PII is 0/false/no. */
function sendDefaultPii(): boolean {
  const v = process.env.SENTRY_SEND_DEFAULT_PII?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return true;
}

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.NODE_ENV ||
      'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: parseSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE,
      defaultSampleRate(),
    ),
    profileSessionSampleRate: profileSessionSampleRate(),
    profileLifecycle: 'trace',
    sendDefaultPii: sendDefaultPii(),
    beforeSend: (event) =>
      isLocalhostEvent(event) || isBenignUpstreamEvent(event) ? null : event,
    beforeSendTransaction: (event) => (isLocalhostEvent(event) ? null : event),
  });
}
