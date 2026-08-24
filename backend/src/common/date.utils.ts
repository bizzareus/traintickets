import { DateTime } from 'luxon';

/**
 * Format a Date or date string to YYYY-MM-DD in Asia/Kolkata (IST) timezone.
 * Handles Date objects initialized at midnight IST cleanly without UTC rollback bugs.
 */
export function toIstYmd(date: Date | string | null | undefined): string {
  if (!date) return '';
  if (typeof date === 'string') return date.trim().slice(0, 10);
  const dt = DateTime.fromJSDate(date).setZone('Asia/Kolkata');
  return dt.isValid
    ? dt.toFormat('yyyy-MM-dd')
    : date.toISOString().slice(0, 10);
}
