import { PostgresCacheService } from './postgres-cache.service';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma(
  overrides: Partial<PrismaService['cacheEntry']> = {},
): PrismaService {
  return {
    cacheEntry: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      ...overrides,
    },
  } as unknown as PrismaService;
}

describe('PostgresCacheService', () => {
  describe('get', () => {
    it('returns null when key is not found', async () => {
      const prisma = makePrisma({
        findUnique: jest.fn().mockResolvedValue(null),
      });
      const svc = new PostgresCacheService(prisma);
      expect(await svc.get('missing')).toBeNull();
    });

    it('returns the stored value for a non-expired entry', async () => {
      const future = new Date(Date.now() + 60_000);
      const prisma = makePrisma({
        findUnique: jest
          .fn()
          .mockResolvedValue({ key: 'k', value: { x: 1 }, expiresAt: future }),
      });
      const svc = new PostgresCacheService(prisma);
      expect(await svc.get('k')).toEqual({ x: 1 });
    });

    it('returns null and schedules deletion for an expired entry', async () => {
      const past = new Date(Date.now() - 1_000);
      const deleteMock = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({
        findUnique: jest
          .fn()
          .mockResolvedValue({ key: 'k', value: { x: 1 }, expiresAt: past }),
        delete: deleteMock,
      });
      const svc = new PostgresCacheService(prisma);
      const result = await svc.get('k');
      expect(result).toBeNull();
      // Allow microtask queue to flush the fire-and-forget delete
      await new Promise((r) => setTimeout(r, 0));
      expect(deleteMock).toHaveBeenCalledWith({ where: { key: 'k' } });
    });

    it('returns value when expiresAt is null (no expiry)', async () => {
      const prisma = makePrisma({
        findUnique: jest
          .fn()
          .mockResolvedValue({ key: 'k', value: 'hello', expiresAt: null }),
      });
      const svc = new PostgresCacheService(prisma);
      expect(await svc.get('k')).toBe('hello');
    });
  });

  describe('set', () => {
    it('upserts with expiresAt when ttlMs is provided', async () => {
      const upsertMock = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({ upsert: upsertMock });
      const svc = new PostgresCacheService(prisma);

      const before = Date.now();
      await svc.set('k', { v: 42 }, 5_000);
      const after = Date.now();

      expect(upsertMock).toHaveBeenCalledTimes(1);
      const { create } = upsertMock.mock.calls[0][0] as {
        create: { key: string; expiresAt: Date };
      };
      expect(create.key).toBe('k');
      expect(create.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 5_000);
      expect(create.expiresAt.getTime()).toBeLessThanOrEqual(after + 5_000);
    });

    it('upserts with null expiresAt when ttlMs is omitted', async () => {
      const upsertMock = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({ upsert: upsertMock });
      const svc = new PostgresCacheService(prisma);

      await svc.set('k', 'val');

      const { create } = upsertMock.mock.calls[0][0] as {
        create: { expiresAt: null };
      };
      expect(create.expiresAt).toBeNull();
    });
  });

  describe('del', () => {
    it('calls delete with the given key', async () => {
      const deleteMock = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({ delete: deleteMock });
      const svc = new PostgresCacheService(prisma);

      await svc.del('k');
      expect(deleteMock).toHaveBeenCalledWith({ where: { key: 'k' } });
    });

    it('silently ignores P2025 (record not found)', async () => {
      const deleteMock = jest.fn().mockRejectedValue({ code: 'P2025' });
      const prisma = makePrisma({ delete: deleteMock });
      const svc = new PostgresCacheService(prisma);

      await expect(svc.del('missing')).resolves.toBeUndefined();
    });
  });

  describe('getOrSet (inherited from CacheService)', () => {
    it('returns cached value and does not call factory on hit', async () => {
      const prisma = makePrisma({
        findUnique: jest
          .fn()
          .mockResolvedValue({ key: 'k', value: 'cached', expiresAt: null }),
      });
      const svc = new PostgresCacheService(prisma);
      const factory = jest.fn();

      const result = await svc.getOrSet('k', factory, 1_000);

      expect(result).toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls factory and stores result on miss', async () => {
      const upsertMock = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: upsertMock,
      });
      const svc = new PostgresCacheService(prisma);
      const factory = jest.fn().mockResolvedValue('fresh');

      const result = await svc.getOrSet('k', factory, 10_000);

      expect(result).toBe('fresh');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
  });
});
