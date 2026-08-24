import { isLegConfirmed } from './booking-v2.utils';
import { BookingV2Service } from './booking-v2.service';

describe('Booking-V2 Refactored Utilities', () => {
  let service: BookingV2Service;

  beforeEach(() => {
    service = new BookingV2Service(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('normalizeToRailApiDate', () => {
    it('formats ISO YYYY-MM-DD to DD-MM-YYYY', () => {
      expect(service.normalizeToRailApiDate('2026-08-13')).toBe('13-08-2026');
    });

    it('formats DD-MM-YYYY cleanly', () => {
      expect(service.normalizeToRailApiDate('13-08-2026')).toBe('13-08-2026');
      expect(service.normalizeToRailApiDate('13/08/2026')).toBe('13-08-2026');
    });

    it('returns null for invalid date strings', () => {
      expect(service.normalizeToRailApiDate('invalid-date')).toBeNull();
      expect(service.normalizeToRailApiDate('')).toBeNull();
    });
  });

  describe('isLegConfirmed', () => {
    it('returns true for availablityType 1', () => {
      expect(isLegConfirmed({ availablityType: 1 })).toBe(true);
    });

    it('returns false for availablityType 3', () => {
      expect(isLegConfirmed({ availablityType: 3 })).toBe(false);
    });

    it('returns true for AVL / CURR_AV status strings', () => {
      expect(isLegConfirmed({ availablityStatus: 'AVAILABLE 12' })).toBe(true);
      expect(isLegConfirmed({ availablityStatus: 'RLWL/CURR_AV 05' })).toBe(
        true,
      );
    });

    it('returns false for pure waitlist status', () => {
      expect(isLegConfirmed({ availablityStatus: 'RLWL 12' })).toBe(false);
    });
  });

  describe('getPnrStatus', () => {
    it('throws configuration error when RapidAPI key is missing', async () => {
      const origKey = process.env.RAPIDAPI_IRCTC_KEY;
      delete process.env.RAPIDAPI_IRCTC_KEY;
      delete process.env.IRCTC_RAPIDAPI_KEY;
      delete process.env.RAPIDAPI_KEY;

      await expect(service.getPnrStatus('1234567890')).rejects.toThrow(
        'RapidAPI key for IRCTC PNR status is not configured',
      );

      if (origKey) process.env.RAPIDAPI_IRCTC_KEY = origKey;
    });
  });
});
