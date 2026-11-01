import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256(
  rawPayload: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
  prefix = '',
): boolean {
  if (!rawPayload || !signature || !secret) return false;
  const payload =
    typeof rawPayload === 'string' ? Buffer.from(rawPayload) : rawPayload;
  if (!payload.length) return false;

  const expected = `${prefix}${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;
  try {
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
