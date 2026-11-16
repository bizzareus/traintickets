import { createHmac } from 'crypto';
import { safeCompareStrings } from '../common/admin-auth';

/**
 * HMAC-signing for unsubscribe/resubscribe links.
 *
 * The unsubscribe link used to embed the bare recipient as its only
 * credential, letting anyone opt any address out of paid alerts. Links now
 * carry an HMAC token over the recipient so only whoever received the message
 * (email or WhatsApp) can change the subscription state.
 *
 * Lives in its own module (not inside notification.service.ts) so the
 * controller and service can both import it without creating an import cycle.
 */

/** Shared HMAC secret — falls back through the platform secrets. */
function unsubscribeSecret(): string {
  return (
    process.env.CHART_TIME_INGESTION_PASSWORD?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'unsubscribe-link-salt'
  );
}

/** Sign a recipient (email or mobile) for inclusion in an unsubscribe link. */
export function signUnsubscribeToken(recipient: string): string {
  return createHmac('sha256', unsubscribeSecret())
    .update(
      String(recipient ?? '')
        .trim()
        .toLowerCase(),
    )
    .digest('hex');
}

/** Constant-time verify that `token` is the valid signature for `recipient`. */
export function verifyUnsubscribeToken(
  recipient: string | undefined | null,
  token: string | undefined | null,
): boolean {
  const normalized = String(recipient ?? '')
    .trim()
    .toLowerCase();
  const provided = String(token ?? '').trim();
  if (!normalized || !provided) return false;
  return safeCompareStrings(signUnsubscribeToken(normalized), provided);
}
