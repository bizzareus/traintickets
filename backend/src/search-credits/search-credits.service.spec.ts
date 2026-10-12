import { ConflictException, HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { SearchCreditsService, normalizePhone } from './search-credits.service';
import { hashIp } from './ip.util';
import { SEARCH_CREDITS_EXHAUSTED_CODE } from './search-credits.constants';

const authedReq = (_sub = 'sms|xyz', ip = '1.2.3.4'): Request =>
  ({
    ip,
    headers: { authorization: 'Bearer test-token' },
  }) as unknown as Request;

const anonReq = (ip = '1.2.3.4'): Request =>
  ({ ip, headers: {} }) as unknown as Request;

const searchInput = (overrides: Record<string, unknown> = {}) => ({
  trainNumber: '12951',
  from: 'NDLS',
  to: 'BCT',
  date: '2026-12-01',
  classes: ['3A'],
  quota: 'GN',
  ...overrides,
});

function mockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    searchIpQuota: { findUnique: jest.fn(), upsert: jest.fn() },
    searchCreditWallet: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    searchUsageLog: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function mockAuth0() {
  return {
    verifyAccessToken: jest.fn(),
    fetchUserProfile: jest.fn(),
  };
}

describe('SearchCreditsService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let auth0: ReturnType<typeof mockAuth0>;
  let service: SearchCreditsService;

  beforeEach(() => {
    prisma = mockPrisma();
    auth0 = mockAuth0();
    auth0.verifyAccessToken.mockResolvedValue(null);
    prisma.searchIpQuota.findUnique.mockResolvedValue(null);
    prisma.searchUsageLog.findUnique.mockResolvedValue(null);
    service = new SearchCreditsService(prisma as never, auth0 as never);
  });

  describe('admitSearch', () => {
    it('admits the first anonymous search as FREE and logs it durably', async () => {
      const admission = await service.admitSearch({
        req: anonReq(),
        ...searchInput(),
      });

      expect(admission.source).toBe('FREE');
      expect(admission.replayed).toBe(false);
      expect(admission.requestId).toBeTruthy();
      expect(prisma.searchUsageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'FREE',
            outcome: 'PENDING',
            debitStatus: 'PENDING_DEBIT',
          }),
        }),
      );
      expect(prisma.searchIpQuota.upsert).toHaveBeenCalled();
    });

    it('rejects the 4th anonymous search with HTTP 402', async () => {
      prisma.searchIpQuota.findUnique.mockResolvedValue({ freeUsed: 3 });

      const err = await service
        .admitSearch({ req: anonReq(), ...searchInput() })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(402);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: SEARCH_CREDITS_EXHAUSTED_CODE,
      });
      expect(prisma.searchUsageLog.create).not.toHaveBeenCalled();
    });

    it('uses PAID source for signed-in users with balance', async () => {
      auth0.verifyAccessToken.mockResolvedValue({
        sub: 'sms|+919876543210',
        phoneNumber: null,
        email: null,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', phone: null });
      prisma.searchCreditWallet.findUnique.mockResolvedValue({ balance: 42 });

      const admission = await service.admitSearch({
        req: authedReq(),
        ...searchInput(),
      });

      expect(admission.source).toBe('PAID');
      expect(admission.userId).toBe('u1');
    });

    it('falls back to FREE for signed-in users with no balance but free left', async () => {
      auth0.verifyAccessToken.mockResolvedValue({
        sub: 'sms|+919876543210',
        phoneNumber: null,
        email: null,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', phone: null });
      prisma.searchCreditWallet.findUnique.mockResolvedValue({ balance: 0 });

      const admission = await service.admitSearch({
        req: authedReq(),
        ...searchInput(),
      });

      expect(admission.source).toBe('FREE');
    });

    it('replays the same requestId + fingerprint without a new log', async () => {
      let storedFingerprint = '';
      prisma.searchUsageLog.create.mockImplementation(
        (args: { data: { fingerprint: string } }) => {
          storedFingerprint = args.data.fingerprint;
          return Promise.resolve({ requestId: 'req-1' });
        },
      );
      const input = { req: anonReq(), requestId: 'req-1', ...searchInput() };
      const first = await service.admitSearch(input);
      expect(first.replayed).toBe(false);
      prisma.searchUsageLog.findUnique.mockResolvedValue({
        requestId: 'req-1',
        fingerprint: storedFingerprint,
        source: 'FREE',
      });
      const second = await service.admitSearch(input);

      expect(second.replayed).toBe(true);
      expect(second.requestId).toBe('req-1');
      expect(prisma.searchUsageLog.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a reused requestId with different search params', async () => {
      prisma.searchUsageLog.findUnique.mockResolvedValue({
        requestId: 'req-1',
        fingerprint: 'different',
        source: 'FREE',
      });

      await expect(
        service.admitSearch({
          req: anonReq(),
          requestId: 'req-1',
          ...searchInput({ trainNumber: '12953' }),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('completeSearch + settle', () => {
    const settledLog = (overrides: Record<string, unknown> = {}) => ({
      requestId: 'req-1',
      outcome: 'SUCCESS',
      debitStatus: 'PENDING_DEBIT',
      source: 'FREE',
      ipHash: hashIp('1.2.3.4'),
      userId: null,
      ...overrides,
    });

    // completeSearch settles fire-and-forget; flush before asserting.
    const flush = () => new Promise((r) => setImmediate(r));

    it('settles a FREE search into the IP counter', async () => {
      prisma.searchUsageLog.findUnique.mockResolvedValue(settledLog());
      prisma.searchUsageLog.updateMany.mockResolvedValue({ count: 1 });

      await service.completeSearch('req-1', 'SUCCESS');
      await flush();

      expect(prisma.searchIpQuota.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { freeUsed: { increment: 1 } },
        }),
      );
      expect(prisma.searchUsageLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { debitStatus: 'SETTLED' },
        }),
      );
    });

    it('settles a PAID search by decrementing the wallet', async () => {
      prisma.searchUsageLog.findUnique.mockResolvedValue(
        settledLog({ source: 'PAID', userId: 'u1' }),
      );
      prisma.searchCreditWallet.updateMany.mockResolvedValue({ count: 1 });
      prisma.searchUsageLog.updateMany.mockResolvedValue({ count: 1 });

      await service.completeSearch('req-1', 'SUCCESS');
      await flush();

      expect(prisma.searchCreditWallet.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', balance: { gt: 0 } },
          data: { balance: { decrement: 1 } },
        }),
      );
    });

    it('never drives the wallet negative (over-limit logged uncharged)', async () => {
      prisma.searchUsageLog.findUnique.mockResolvedValue(
        settledLog({ source: 'PAID', userId: 'u1' }),
      );
      prisma.searchCreditWallet.updateMany.mockResolvedValue({ count: 0 });
      prisma.searchUsageLog.updateMany.mockResolvedValue({ count: 1 });

      await service.completeSearch('req-1', 'SUCCESS');
      await flush();

      expect(prisma.searchUsageLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { debitStatus: 'OVER_LIMIT_UNCHARGED' },
        }),
      );
    });

    it('marks FAILED searches SKIPPED without touching counters', async () => {
      prisma.searchUsageLog.updateMany.mockResolvedValue({ count: 1 });

      await service.completeSearch('req-1', 'FAILED', 'rail timeout');

      expect(prisma.searchUsageLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: 'FAILED' }),
        }),
      );
      expect(prisma.searchIpQuota.upsert).not.toHaveBeenCalled();
      expect(prisma.searchCreditWallet.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('settlePendingLogs', () => {
    it('recovers crash-orphaned SUCCESS rows oldest-first', async () => {
      prisma.searchUsageLog.findMany.mockResolvedValue([
        { requestId: 'a' },
        { requestId: 'b' },
      ]);
      prisma.searchUsageLog.findUnique
        .mockResolvedValueOnce({
          requestId: 'a',
          outcome: 'SUCCESS',
          debitStatus: 'PENDING_DEBIT',
          source: 'FREE',
          ipHash: 'h',
          userId: null,
        })
        .mockResolvedValueOnce(null);
      prisma.searchUsageLog.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.settlePendingLogs();

      expect(prisma.searchUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { outcome: 'SUCCESS', debitStatus: 'PENDING_DEBIT' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(result.settled).toBe(1);
    });
  });

  describe('normalizePhone', () => {
    it.each([
      ['+919876543210', '+919876543210'],
      ['9876543210', '+919876543210'],
      ['919876543210', '+919876543210'],
      [' 98 765 43210 ', '+919876543210'],
    ])('normalizes %s to %s', (input, expected) => {
      expect(normalizePhone(input)).toBe(expected);
    });

    it.each([['abc'], ['123'], ['+'], ['+911234'], [null], [42]])(
      'rejects %s',
      (input) => {
        expect(normalizePhone(input)).toBeNull();
      },
    );
  });
});
