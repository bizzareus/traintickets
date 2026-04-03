import { BookingV2Service } from './booking-v2.service';
import type { IrctcService } from '../irctc/irctc.service';
import type { CacheService } from '../cache/cache.service';
import type { StationCacheService } from '../cache/station-cache.service';

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
});
