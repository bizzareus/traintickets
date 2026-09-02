/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationUnsubscribeService } from './notification-unsubscribe.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationUnsubscribeService', () => {
  let service: NotificationUnsubscribeService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      notificationUnsubscribe: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationUnsubscribeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationUnsubscribeService>(
      NotificationUnsubscribeService,
    );
    prisma = module.get(PrismaService);
  });

  describe('isUnsubscribed', () => {
    it('returns true when a row exists for the normalized recipient', async () => {
      (
        prisma.notificationUnsubscribe.findUnique as jest.Mock
      ).mockResolvedValue({ channel: 'all' });

      const result = await service.isUnsubscribed('  User@Example.COM ');

      expect(result).toBe(true);
      expect(prisma.notificationUnsubscribe.findUnique).toHaveBeenCalledWith({
        where: { recipient: 'user@example.com' },
        select: { channel: true },
      });
    });

    it('returns false when no row exists', async () => {
      (
        prisma.notificationUnsubscribe.findUnique as jest.Mock
      ).mockResolvedValue(null);

      const result = await service.isUnsubscribed('someone@example.com');

      expect(result).toBe(false);
    });
  });

  describe('unsubscribe', () => {
    it('upserts a normalized recipient row with the provided reason', async () => {
      (prisma.notificationUnsubscribe.upsert as jest.Mock).mockResolvedValue({
        id: 'row1',
      });

      await service.unsubscribe('USER@Example.com', 'too many alerts');

      expect(prisma.notificationUnsubscribe.upsert).toHaveBeenCalledWith({
        where: { recipient: 'user@example.com' },
        create: { recipient: 'user@example.com', reason: 'too many alerts' },
        update: { reason: 'too many alerts', channel: 'all' },
      });
    });

    it('upserts with undefined reason when none is provided', async () => {
      (prisma.notificationUnsubscribe.upsert as jest.Mock).mockResolvedValue({
        id: 'row2',
      });

      await service.unsubscribe('user@example.com');

      expect(prisma.notificationUnsubscribe.upsert).toHaveBeenCalledWith({
        where: { recipient: 'user@example.com' },
        create: { recipient: 'user@example.com', reason: undefined },
        update: { reason: undefined, channel: 'all' },
      });
    });
  });

  describe('resubscribe', () => {
    it('deletes the normalized recipient row', async () => {
      (
        prisma.notificationUnsubscribe.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 1 });

      await service.resubscribe('User@Example.com');

      expect(prisma.notificationUnsubscribe.deleteMany).toHaveBeenCalledWith({
        where: { recipient: 'user@example.com' },
      });
    });

    it('does not throw when the row does not exist', async () => {
      (
        prisma.notificationUnsubscribe.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 0 });

      await expect(
        service.resubscribe('nobody@example.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all rows newest first with the expected projection', async () => {
      const rows = [
        {
          id: 'r1',
          recipient: 'b@example.com',
          channel: 'all',
          reason: null,
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
      ];
      (prisma.notificationUnsubscribe.findMany as jest.Mock).mockResolvedValue(
        rows,
      );

      const result = await service.list();

      expect(result).toBe(rows);
      expect(prisma.notificationUnsubscribe.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          recipient: true,
          channel: true,
          reason: true,
          createdAt: true,
        },
      });
    });
  });

  describe('removeById', () => {
    it('returns removed=true when a row was deleted', async () => {
      (
        prisma.notificationUnsubscribe.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 1 });

      const result = await service.removeById('row-1');

      expect(result).toEqual({ removed: true });
      expect(prisma.notificationUnsubscribe.deleteMany).toHaveBeenCalledWith({
        where: { id: 'row-1' },
      });
    });

    it('returns removed=false when the id does not exist', async () => {
      (
        prisma.notificationUnsubscribe.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 0 });

      const result = await service.removeById('missing');

      expect(result).toEqual({ removed: false });
    });
  });
});
