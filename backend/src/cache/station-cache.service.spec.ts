import { StationCacheService } from './station-cache.service';
import type { PrismaService } from '../prisma/prisma.service';

const makeStation = (code: string, name: string) => ({
  stationCode: code,
  stationName: name,
  metadata: { stationCode: code, stationName: name },
  updatedAt: new Date(),
});

function makePrisma(
  findManyResults: ReturnType<typeof makeStation>[] = [],
): PrismaService {
  return {
    stationCache: {
      findMany: jest.fn().mockResolvedValue(findManyResults),
      createMany: jest.fn().mockResolvedValue({ count: findManyResults.length }),
      upsert: jest.fn().mockReturnValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) => Promise.resolve(ops)),
  } as unknown as PrismaService;
}

describe('StationCacheService', () => {
  describe('search', () => {
    it('returns empty array when query is shorter than 2 characters', async () => {
      const prisma = makePrisma();
      const svc = new StationCacheService(prisma);
      expect(await svc.search('M')).toEqual([]);
      expect(await svc.search('')).toEqual([]);
    });

    it('returns empty array when no rows come back', async () => {
      const prisma = makePrisma([]);
      const svc = new StationCacheService(prisma);
      expect(await svc.search('alpha')).toEqual([]);
    });

    it('returns mapped rows when results come back', async () => {
      const rows = Array.from({ length: 6 }, (_, i) =>
        makeStation(`ST${i}`, `Station ${i}`),
      );
      const prisma = makePrisma(rows);
      const svc = new StationCacheService(prisma);

      const result = await svc.search('station');

      expect(result).toHaveLength(6);
      expect(result[0]).toMatchObject({
        stationCode: 'ST0',
        stationName: 'Station 0',
      });
    });

    it('normalizes query to uppercase before DB lookup', async () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeStation(`M${i}`, `Mumbai ${i}`),
      );
      const findManyMock = jest.fn().mockResolvedValue(rows);
      const prisma = {
        stationCache: { findMany: findManyMock },
      } as unknown as PrismaService;
      const svc = new StationCacheService(prisma);

      await svc.search('mum');

      const whereArg = findManyMock.mock.calls[0][0].where as {
        OR: Array<{ stationCode?: { startsWith: string } }>;
      };
      expect(whereArg.OR[0].stationCode!.startsWith).toBe('MUM');
    });
  });

  describe('upsertMany', () => {
    it('does nothing when given an empty list', async () => {
      const prisma = makePrisma();
      const createManyMock = jest.spyOn(prisma.stationCache, 'createMany');
      const svc = new StationCacheService(prisma);

      await svc.upsertMany([]);
      expect(createManyMock).not.toHaveBeenCalled();
    });

    it('calls createMany for new stations', async () => {
      const findManyMock = jest.fn().mockResolvedValue([]);
      const createManyMock = jest.fn().mockResolvedValue({ count: 2 });
      const prisma = {
        stationCache: { findMany: findManyMock, createMany: createManyMock },
      } as unknown as PrismaService;
      const svc = new StationCacheService(prisma);

      await svc.upsertMany([
        { stationCode: 'ndls', stationName: 'New Delhi' },
        { stationCode: 'cstm', stationName: 'Mumbai CST' },
      ]);

      expect(createManyMock).toHaveBeenCalledTimes(1);
    });

    it('normalizes stationCode and stationName to uppercase in createMany', async () => {
      const findManyMock = jest.fn().mockResolvedValue([]);
      const createManyMock = jest.fn().mockResolvedValue({ count: 1 });
      const prisma = {
        stationCache: { findMany: findManyMock, createMany: createManyMock },
      } as unknown as PrismaService;
      const svc = new StationCacheService(prisma);

      await svc.upsertMany([{ stationCode: 'ndls', stationName: 'New Delhi' }]);

      const call = createManyMock.mock.calls[0][0] as {
        data: Array<{ stationCode: string; stationName: string }>;
      };
      expect(call.data[0].stationCode).toBe('NDLS');
      expect(call.data[0].stationName).toBe('NEW DELHI');
    });
  });
});
