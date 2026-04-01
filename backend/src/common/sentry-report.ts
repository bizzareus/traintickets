import * as Sentry from '@sentry/nestjs';

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

/**
 * Use inside try/catch that swallows or maps errors (e.g. SSE) so they still reach Sentry.
 * No-op when SENTRY_DSN is unset.
 */
export function captureSentryException(
  exception: unknown,
  opts?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  if (!isSentryEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTag('mechanism.type', 'manual.nestjs');
    if (opts?.tags) {
      for (const [k, v] of Object.entries(opts.tags)) {
        scope.setTag(k, v);
      }
    }
    if (opts?.extra) {
      for (const [k, v] of Object.entries(opts.extra)) {
        scope.setExtra(k, v);
      }
    }
    Sentry.captureException(exception);
  });
}
