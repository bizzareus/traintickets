import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './unsubscribe-token';

describe('unsubscribe-token', () => {
  it('round-trips a signed recipient', () => {
    const token = signUnsubscribeToken('User@Example.com ');
    expect(verifyUnsubscribeToken('user@example.com', token)).toBe(true);
  });

  it('rejects a mismatched recipient or token', () => {
    const token = signUnsubscribeToken('user@example.com');
    expect(verifyUnsubscribeToken('other@example.com', token)).toBe(false);
    expect(verifyUnsubscribeToken('user@example.com', 'deadbeef')).toBe(false);
  });

  it('rejects missing recipient or token', () => {
    expect(verifyUnsubscribeToken('', signUnsubscribeToken('a@b.co'))).toBe(
      false,
    );
    expect(verifyUnsubscribeToken('a@b.co', '')).toBe(false);
    expect(verifyUnsubscribeToken(undefined, undefined)).toBe(false);
  });

  it('is deterministic for equivalent recipient casing/whitespace', () => {
    expect(signUnsubscribeToken('  A@Example.COM ')).toBe(
      signUnsubscribeToken('a@example.com'),
    );
  });
});
