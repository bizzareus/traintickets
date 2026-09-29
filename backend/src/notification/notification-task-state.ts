import type { ChartTimeAvailabilityTask, Prisma } from '@prisma/client';
import type { NotificationResult } from './notification.service';

export const MAX_NOTIFICATION_ATTEMPTS = 3;

/** Provider acceptance and intentional suppression are distinct terminal outcomes. */
export function notificationTaskUpdate(
  task: Pick<
    ChartTimeAvailabilityTask,
    'emailRetryCount' | 'whatsappRetryCount'
  >,
  contact: { email?: string | null; mobile?: string | null },
  result: NotificationResult,
  now = new Date(),
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
        : retries + 1 >= MAX_NOTIFICATION_ATTEMPTS
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
