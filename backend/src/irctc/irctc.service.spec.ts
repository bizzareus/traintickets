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

import { PrismaService } from '../prisma.service';
import { IrctcCookieStoreService } from './irctc-cookie-store.service';
import { IrctcService } from './irctc.service';

describe('IrctcService', () => {
  let service: IrctcService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockPrisma = {} as PrismaService;
    const mockCookieStore = {} as IrctcCookieStoreService;
    service = new IrctcService(mockPrisma, mockCookieStore);
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
});
