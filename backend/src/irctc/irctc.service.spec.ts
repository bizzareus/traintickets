const mockGet = jest.fn();

jest.mock('../common/retrying-axios', () => ({
  createRetryingAxiosClient: jest.fn(() => ({
    get: mockGet,
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  })),
}));

import { PrismaService } from '../prisma/prisma.service';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';
import { IrctcHttpService } from './irctc-http.service';
import { IrctcService } from './irctc.service';

describe('IrctcService', () => {
  let service: IrctcService;
  let mockHttpService: IrctcHttpService;
  let scheduleCache: { get: jest.Mock; set: jest.Mock };
  let classLookup: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    classLookup = jest.fn().mockResolvedValue(null);
    const mockPrisma = {
      trainScheduleCache: { findUnique: classLookup },
    } as unknown as PrismaService;
    const mockCookieStore = {} as IrctcCookieStoreService;
    scheduleCache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    mockHttpService = {
      postOnlineCharts: jest.fn(),
      getEticketing: jest.fn(),
      getOnlineChartsBaseUrl: jest
        .fn()
        .mockReturnValue('https://www.irctc.co.in'),
      isProxied: jest.fn().mockReturnValue(false),
    } as unknown as IrctcHttpService;
    service = new IrctcService(
      mockPrisma,
      mockCookieStore,
      mockHttpService,
      scheduleCache as never,
    );
  });

  describe('searchStationsViaConfirmTkt', () => {
    it('returns empty array when query length is less than 2', async () => {
      const result = await service.searchStationsViaConfirmTkt('h');
      expect(result).toEqual([]);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('uses the supplied ConfirmTkt request and preserves station metadata and ranking', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            stationList: [
              { stationCode: 'DEL', stationName: 'Denduluru' },
              {
                stationCode: ' ndls ',
                stationName: 'New Delhi',
                city: 'New Delhi',
                state: 'Delhi',
              },
              { stationCode: 'DLI', stationName: 'Old Delhi' },
            ],
            popularStationList: [
              { stationCode: 'HWH', stationName: 'Howrah Jn' },
            ],
            preferredStationList: [],
          },
        },
      });

      const result = await service.searchStationsViaConfirmTkt(' del ');

      expect(mockGet).toHaveBeenCalledWith(
        'https://cttrainsapi.confirmtkt.com/api/v2/trains/stations/auto-suggestion',
        expect.objectContaining({
          headers: expect.objectContaining({
            ApiKey: 'ct-web!2$',
            ClientId: 'ct-web',
            DeviceId: 'e22a1dab-a86d-403a-963b-5e1ae7f649f2',
            Referer: 'https://www.confirmtkt.com/',
          }),
          params: {
            searchString: 'del',
            sourceStnCode: '',
            popularStnListLimit: 15,
            preferredStnListLimit: 6,
            channel: 'mwebd',
            language: 'EN',
          },
          timeout: 1_500,
          signal: expect.any(AbortSignal),
        }),
      );

      expect(result).toEqual([
        { stationCode: 'DEL', stationName: 'DENDULURU' },
        {
          stationCode: 'NDLS',
          stationName: 'NEW DELHI',
          city: 'New Delhi',
          state: 'Delhi',
        },
        { stationCode: 'DLI', stationName: 'OLD DELHI' },
      ]);
    });

    it('handles empty results array gracefully', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            stationList: [],
          },
        },
      });

      const result = await service.searchStationsViaConfirmTkt('zzzz');
      expect(result).toEqual([]);
    });

    it('catches and returns empty array on network/HTTP error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.searchStationsViaConfirmTkt('howrah');
      expect(result).toEqual([]);
      expect(scheduleCache.set).not.toHaveBeenCalled();
    });

    it('caches genuine empty results briefly and reuses case-insensitive hits', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { stationList: [] } } });
      await expect(
        service.searchStationsViaConfirmTkt('unknown'),
      ).resolves.toEqual([]);
      expect(scheduleCache.set).toHaveBeenCalledWith(
        'station-search:confirmtkt:UNKNOWN',
        [],
        30_000,
      );

      scheduleCache.get.mockResolvedValueOnce([]);
      await expect(
        service.searchStationsViaConfirmTkt('UNKNOWN'),
      ).resolves.toEqual([]);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it.each([
      { success: false, data: { stationList: [] } },
      { status: false, data: [] },
      { message: 'quota exceeded' },
      { data: { stationList: [{ invalid: true }] } },
      { data: { stationList: [{ stationCode: true, stationName: false }] } },
      { data: { popularStationList: [] } },
    ])(
      'does not negative-cache provider failures or malformed results: %j',
      async (data) => {
        mockGet.mockResolvedValueOnce({ data });
        await expect(
          service.searchStationsViaConfirmTkt('howrah'),
        ).resolves.toEqual([]);
        expect(scheduleCache.set).not.toHaveBeenCalled();
      },
    );

    it('uses a longer cache TTL for successful fallback results', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            stationList: [{ stationCode: 'WL', stationName: 'Warangal' }],
          },
        },
      });
      await service.searchStationsViaConfirmTkt('warangal');
      expect(scheduleCache.set).toHaveBeenCalledWith(
        'station-search:confirmtkt:WARANGAL',
        [{ stationCode: 'WL', stationName: 'WARANGAL' }],
        300_000,
      );
    });
  });

  describe('getTrainClasses', () => {
    it('reads known classes from the database without calling a provider', async () => {
      classLookup.mockResolvedValueOnce({ availableClasses: ['SL', '3A'] });
      await expect(service.getTrainClasses(' 12951 ')).resolves.toEqual([
        'SL',
        '3A',
      ]);
      expect(classLookup).toHaveBeenCalledWith({
        where: { trainNumber: '12951' },
        select: { availableClasses: true },
      });
      expect(mockGet).not.toHaveBeenCalled();
    });

    it.each([null, { availableClasses: [] }])(
      'returns unknown classes on a cache miss without external calls: %j',
      async (row) => {
        classLookup.mockResolvedValueOnce(row);
        await expect(service.getTrainClasses('12951')).resolves.toEqual([]);
        expect(mockGet).not.toHaveBeenCalled();
      },
    );

    it('degrades to unknown classes on a database error without external calls', async () => {
      classLookup.mockRejectedValueOnce(new Error('database unavailable'));
      await expect(service.getTrainClasses('12951')).resolves.toEqual([]);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('skips lookups for an empty train number', async () => {
      await expect(service.getTrainClasses(' ')).resolves.toEqual([]);
      expect(classLookup).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('getTrainSchedule', () => {
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        trainScheduleCache: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      const mockCookieStore = {} as IrctcCookieStoreService;
      mockHttpService = {
        postOnlineCharts: jest.fn(),
        getEticketing: jest.fn(),
        getOnlineChartsBaseUrl: jest
          .fn()
          .mockReturnValue('https://www.irctc.co.in'),
        isProxied: jest.fn().mockReturnValue(false),
      } as unknown as IrctcHttpService;
      service = new IrctcService(
        mockPrisma,
        mockCookieStore,
        mockHttpService,
        scheduleCache as never,
      );
    });

    it('fetches schedule from ConfirmTkt API successfully and returns normalized schedule', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          TrainNo: 12782,
          TrainName: 'Nzm Mys Sf Exp',
          SourceCode: 'NZM',
          DestinationCode: 'MYS',
          DaysOfRun: {
            Sun: false,
            Mon: true,
            Tue: false,
            Wed: false,
            Thu: false,
            Fri: false,
            Sat: false,
          },
          Schedule: [
            {
              StationCode: 'NZM',
              StationName: 'H Nizamuddin',
              ArrivalTime: '',
              DepartureTime: '05:10',
              HaltMinutes: '',
              Distance: '0.0',
              Day: 1,
              ExpectedPlatformNo: '7',
            },
            {
              StationCode: 'MYS',
              StationName: 'Mysuru Jn',
              ArrivalTime: '02:20',
              DepartureTime: '',
              HaltMinutes: '',
              Distance: '2612.0',
              Day: 3,
              ExpectedPlatformNo: '5',
            },
          ],
        },
      });

      const result = await service.getTrainSchedule('12782', {
        forceRefresh: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.schedule.trainNumber).toBe('12782');
        expect(result.schedule.trainName).toBe('Nzm Mys Sf Exp');
        expect(result.schedule.stationFrom).toBe('NZM');
        expect(result.schedule.stationTo).toBe('MYS');
        expect(result.schedule.stationList).toHaveLength(2);
        expect(result.schedule.stationList[0].stationCode).toBe('NZM');
        expect(result.schedule.stationList[1].stationCode).toBe('MYS');
        expect(result.schedule.trainRunsOn).toEqual({
          trainRunsOnMon: 'Y',
          trainRunsOnTue: 'N',
          trainRunsOnWed: 'N',
          trainRunsOnThu: 'N',
          trainRunsOnFri: 'N',
          trainRunsOnSat: 'N',
          trainRunsOnSun: 'N',
        });
      }

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://api.confirmtkt.com/api/trains/schedulewithintermediatestn?',
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            'sec-ch-ua-platform': '"macOS"',
            Referer: 'https://www.confirmtkt.com/',
            Channel: 'mwebd',
            'Content-Type': 'application/json',
            DNT: '1',
          }),
        }),
      );

      expect(mockPrisma.trainScheduleCache.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trainNumber: '12782' },
          create: expect.objectContaining({ trainNumber: '12782' }),
        }),
      );
    });

    it('normalizes leading zero train numbers (e.g. 03255) in upsert to prevent unique constraint failures', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          TrainNo: 3255, // ConfirmTkt returns integer 3255 without leading zero
          TrainName: 'Chz Pnbe Spl',
          SourceCode: 'CHZ',
          DestinationCode: 'PNBE',
          DaysOfRun: { Mon: true },
          Schedule: [
            {
              StationCode: 'CHZ',
              StationName: 'CHARLAPALLI',
              ArrivalTime: 'Source',
              DepartureTime: '21:00',
              HaltMinutes: '0',
              Distance: '0',
              Day: 1,
            },
          ],
        },
      });

      const result = await service.getTrainSchedule('03255', {
        forceRefresh: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.schedule.trainNumber).toBe('03255');
      }

      // Verify that where.trainNumber matches create.trainNumber ('03255')
      expect(mockPrisma.trainScheduleCache.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trainNumber: '03255' },
          create: expect.objectContaining({
            trainNumber: '03255',
          }),
        }),
      );
    });

    it('logs error and falls back when ConfirmTkt returns empty stationList or error', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          TrainNo: 12782,
          Schedule: [],
        },
      });
      // Fallback IRCTC fails with unavailable
      const result = await service.getTrainSchedule('12782', {
        forceRefresh: true,
      });
      expect(result.ok).toBe(false);
    });
  });
});
