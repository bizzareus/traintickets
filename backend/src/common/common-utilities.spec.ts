import { isPastJourneyDate, toIstYmd } from './date.utils';
import { isPrismaUniqueViolation } from './prisma-errors';

describe('Common Utilities', () => {
  describe('toIstYmd', () => {
    it('correctly formats midnight IST Date without rolling back to previous day UTC', () => {
      // 2026-08-13 00:00:00 IST = 2026-08-12 18:30:00 UTC
      const dateIstMidnight = new Date('2026-08-12T18:30:00.000Z');
      expect(toIstYmd(dateIstMidnight)).toBe('2026-08-13');
    });

    it('handles string dates cleanly', () => {
      expect(toIstYmd('2026-08-13T00:00:00.000Z')).toBe('2026-08-13');
    });
  });

  describe('isPastJourneyDate', () => {
    it.each([
      ['2026-11-02', '2026-11-03T12:00:00Z', true],
      ['2026-11-03', '2026-11-03T18:29:59Z', false],
      ['2026-11-03', '2026-11-03T18:30:00Z', true],
      ['2026-11-04', '2026-11-03T18:30:00Z', false],
      ['2026-11-05', '2026-11-03T18:30:00Z', false],
    ])('compares %s at %s using IST', (journeyDate, now, expected) => {
      expect(isPastJourneyDate(new Date(journeyDate), new Date(now))).toBe(
        expected,
      );
    });
  });

  describe('isPrismaUniqueViolation', () => {
    it('returns true for P2002 code', () => {
      expect(isPrismaUniqueViolation({ code: 'P2002' })).toBe(true);
    });

    it('returns true for UniqueConstraint cause', () => {
      expect(
        isPrismaUniqueViolation({ cause: { kind: 'UniqueConstraint' } }),
      ).toBe(true);
    });

    it('returns false for generic errors', () => {
      expect(isPrismaUniqueViolation(new Error('Random error'))).toBe(false);
      expect(isPrismaUniqueViolation(null)).toBe(false);
    });
  });
});
