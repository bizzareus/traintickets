import moment from 'moment';

/** Indian Railways has valid one-letter station codes, including R and G. */
export const STATION_CODE_RE = /^[A-Z0-9]{1,6}$/;

export const SEAT_CACHE_RETENTION_SECONDS = 48 * 3600;

/** Retention is not freshness: never serve a two-day-old availability snapshot. */
export function seatCacheFreshnessSeconds(
  journeyDate: string,
  now = Date.now(),
): number {
  const date = moment.utc(journeyDate, 'YYYY-MM-DD', true);
  const today = moment.utc(moment(now).utcOffset(330).format('YYYY-MM-DD'));
  const daysAhead = date.diff(today, 'days');
  if (!date.isValid() || daysAhead < 0) return 0;
  const freshness =
    daysAhead === 0 ? 10 * 60 : daysAhead <= 7 ? 3600 : 6 * 3600;
  // Re-evaluate the horizon at IST midnight, including in frontend readers.
  const untilMidnight = moment(now)
    .utcOffset(330)
    .add(1, 'day')
    .startOf('day')
    .diff(moment(now), 'seconds');
  return Math.min(freshness, untilMidnight);
}

export function seatCacheFreshUntil(
  record: { updatedAt?: string; ttl?: number; freshUntil?: number },
  journeyDate: string,
  now = Date.now(),
): number {
  const updatedAt = Date.parse(record.updatedAt ?? '');
  if (
    !Number.isFinite(updatedAt) ||
    updatedAt > now ||
    !Number.isFinite(record.ttl)
  )
    return 0;
  return Math.min(
    record.ttl ?? 0,
    record.freshUntil ?? Infinity,
    updatedAt / 1000 + seatCacheFreshnessSeconds(journeyDate, updatedAt),
  );
}
