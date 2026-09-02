/**
 * Validation utilities for user contact details (Indian mobile & email).
 */

/**
 * Matches a valid Indian mobile number:
 * - 10 digits starting with 6, 7, 8, or 9 (e.g. 9876543210)
 * - With optional country code prefix: +919876543210 or 919876543210
 * - With optional leading zero: 09876543210
 */
export const INDIAN_MOBILE_REGEX = /^(?:\+?91|0)?[6-9]\d{9}$/;

export function isValidIndianMobile(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const clean = phone.replace(/[\s-]/g, "");
  return INDIAN_MOBILE_REGEX.test(clean);
}

/**
 * Extracts and normalizes an Indian mobile number to clean 10 digits.
 * Returns null if invalid.
 */
export function extract10DigitIndianMobile(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return digits;
  }
  if (
    digits.length === 11 &&
    digits.startsWith("0") &&
    /^[6-9]/.test(digits.slice(1))
  ) {
    return digits.slice(1);
  }
  if (
    digits.length === 12 &&
    digits.startsWith("91") &&
    /^[6-9]/.test(digits.slice(2))
  ) {
    return digits.slice(2);
  }
  return null;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_REGEX.test(email.trim());
}
