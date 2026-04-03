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
      upsert: jest.fn().mockReturnValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) => Promise.resolve(ops)),
  } as unknown as PrismaService;
}

describe('StationCacheService', () => {
  describe('search', () => {
    it('returns null when query is shorter than 2 characters', async () => {
      const prisma = makePrisma();
      const svc = new StationCacheService(prisma);
      expect(await svc.search('M')).toBeNull();
      expect(await svc.search('')).toBeNull();
    });

    it('returns null when fewer than MIN_STATION_RESULTS rows come back', async () => {
      const rows = [makeStation('AAA', 'Alpha'), makeStation('BBB', 'Beta')];
      const prisma = makePrisma(rows);
      const svc = new StationCacheService(prisma);
      expect(await svc.search('alpha')).toBeNull();
    });

    it('returns mapped rows when result count meets the threshold', async () => {
      const rows = Array.from({ length: 6 }, (_, i) =>
        makeStation(`ST${i}`, `Station ${i}`),
      );
      const prisma = makePrisma(rows);
      const svc = new StationCacheService(prisma);

      const result = await svc.search('station');

      expect(result).not.toBeNull();
      expect(result).toHaveLength(6);
      // stationName is returned as stored in the mock (not re-normalized by search)
      expect(result![0]).toMatchObject({
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
      const transactionMock = jest.fn();
      (prisma as unknown as { $transaction: jest.Mock }).$transaction =
        transactionMock;
      const svc = new StationCacheService(prisma);

      await svc.upsertMany([]);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('calls $transaction with one upsert per station', async () => {
      const upsertMock = jest.fn().mockReturnValue({});
      const transactionMock = jest.fn().mockResolvedValue([]);
      const prisma = {
        stationCache: { upsert: upsertMock },
        $transaction: transactionMock,
      } as unknown as PrismaService;
      const svc = new StationCacheService(prisma);

      await svc.upsertMany([
        { stationCode: 'ndls', stationName: 'New Delhi' },
        { stationCode: 'cstm', stationName: 'Mumbai CST' },
      ]);

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(upsertMock).toHaveBeenCalledTimes(2);
    });

    it('normalizes stationCode and stationName to uppercase in the upsert', async () => {
      const upsertMock = jest.fn().mockReturnValue({});
      const transactionMock = jest.fn().mockResolvedValue([]);
      const prisma = {
        stationCache: { upsert: upsertMock },
        $transaction: transactionMock,
      } as unknown as PrismaService;
      const svc = new StationCacheService(prisma);

      await svc.upsertMany([{ stationCode: 'ndls', stationName: 'New Delhi' }]);

      const call = upsertMock.mock.calls[0][0] as {
        where: { stationCode: string };
        create: { stationCode: string; stationName: string };
      };
      expect(call.where.stationCode).toBe('NDLS');
      expect(call.create.stationCode).toBe('NDLS');
      expect(call.create.stationName).toBe('NEW DELHI');
    });
  });
});
