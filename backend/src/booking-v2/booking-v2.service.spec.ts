import { BookingV2Service } from './booking-v2.service';
import type { FindAlternatePathsResult } from './booking-v2.service';
import type { IrctcService } from '../irctc/irctc.service';
import type { CacheService } from '../cache/cache.service';
import type { StationCacheService } from '../cache/station-cache.service';
import axios from 'axios';

const mockCache: jest.Mocked<
  Pick<CacheService, 'get' | 'set' | 'del' | 'getOrSet'>
> = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest
    .fn()
    .mockImplementation((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
};

const mockStationCache: jest.Mocked<
  Pick<StationCacheService, 'search' | 'upsertMany'>
> = {
  search: jest.fn().mockResolvedValue(null),
  upsertMany: jest.fn().mockResolvedValue(undefined),
};

function altResult(
  trainNumber: string,
  legs: FindAlternatePathsResult['legs'],
): FindAlternatePathsResult {
  return {
    trainNumber,
    legs,
    totalFare: legs
      .filter((l) => l.segmentKind === 'confirmed')
      .reduce<number | null>((sum, l) => {
        if (sum == null || l.fare == null) return null;
        return sum + l.fare;
      }, 0),
    legCount: legs.length,
    isComplete:
      legs.length > 0 &&
      legs.every((l) => l.segmentKind === 'confirmed') &&
      legs[legs.length - 1].to === 'D',
    stationCodesOnRoute: ['A', 'B', 'C', 'D'],
    stationNameMap: {},
    remainderMergedSchedule: null,
    trainOriginCode: 'A',
    trainOriginDepartureTime: '08:00',
    debugLog: [],
  };
}

function confirmedLeg(
  from: string,
  to: string,
  durationMinutes: number,
  fare = 100,
): FindAlternatePathsResult['legs'][number] {
  return {
    from,
    to,
    segmentKind: 'confirmed',
    travelClass: 'SL',
    railDataStatus: 'Confirm',
    availablityStatus: 'AVAILABLE',
    predictionPercentage: null,
    availabilityDisplayName: 'Available',
    fare,
    confirmedClassOptions: [],
    departureTime: '08:00',
    arrivalTime: '09:00',
    durationMinutes,
  };
}

function realtimeLeg(
  from: string,
  to: string,
): FindAlternatePathsResult['legs'][number] {
  return {
    from,
    to,
    segmentKind: 'check_realtime',
    travelClass: null,
    railDataStatus: null,
    availablityStatus: null,
    predictionPercentage: null,
    availabilityDisplayName: null,
    fare: null,
    confirmedClassOptions: [],
    departureTime: '08:00',
    arrivalTime: '09:00',
    durationMinutes: 60,
  };
}

describe('BookingV2Service', () => {
  let service: BookingV2Service;

  beforeEach(() => {
    jest.clearAllMocks();
    const irctc = {} as IrctcService;
    service = new BookingV2Service(
      irctc,
      mockCache as unknown as CacheService,
      mockStationCache as unknown as StationCacheService,
    );
  });

  describe('normalizeToRailApiDate', () => {
    it('converts YYYY-MM-DD to DD-MM-YYYY', () => {
      expect(service.normalizeToRailApiDate('2026-04-05')).toBe('05-04-2026');
    });
    it('pads DD-MM-YYYY input', () => {
      expect(service.normalizeToRailApiDate('5-4-2026')).toBe('05-04-2026');
    });
    it('returns null for garbage', () => {
      expect(service.normalizeToRailApiDate('not-a-date')).toBeNull();
    });
  });

  describe('searchStations (cache integration)', () => {
    it('returns cached stations when cache has sufficient results', async () => {
      const cached = Array.from({ length: 6 }, (_, i) => ({
        stationCode: `ST${i}`,
        stationName: `Station ${i}`,
      }));
      mockStationCache.search.mockResolvedValueOnce(cached);

      const result = await service.searchStations('mum');

      expect(mockStationCache.search).toHaveBeenCalledWith('mum');
      expect(result).toEqual({ data: { stationList: cached } });
    });

    it('falls through to upstream when cache returns null', async () => {
      mockStationCache.search.mockResolvedValueOnce(null);
      const body = JSON.stringify({
        data: {
          stationList: [{ stationCode: 'CSTM', stationName: 'Mumbai CST' }],
        },
      });
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(body),
      } as Response);

      const result = await service.searchStations('mum');

      expect(fetchSpy).toHaveBeenCalled();
      const data = (result as { data: { stationList: unknown[] } }).data;
      expect(data.stationList).toHaveLength(1);
      fetchSpy.mockRestore();
    });

    it('throws when upstream returns non-OK status', async () => {
      mockStationCache.search.mockResolvedValueOnce(null);
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      } as Response);

      await expect(service.searchStations('mum')).rejects.toThrow(
        'Station search failed: 503',
      );
    });

    it('returns an empty station result when upstream returns 404', async () => {
      mockStationCache.search.mockResolvedValueOnce(null);
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      } as Response);

      await expect(service.searchStations('zzzz')).resolves.toEqual({
        data: { stationList: [] },
        message: 'No station found',
      });
    });
  });

  describe('searchTrains (cache integration)', () => {
    it('delegates to cache.getOrSet with a 24h TTL key', async () => {
      const fakeResult = { data: { trainList: [] } };
      mockCache.getOrSet.mockResolvedValueOnce(fakeResult);

      const result = await service.searchTrains('NDLS', 'CSTM', '2026-04-05');

      expect(mockCache.getOrSet).toHaveBeenCalledWith(
        'trains:NDLS:CSTM:05-04-2026',
        expect.any(Function),
        24 * 60 * 60 * 1000,
      );
      expect(result).toBe(fakeResult);
    });

    it('throws for an invalid date', async () => {
      await expect(
        service.searchTrains('NDLS', 'CSTM', 'bad-date'),
      ).rejects.toThrow('Invalid journey date');
      expect(mockCache.getOrSet).not.toHaveBeenCalled();
    });
  });

  describe('findBestTrains', () => {
    it('evaluates the supplied train rows instead of running a second search', async () => {
      const searchSpy = jest.spyOn(service, 'searchTrains');
      const findSpy = jest
        .spyOn(service, 'findAlternatePaths')
        .mockResolvedValue(altResult('1', [confirmedLeg('A', 'D', 240)]));

      const result = await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        trains: [
          {
            trainNumber: '1',
            trainName: 'Listed Train',
            departureTime: '07:30',
            arrivalTime: '10:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            avlClasses: ['SL'],
          },
        ],
      });

      expect(searchSpy).not.toHaveBeenCalled();
      expect(findSpy).toHaveBeenCalledTimes(1);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ trainNumber: '1' }),
      );
      expect(result.results).toHaveLength(1);
      expect(result.results[0].train.trainNumber).toBe('1');
    });

    it('keeps only trains with confirmed tickets from origin and ranks by confirmed hours before station hops', async () => {
      jest
        .spyOn(service, 'findAlternatePaths')
        .mockImplementation(async (input) => {
          if (input.trainNumber === '101') {
            return altResult('101', [confirmedLeg('A', 'D', 100)]);
          }
          if (input.trainNumber === '102') {
            return altResult('102', [
              realtimeLeg('A', 'B'),
              confirmedLeg('B', 'D', 180),
            ]);
          }
          return altResult('103', [
            confirmedLeg('A', 'B', 240),
            realtimeLeg('B', 'D'),
          ]);
        });

      const result = await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        trains: [
          {
            trainNumber: '101',
            trainName: 'Short Confirm',
            departureTime: '08:00',
            arrivalTime: '12:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 240,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '102',
            trainName: 'No Origin Confirm',
            departureTime: '09:00',
            arrivalTime: '13:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 240,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '103',
            trainName: 'Long Confirm',
            departureTime: '10:00',
            arrivalTime: '14:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 240,
            avlClasses: ['SL'],
          },
        ],
      });

      expect(result.results.map((r) => r.train.trainNumber)).toEqual([
        '103',
        '101',
      ]);
      expect(result.results[0].score.originConfirmed).toBe(true);
      expect(
        result.results[0].score.confirmedContiguousStationsFromOrigin,
      ).toBe(1);
      expect(result.candidatesSkipped).toBe(1);
    });

    it('breaks confirmed-hour ties by fastest train, then price, then longest leg', async () => {
      jest
        .spyOn(service, 'findAlternatePaths')
        .mockImplementation(async (input) => {
          if (input.trainNumber === '201') {
            return altResult('201', [confirmedLeg('A', 'D', 240, 800)]);
          }
          if (input.trainNumber === '202') {
            return altResult('202', [confirmedLeg('A', 'D', 240, 700)]);
          }
          if (input.trainNumber === '203') {
            return altResult('203', [confirmedLeg('A', 'D', 240, 600)]);
          }
          return altResult('204', [
            confirmedLeg('A', 'B', 120, 600),
            confirmedLeg('B', 'D', 120, 0),
          ]);
        });

      const result = await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        trains: [
          {
            trainNumber: '201',
            trainName: 'Fast Pricey',
            departureTime: '08:00',
            arrivalTime: '11:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 180,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '202',
            trainName: 'Slow Cheap',
            departureTime: '09:00',
            arrivalTime: '14:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 300,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '203',
            trainName: 'Same Speed Cheapest',
            departureTime: '10:00',
            arrivalTime: '13:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 180,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '204',
            trainName: 'Same Fare Split Leg',
            departureTime: '11:00',
            arrivalTime: '14:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 180,
            avlClasses: ['SL'],
          },
        ],
      });

      expect(result.results.map((r) => r.train.trainNumber)).toEqual([
        '203',
        '204',
        '201',
        '202',
      ]);
    });
  });

  describe('getPnrStatus', () => {
    it('calls getPNRStatus endpoint with correct options and returns data', async () => {
      const fakeData = { status: true, data: { Pnr: '1234567890' } };
      const getSpy = jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: fakeData });

      const result = await service.getPnrStatus('1234567890');

      expect(getSpy).toHaveBeenCalledWith(
        'https://irctc1.p.rapidapi.com/api/v3/getPNRStatus',
        {
          params: { pnrNumber: '1234567890' },
          headers: {
            'x-rapidapi-key': expect.any(String),
            'x-rapidapi-host': 'irctc1.p.rapidapi.com',
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual(fakeData);
      getSpy.mockRestore();
    });

    it('throws error when axios request fails', async () => {
      const getSpy = jest.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network Error'));

      await expect(service.getPnrStatus('1234567890')).rejects.toThrow(
        'Failed to fetch PNR status: Network Error',
      );
      getSpy.mockRestore();
    });
  });
});
