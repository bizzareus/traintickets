import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

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
  });
}
