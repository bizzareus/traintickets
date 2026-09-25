import { Test, TestingModule } from '@nestjs/testing';
import { SeatCacheController } from './seat-cache.controller';
import { SeatCacheCronService } from './seat-cache-cron.service';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';

describe('SeatCacheController', () => {
  let controller: SeatCacheController;

  const mockSeatCacheCron = {
    runNow: jest.fn().mockResolvedValue({
      success: true,
      totalRoutesWarmed: 5,
      totalTargetsProcessed: 3,
      summaryCount: 3,
    }),
  };

  const mockDynamoDbSeatCache = {
    isAvailable: true,
    getCacheInventory: jest.fn().mockResolvedValue({
      available: true,
      trainCount: 2,
      trains: [{ trainNumber: '05047' }, { trainNumber: '22436' }],
    }),
    getAvailabilitySummary: jest.fn().mockImplementation((category: string) => {
      if (category.toLowerCase() === 'diwali') {
        return Promise.resolve({
          '05047': {
            trainNumber: '05047',
            totalAvailableSeats: 42,
            category: 'diwali',
          },
        });
      }
      return Promise.resolve(null);
    }),
  };

  const mockPrismaService = {
    bestSeatsCronRun: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'admin-secret';
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeatCacheController],
      providers: [
        { provide: SeatCacheCronService, useValue: mockSeatCacheCron },
        { provide: DynamoDbSeatCacheService, useValue: mockDynamoDbSeatCache },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<SeatCacheController>(SeatCacheController);
  });

  afterAll(() => {
    delete process.env.CHART_TIME_INGESTION_PASSWORD;
    delete process.env.SEAT_CACHE_CRON_API_KEY;
  });

  describe('getAvailabilitySummary', () => {
    it('returns availability summary for a category from DynamoDB', async () => {
      const res = await controller.getAvailabilitySummary('diwali');
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect((res.data as Record<string, unknown>)['05047']).toBeDefined();
    });

    it('returns specific train when trainNumber query parameter is provided', async () => {
      const res = await controller.getAvailabilitySummary('diwali', '05047');
      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        trainNumber: '05047',
        totalAvailableSeats: 42,
        category: 'diwali',
      });
    });
  });

  describe('runCron', () => {
    it('rejects unauthorized requests when API key or password is not provided', async () => {
      process.env.SEAT_CACHE_CRON_API_KEY = 'secret-test-key';
      await expect(controller.runCron({}, 'wrong-key')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('executes cron when correct API key is provided', async () => {
      process.env.SEAT_CACHE_CRON_API_KEY = 'secret-test-key';
      const res = await controller.runCron(
        { category: 'diwali' },
        'secret-test-key',
      );
      expect(res.success).toBe(true);
      expect(mockSeatCacheCron.runNow).toHaveBeenCalledWith({
        category: 'diwali',
      });
    });
  });

  describe('getCacheInventory', () => {
    it('returns valid DynamoDB cache inventory for an authenticated admin', async () => {
      const result = await controller.getCacheInventory(
        'admin-secret',
        {} as never,
      );

      expect(mockDynamoDbSeatCache.getCacheInventory).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ available: true, trainCount: 2 }),
      );
    });

    it('rejects unauthenticated cache inventory requests', async () => {
      await expect(
        controller.getCacheInventory(undefined, {} as never),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
