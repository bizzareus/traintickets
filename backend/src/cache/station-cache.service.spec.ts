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
      createMany: jest
        .fn()
        .mockResolvedValue({ count: findManyResults.length }),
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

    it('returns mapped rows when results come back from in-memory cache', async () => {
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

    it('prioritizes exact code match, then code prefix, then name match', async () => {
      const rows = [
        makeStation('PND', 'Pendra Road'),
        makeStation('PNVL', 'Panvel'),
        makeStation('NDLS', 'New Delhi'),
        makeStation('DLI', 'Old Delhi'),
      ];
      const prisma = makePrisma(rows);
      const svc = new StationCacheService(prisma);

      // Search 'PNVL' should have exact match 'PNVL' first
      const pnvlResult = await svc.search('pnvl');
      expect(pnvlResult[0].stationCode).toBe('PNVL');

      // Search 'DEL' should match 'New Delhi' / 'Old Delhi'
      const delResult = await svc.search('del');
      const codes = delResult.map((r) => r.stationCode);
      expect(codes).toContain('NDLS');
      expect(codes).toContain('DLI');
    });

    it('normalizes query to uppercase before DB lookup on fallback', async () => {
      const findManyMock = jest
        .fn()
        .mockResolvedValueOnce([]) // warmCache returns empty
        .mockResolvedValueOnce([makeStation('M0', 'Mumbai 0')]); // fallback DB query
      const prisma = {
        stationCache: { findMany: findManyMock },
      } as unknown as PrismaService;
      const svc = new StationCacheService(prisma);

      await svc.search('mum');

      expect(findManyMock).toHaveBeenCalledTimes(2);
      const whereArg = findManyMock.mock.calls[1][0].where as {
        OR: Array<{ stationCode?: { startsWith: string } }>;
      };
      expect(whereArg.OR[0].stationCode!.startsWith).toBe('MUM');
    });
  });

  describe('namesForCodes', () => {
    it('resolves station names from memory without additional DB queries', async () => {
      const rows = [
        makeStation('NDLS', 'New Delhi'),
        makeStation('PNVL', 'Panvel'),
      ];
      const prisma = makePrisma(rows);
      const svc = new StationCacheService(prisma);

      const findManySpy = jest.spyOn(prisma.stationCache, 'findMany');
      const map = await svc.namesForCodes(['ndls', 'PNVL']);
      expect(map.get('NDLS')).toBe('New Delhi');
      expect(map.get('PNVL')).toBe('Panvel');

      // Warmed once on load, zero additional findMany calls for where: { in: ... }
      expect(findManySpy).toHaveBeenCalledTimes(1);
    });

    it('returns empty map when given empty array', async () => {
      const prisma = makePrisma();
      const svc = new StationCacheService(prisma);
      const map = await svc.namesForCodes([]);
      expect(map.size).toBe(0);
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

    it('calls createMany for new stations and updates in-memory cache', async () => {
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

      // Now searching 'cstm' should be served immediately from in-memory cache
      const searchRes = await svc.search('cstm');
      expect(searchRes[0].stationCode).toBe('CSTM');
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
