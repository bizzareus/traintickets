import { createHmac, timingSafeEqual } from "crypto";

/**
 * Safely compare two string secrets in constant time using HMAC digests
 * to prevent timing side-channel attacks during secret or token verification.
 */
export function safeCompareStrings(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const aBuf = createHmac("sha256", "lastberth-crypto-salt").update(a).digest();
  const bBuf = createHmac("sha256", "lastberth-crypto-salt").update(b).digest();
  return timingSafeEqual(aBuf, bBuf);
}
