import { BookingV2Service } from './booking-v2.service';
import type { IrctcService } from '../irctc/irctc.service';

describe('BookingV2Service', () => {
  let service: BookingV2Service;

  beforeEach(() => {
    const irctc = {} as IrctcService;
    service = new BookingV2Service(irctc);
  });

  describe('normalizeToConfirmTktDate', () => {
    it('converts YYYY-MM-DD to DD-MM-YYYY', () => {
      expect(service.normalizeToConfirmTktDate('2026-04-05')).toBe('05-04-2026');
    });
    it('pads DD-MM-YYYY input', () => {
      expect(service.normalizeToConfirmTktDate('5-4-2026')).toBe('05-04-2026');
    });
    it('returns null for garbage', () => {
      expect(service.normalizeToConfirmTktDate('not-a-date')).toBeNull();
    });
  });
});
