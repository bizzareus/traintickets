import { toIstYmd } from './date.utils';
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
