import {
  seatCacheFreshnessSeconds,
  seatCacheFreshUntil,
  STATION_CODE_RE,
} from './seat-cache-policy';

describe('seat cache freshness', () => {
  const now = Date.parse('2030-11-04T06:00:00Z');

  it.each([
    ['2030-11-04', 600],
    ['2030-11-05', 3600],
    ['2030-11-11', 3600],
    ['2030-11-12', 21600],
    ['2030-11-03', 0],
    ['not-a-date', 0],
  ])('uses a journey-aware lifetime for %s', (date, ttl) => {
    expect(seatCacheFreshnessSeconds(String(date), now)).toBe(ttl);
  });

  it('caps freshness at IST midnight, not UTC midnight', () => {
    expect(
      seatCacheFreshnessSeconds(
        '2030-11-05',
        Date.parse('2030-11-04T18:25:00Z'),
      ),
    ).toBe(300);
  });

  it('does not move the midnight deadline earlier on a later read', () => {
    const updatedAt = '2030-11-04T18:25:00Z';
    const record = { updatedAt, ttl: Date.parse(updatedAt) / 1000 + 86400 };
    expect(
      seatCacheFreshUntil(
        record,
        '2030-11-05',
        Date.parse('2030-11-04T18:28:00Z'),
      ),
    ).toBe(Date.parse('2030-11-04T18:30:00Z') / 1000);
  });

  it('does not reset snapshot age on reads or trust missing timestamps', () => {
    const record = {
      ttl: now / 1000 + 48 * 3600,
      updatedAt: new Date(now - 601000).toISOString(),
    };
    expect(seatCacheFreshUntil(record, '2030-11-04', now)).toBeLessThan(
      now / 1000,
    );
    expect(seatCacheFreshUntil({ ttl: record.ttl }, '2030-11-04', now)).toBe(0);
  });

  it.each(['R', 'G', 'NDLS', 'ABC123'])('accepts station %s', (code) => {
    expect(STATION_CODE_RE.test(code)).toBe(true);
  });

  it.each(['', 'A#B', 'TOOLONG', 'R G'])(
    'rejects malformed station %s',
    (code) => {
      expect(STATION_CODE_RE.test(code)).toBe(false);
    },
  );
});
