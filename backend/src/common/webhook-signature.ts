import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256(
  payload: Buffer | undefined,
  signature: string | undefined,
  secret: string | undefined,
  prefix = '',
): boolean {
  if (!payload?.length || !signature || !secret) return false;
  const expected = `${prefix}${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
