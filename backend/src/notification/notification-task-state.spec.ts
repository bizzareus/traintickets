import {
  notificationAttemptLimit,
  notificationTaskUpdate,
} from './notification-task-state';

describe('notification task state', () => {
  const task = { emailRetryCount: 0, whatsappRetryCount: 0 };
  const contact = { email: 'test@example.com', mobile: '919999999999' };
  const now = new Date('2026-09-29T00:05:00Z');

  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    'keeps paid notifications retryable after %s previous failures',
    (failures) => {
      const update = notificationTaskUpdate(
        { emailRetryCount: failures, whatsappRetryCount: failures },
        contact,
        { emailSent: false, whatsappSent: false },
        now,
        notificationAttemptLimit(true),
      );
      expect(update).toMatchObject({
        emailStatus: 'pending_retry',
        whatsappStatus: 'pending_retry',
        emailRetryCount: { increment: 1 },
        whatsappRetryCount: { increment: 1 },
      });
    },
  );

  it('exhausts paid delivery only after the initial attempt plus eight retries', () => {
    expect(notificationAttemptLimit(true)).toBe(9);
    expect(
      notificationTaskUpdate(
        { emailRetryCount: 8, whatsappRetryCount: 8 },
        contact,
        { emailSent: false, whatsappSent: false },
        now,
        notificationAttemptLimit(true),
      ),
    ).toMatchObject({ emailStatus: 'unsend', whatsappStatus: 'unsend' });
  });

  it('still records success or suppression on the last paid retry without incrementing failures', () => {
    const update = notificationTaskUpdate(
      { emailRetryCount: 8, whatsappRetryCount: 8 },
      contact,
      { emailSent: true, whatsappSent: false, whatsappSuppressed: true },
      now,
      notificationAttemptLimit(true),
    );
    expect(update).toMatchObject({
      emailStatus: 'sent',
      emailNotifiedAt: now,
      whatsappStatus: 'suppressed',
    });
    expect(update.emailRetryCount).toBeUndefined();
    expect(update.whatsappRetryCount).toBeUndefined();
  });

  it('records accepted channels independently', () => {
    expect(
      notificationTaskUpdate(
        task,
        contact,
        { emailSent: false, whatsappSent: true },
        now,
      ),
    ).toEqual({
      notificationLastAttemptAt: now,
      emailStatus: 'pending_retry',
      emailRetryCount: { increment: 1 },
      whatsappStatus: 'sent',
      whatsappNotifiedAt: now,
    });
  });
  it('suppression neither consumes a retry nor invents a send timestamp', () => {
    expect(
      notificationTaskUpdate(
        task,
        contact,
        {
          emailSent: false,
          whatsappSent: false,
          emailSuppressed: true,
          whatsappSuppressed: true,
        },
        now,
      ),
    ).toEqual({
      notificationLastAttemptAt: now,
      emailStatus: 'suppressed',
      whatsappStatus: 'suppressed',
    });
  });
  it('bounds failures for both channels to three attempts', () => {
    const update = notificationTaskUpdate(
      { emailRetryCount: 2, whatsappRetryCount: 2 },
      contact,
      { emailSent: false, whatsappSent: false },
      now,
    );
    expect(update).toMatchObject({
      emailStatus: 'unsend',
      whatsappStatus: 'unsend',
      emailRetryCount: { increment: 1 },
      whatsappRetryCount: { increment: 1 },
    });
    expect(update.emailNotifiedAt).toBeUndefined();
    expect(update.whatsappNotifiedAt).toBeUndefined();
  });
  it('does not modify a channel that was not attempted', () => {
    expect(
      notificationTaskUpdate(
        task,
        { mobile: contact.mobile },
        { emailSent: false, whatsappSent: true },
        now,
      ),
    ).toEqual({
      notificationLastAttemptAt: now,
      whatsappStatus: 'sent',
      whatsappNotifiedAt: now,
    });
  });
});
