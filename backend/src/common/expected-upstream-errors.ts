/**
 * Expected/benign upstream (IRCTC) conditions that should NOT be recorded in
 * Sentry. These are normal states — not bugs — that would otherwise flood the
 * issue list and bury real errors. The matcher is applied at every Sentry
 * reporting gate (manual capture, the global exception filter, and beforeSend)
 * so a matching condition is dropped regardless of which code path emits it.
 *
 * Add a sibling expected/transient condition by appending its pattern here.
 */
export const BENIGN_UPSTREAM_ERROR_PATTERNS: RegExp[] = [
  // "Chart not prepared" — charts aren't prepared until ~4h before departure.
  /chart\s*not\s*prepared|not\s+yet\s*prepared|chart\s*not\s*ready/i,
  // "Train Cancelled" — a normal upstream state (the run isn't operating), not a
  // fault. Return/log it as data; don't flag it as an error in Sentry.
  /train\s+cancell?ed/i,
  // 403 forbidden / anti-bot challenge responses from proxies in background cron runners.
  /unexpected\s+server\s+response:\s*403/i,
];

/** True when a message matches a known expected/benign upstream condition. */
export function isBenignUpstreamErrorMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  return BENIGN_UPSTREAM_ERROR_PATTERNS.some((re) => re.test(message));
}

/** Extract a message from common error shapes and test it against the denylist. */
export function isBenignUpstreamError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === 'string') return isBenignUpstreamErrorMessage(err);
  if (err instanceof Error) return isBenignUpstreamErrorMessage(err.message);
  if (typeof err === 'object') {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return isBenignUpstreamErrorMessage(msg);
  }
  return false;
}
