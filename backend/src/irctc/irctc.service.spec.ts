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
import { IrctcBrowserlessService } from './irctc-browserless.service';
import { IrctcHttpService } from './irctc-http.service';
import { IrctcService } from './irctc.service';

describe('IrctcService', () => {
  let service: IrctcService;
  let mockHttpService: IrctcHttpService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockPrisma = {} as PrismaService;
    const mockCookieStore = {} as IrctcCookieStoreService;
    const mockBrowserless = { isEnabled: false } as IrctcBrowserlessService;
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
      mockBrowserless,
      mockHttpService,
    );
  });

  describe('searchStationsViaRapidApi', () => {
    const origKey = process.env.RAPIDAPI_IRCTC_KEY;

    beforeEach(() => {
      process.env.RAPIDAPI_IRCTC_KEY = 'test-rapidapi-key';
    });

    afterEach(() => {
      if (origKey) process.env.RAPIDAPI_IRCTC_KEY = origKey;
      else delete process.env.RAPIDAPI_IRCTC_KEY;
    });

    it('returns empty array when query length is less than 2', async () => {
      const result = await service.searchStationsViaRapidApi('h');
      expect(result).toEqual([]);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns empty array when RapidAPI key is missing', async () => {
      delete process.env.RAPIDAPI_IRCTC_KEY;
      delete process.env.IRCTC_RAPIDAPI_KEY;
      delete process.env.RAPIDAPI_KEY;

      const result = await service.searchStationsViaRapidApi('howrah');
      expect(result).toEqual([]);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('parses new RapidAPI autocomplete response format correctly', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            query: 'howra',
            count: 3,
            results: [
              { station_code: 'HWH', station_name: 'Howrah Jn' },
              { station_code: 'BCB', station_name: 'Bhowra Bh' },
              { station_code: 'DKAE', station_name: 'Dankuni (Howrah)' },
            ],
          },
          generatedTimeStamp: 1787581506522,
        },
      });

      const result = await service.searchStationsViaRapidApi('howra');

      expect(mockGet).toHaveBeenCalledWith(
        'https://irctc-indian-railway-pnr-status.p.rapidapi.com/autocomplete/station/howra',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-rapidapi-host': 'irctc-indian-railway-pnr-status.p.rapidapi.com',
            'x-rapidapi-key': 'test-rapidapi-key',
          }),
          params: { limit: '20' },
        }),
      );

      expect(result).toEqual([
        { stationCode: 'HWH', stationName: 'HOWRAH JN' },
        { stationCode: 'BCB', stationName: 'BHOWRA BH' },
        { stationCode: 'DKAE', stationName: 'DANKUNI (HOWRAH)' },
      ]);
    });

    it('handles empty results array gracefully', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            query: 'zzzz',
            count: 0,
            results: [],
          },
          generatedTimeStamp: 1787581639103,
        },
      });

      const result = await service.searchStationsViaRapidApi('zzzz');
      expect(result).toEqual([]);
    });

    it('catches and returns empty array on network/HTTP error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.searchStationsViaRapidApi('howrah');
      expect(result).toEqual([]);
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
      const mockBrowserless = { isEnabled: false } as IrctcBrowserlessService;
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
        mockBrowserless,
        mockHttpService,
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
