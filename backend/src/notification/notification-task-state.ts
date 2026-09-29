import type { ChartTimeAvailabilityTask, Prisma } from '@prisma/client';
import type { NotificationResult } from './notification.service';

export const MAX_NOTIFICATION_ATTEMPTS = 3;
export const PAID_NOTIFICATION_RETRIES = 8;
export const NOTIFICATION_RETRY_INTERVAL_MS = 5 * 60_000;

/** Stored counters include the failed initial send, so eight retries allow nine attempts. */
export function notificationAttemptLimit(isPaid: boolean): number {
  return isPaid ? 1 + PAID_NOTIFICATION_RETRIES : MAX_NOTIFICATION_ATTEMPTS;
}

export function notificationTerminalStatuses(isPaid: boolean): string[] {
  return isPaid ? ['suppressed'] : ['unsend', 'suppressed'];
}

/** Provider acceptance and intentional suppression are distinct terminal outcomes. */
export function notificationTaskUpdate(
  task: Pick<
    ChartTimeAvailabilityTask,
    'emailRetryCount' | 'whatsappRetryCount'
  >,
  contact: { email?: string | null; mobile?: string | null },
  result: NotificationResult,
  now = new Date(),
  maxAttempts = MAX_NOTIFICATION_ATTEMPTS,
): Prisma.ChartTimeAvailabilityTaskUpdateInput {
  const state = (
    sent: boolean,
    suppressed: boolean | undefined,
    retries: number,
  ) =>
    sent
      ? 'sent'
      : suppressed
        ? 'suppressed'
        : retries + 1 >= maxAttempts
          ? 'unsend'
          : 'pending_retry';
  return {
    notificationLastAttemptAt: now,
    ...(contact.email?.trim()
      ? {
          emailStatus: state(
            result.emailSent,
            result.emailSuppressed,
            task.emailRetryCount ?? 0,
          ),
          ...(result.emailSent
            ? { emailNotifiedAt: now }
            : !result.emailSuppressed
              ? { emailRetryCount: { increment: 1 } }
              : {}),
        }
      : {}),
    ...(contact.mobile?.trim()
      ? {
          whatsappStatus: state(
            result.whatsappSent,
            result.whatsappSuppressed,
            task.whatsappRetryCount ?? 0,
          ),
          ...(result.whatsappSent
            ? { whatsappNotifiedAt: now }
            : !result.whatsappSuppressed
              ? { whatsappRetryCount: { increment: 1 } }
              : {}),
        }
      : {}),
  };
}
