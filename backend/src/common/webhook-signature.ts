import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256(
  payload: Buffer | undefined,
  signature: string | undefined,
  secret: string | undefined,
  prefix = '',
): boolean {
  try {
    if (!payload?.length || !signature || !secret) return false;
    const expected = `${prefix}${createHmac('sha256', secret).update(payload).digest('hex')}`;
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
