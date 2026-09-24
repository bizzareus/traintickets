import { Test, TestingModule } from '@nestjs/testing';
import { SeatCacheCronService } from './seat-cache-cron.service';
import { BookingV2Service } from './booking-v2.service';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';
import { ChartCronLeaderService } from '../chart-cron/chart-cron-leader.service';
import { PostHogTopRoutesService } from './posthog-top-routes.service';
import { PrismaService } from '../prisma/prisma.service';
import { PostHogAnalyticsService } from '../common/posthog-analytics.service';

describe('SeatCacheCronService', () => {
  let service: SeatCacheCronService;
  let ddbStore: Map<string, unknown>;

  const mockBookingV2Service = {
    fetchTrainsFromUpstream: jest
      .fn()
      .mockImplementation((_from, _to, _date) => {
        return Promise.resolve({
          data: {
            trainList: [
              {
                trainNumber: '05047',
                trainName: 'Kolkata - Banaras Special Fare AC Festival Special',
                fromStnCode: 'KOAA',
                toStnCode: 'BNRS',
                avlClasses: ['3E'],
                availabilityCache: {
                  '3E': {
                    availablityStatus: 'AVAILABLE-0042',
                    availabilityDisplayName: 'AVL 42',
                    fare: 1450,
                    availablityType: 1,
                  },
                },
              },
            ],
          },
        });
      }),
  };

  const mockDynamoDbSeatCache = {
    isAvailable: true,
    getRouteCachedSearch: jest
      .fn()
      .mockImplementation((from: string, to: string, date: string) => {
        const key = `ROUTE#${from}#${to}:${date}`;
        return Promise.resolve(ddbStore.get(key) ?? null);
      }),
    saveRouteCachedSearch: jest
      .fn()
      .mockImplementation(
        (from: string, to: string, date: string, raw: unknown) => {
          const key = `ROUTE#${from}#${to}:${date}`;
          ddbStore.set(key, raw);
          return Promise.resolve();
        },
      ),
    saveAvailabilitySummary: jest
      .fn()
      .mockImplementation((cat: string, summary: unknown) => {
        ddbStore.set(`SUMMARY#${cat.toUpperCase()}`, summary);
        return Promise.resolve();
      }),
    getAvailabilitySummary: jest.fn().mockImplementation((cat: string) => {
      return Promise.resolve(
        ddbStore.get(`SUMMARY#${cat.toUpperCase()}`) ?? null,
      );
    }),
  };

  const mockLeaderService = {
    isLeader: jest.fn().mockResolvedValue(true),
  };

  const mockTopRoutesService = {
    getTopRoutes: jest
      .fn()
      .mockResolvedValue([{ from: 'NDLS', to: 'MMCT', searches: 150 }]),
  };

  const mockPrismaService = {
    bestSeatsCronRun: {
      create: jest.fn().mockResolvedValue({ id: 'test-run-id' }),
    },
  };

  beforeEach(async () => {
    ddbStore = new Map();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatCacheCronService,
        { provide: BookingV2Service, useValue: mockBookingV2Service },
        { provide: DynamoDbSeatCacheService, useValue: mockDynamoDbSeatCache },
        { provide: ChartCronLeaderService, useValue: mockLeaderService },
        { provide: PostHogTopRoutesService, useValue: mockTopRoutesService },
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: PostHogAnalyticsService,
          useValue: { isEnabled: true, capture: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SeatCacheCronService>(SeatCacheCronService);
  });

  it('should load targets from JSON configuration file', () => {
    const targets = service.loadTargets();
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.length).toBeGreaterThan(0);

    const diwaliTargets = targets.filter((t) => t.category === 'diwali');
    expect(diwaliTargets.length).toBeGreaterThan(0);

    // Verify all targets strictly have dates between Nov 4-7, 2026
    for (const target of diwaliTargets) {
      for (const d of target.dates) {
        expect([
          '2026-11-04',
          '2026-11-05',
          '2026-11-06',
          '2026-11-07',
        ]).toContain(d);
      }
    }
  });

  it('should warm seat cache and persist route searches & category summaries into DynamoDB', async () => {
    const res = await service.runNow({
      trainNumber: '05047',
    });

    expect(res.success).toBe(true);
    expect(res.totalTargetsProcessed).toBe(1);
    expect(res.totalRoutesWarmed).toBe(1);

    expect(mockBookingV2Service.fetchTrainsFromUpstream).toHaveBeenCalledWith(
      'KOAA',
      'BNRS',
      '04-11-2026',
    );
    expect(mockDynamoDbSeatCache.saveRouteCachedSearch).toHaveBeenCalledWith(
      'KOAA',
      'BNRS',
      '2026-11-04',
      expect.any(Object),
    );

    expect(mockDynamoDbSeatCache.saveAvailabilitySummary).toHaveBeenCalledWith(
      'diwali',
      expect.objectContaining({
        '05047': expect.objectContaining({
          trainNumber: '05047',
          totalAvailableSeats: 42,
          availableClasses: ['3E'],
          lowestFare: 1450,
        }),
      }),
    );
  });
});
