import type { ScheduleStation } from '../irctc/irctc.service';
import {
  departureTimeAtStation,
  formatJourneyDateReadable,
  formatSegmentScheduleTimes,
  hasBookablePlanForNotification,
  normalizeIrctcTimeDisplay,
  arrivalTimeAtStation,
} from './notification.helpers';

describe('notification.helpers', () => {
  describe('hasBookablePlanForNotification', () => {
    it('returns false when plan is missing or empty', () => {
      expect(hasBookablePlanForNotification({})).toBe(false);
      expect(
        hasBookablePlanForNotification({ openAiBookingPlan: [] }),
      ).toBe(false);
    });

    it('returns false when every slot is empty', () => {
      expect(
        hasBookablePlanForNotification({
          openAiBookingPlan: [{}, {}],
        }),
      ).toBe(false);
    });

    it('returns true when any slot has a non-empty instruction', () => {
      expect(
        hasBookablePlanForNotification({
          openAiBookingPlan: [
            {},
            { instruction: 'NDLS - BCT - 3A', approx_price: 500 },
          ],
        }),
      ).toBe(true);
    });
  });

  describe('formatJourneyDateReadable', () => {
    it('formats YYYY-MM-DD as weekday, ordinal day, month (Asia/Kolkata)', () => {
      expect(formatJourneyDateReadable('2026-04-03')).toBe('Fri, 3rd April');
    });

    it('handles leading noise by trimming to first 10 chars', () => {
      expect(formatJourneyDateReadable('2026-01-01T12:00:00Z')).toBe(
        'Thu, 1st January',
      );
    });
  });

  describe('normalizeIrctcTimeDisplay', () => {
    it('inserts colon for 4-digit HHMM', () => {
      expect(normalizeIrctcTimeDisplay('0915')).toBe('09:15');
    });

    it('passes through values that already look like times', () => {
      expect(normalizeIrctcTimeDisplay('9:15')).toBe('9:15');
    });
  });

  describe('formatSegmentScheduleTimes', () => {
    const list: ScheduleStation[] = [
      {
        stationCode: 'NDLS',
        stationName: 'New Delhi',
        departureTime: '0915',
        arrivalTime: '0900',
      },
      {
        stationCode: 'BCT',
        stationName: 'Mumbai Central',
        arrivalTime: '2015',
        departureTime: '2020',
      },
    ];

    it('builds Dep and Arr line with normalized times', () => {
      expect(formatSegmentScheduleTimes(list, 'NDLS', 'BCT')).toBe(
        'Dep NDLS: 09:15 · Arr BCT: 20:15',
      );
    });

    it('returns empty string when schedule is missing', () => {
      expect(
        formatSegmentScheduleTimes(undefined, 'NDLS', 'BCT'),
      ).toBe('');
    });
  });

  describe('departureTimeAtStation / arrivalTimeAtStation', () => {
    it('prefers departure at origin, falls back to arrival', () => {
      const row: ScheduleStation = {
        stationCode: 'X',
        stationName: 'X',
        arrivalTime: '1000',
        departureTime: '',
      };
      expect(departureTimeAtStation(row)).toBe('10:00');
    });

    it('prefers arrival at destination, falls back to departure', () => {
      const row: ScheduleStation = {
        stationCode: 'Y',
        stationName: 'Y',
        departureTime: '1100',
        arrivalTime: '',
      };
      expect(arrivalTimeAtStation(row)).toBe('11:00');
    });
  });
});
