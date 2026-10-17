import { createHmac } from 'node:crypto';
import { verifyHmacSha256 } from './webhook-signature';

describe('verifyHmacSha256', () => {
  const secret = 'test-secret-key';
  const payloadStr = JSON.stringify({ event: 'test.event', data: 123 });
  const payloadBuf = Buffer.from(payloadStr, 'utf8');

  it('returns true for a valid signature matching payload and secret', () => {
    const validSignature = createHmac('sha256', secret)
      .update(payloadBuf)
      .digest('hex');
    expect(verifyHmacSha256(payloadBuf, validSignature, secret)).toBe(true);
  });

  it('returns true when using prefix option (e.g. sha256=)', () => {
    const hash = createHmac('sha256', secret).update(payloadBuf).digest('hex');
    const prefixedSignature = `sha256=${hash}`;
    expect(
      verifyHmacSha256(payloadBuf, prefixedSignature, secret, 'sha256='),
    ).toBe(true);
  });

  it('returns false when signature does not match secret', () => {
    const signature = createHmac('sha256', 'wrong-secret')
      .update(payloadBuf)
      .digest('hex');
    expect(verifyHmacSha256(payloadBuf, signature, secret)).toBe(false);
  });

  it('returns false when payload is empty or undefined', () => {
    const validSignature = createHmac('sha256', secret)
      .update(payloadBuf)
      .digest('hex');
    expect(verifyHmacSha256(undefined, validSignature, secret)).toBe(false);
    expect(verifyHmacSha256(Buffer.alloc(0), validSignature, secret)).toBe(
      false,
    );
  });

  it('returns false when signature or secret is missing or empty', () => {
    expect(verifyHmacSha256(payloadBuf, undefined, secret)).toBe(false);
    expect(verifyHmacSha256(payloadBuf, '', secret)).toBe(false);
    expect(verifyHmacSha256(payloadBuf, 'signature', undefined)).toBe(false);
    expect(verifyHmacSha256(payloadBuf, 'signature', '')).toBe(false);
  });

  it('returns false and does not throw for signature of mismatched length or malformed input', () => {
    expect(verifyHmacSha256(payloadBuf, 'invalid-short-sig', secret)).toBe(
      false,
    );
    expect(
      verifyHmacSha256(
        payloadBuf,
        'a'.repeat(64), // Same length hex string but invalid content
        secret,
      ),
    ).toBe(false);
  });
});
