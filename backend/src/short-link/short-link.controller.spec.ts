import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ShortLinkController } from './short-link.controller';
import { ShortLinkService } from './short-link.service';
import { ADMIN_PASSWORD_ENV } from '../common/admin-auth';

describe('ShortLinkController', () => {
  let controller: ShortLinkController;
  const originalEnv = process.env[ADMIN_PASSWORD_ENV];

  beforeEach(async () => {
    process.env[ADMIN_PASSWORD_ENV] = 'test-admin-secret';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShortLinkController],
      providers: [
        {
          provide: ShortLinkService,
          useValue: {
            getAdminOverview: jest.fn().mockResolvedValue({ totalClicks: 10 }),
            getAdminDailyStats: jest.fn().mockResolvedValue([]),
            getAdminClicks: jest.fn().mockResolvedValue({ clicks: [] }),
            getAdminLinks: jest.fn().mockResolvedValue({ links: [] }),
            getAdminUsers: jest.fn().mockResolvedValue({ users: [] }),
            recordClick: jest
              .fn()
              .mockResolvedValue({ url: 'https://example.com' }),
          },
        },
      ],
    }).compile();

    controller = module.get<ShortLinkController>(ShortLinkController);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[ADMIN_PASSWORD_ENV] = originalEnv;
    } else {
      delete process.env[ADMIN_PASSWORD_ENV];
    }
  });

  describe('admin authentication', () => {
    it('throws UnauthorizedException when no admin credentials are provided', () => {
      const mockReq = { cookies: {} } as unknown as Request;

      expect(() => controller.getAdminOverview(undefined, mockReq)).toThrow(
        UnauthorizedException,
      );
      expect(() => controller.getAdminDailyStats(undefined, mockReq)).toThrow(
        UnauthorizedException,
      );
      expect(() => controller.getAdminClicks(undefined, mockReq)).toThrow(
        UnauthorizedException,
      );
      expect(() => controller.getAdminLinks(undefined, mockReq)).toThrow(
        UnauthorizedException,
      );
      expect(() => controller.getAdminUsers(undefined, mockReq)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when wrong password header is provided', () => {
      const mockReq = { cookies: {} } as unknown as Request;

      expect(() =>
        controller.getAdminOverview('wrong-password', mockReq),
      ).toThrow(UnauthorizedException);
    });

    it('allows access when valid admin password header is provided', async () => {
      const mockReq = { cookies: {} } as unknown as Request;

      const overview = await controller.getAdminOverview(
        'test-admin-secret',
        mockReq,
      );
      expect(overview).toEqual({ totalClicks: 10 });

      const stats = await controller.getAdminDailyStats(
        'test-admin-secret',
        mockReq,
      );
      expect(stats).toEqual([]);

      const clicks = await controller.getAdminClicks(
        'test-admin-secret',
        mockReq,
      );
      expect(clicks).toEqual({ clicks: [] });

      const links = await controller.getAdminLinks(
        'test-admin-secret',
        mockReq,
      );
      expect(links).toEqual({ links: [] });

      const users = await controller.getAdminUsers(
        'test-admin-secret',
        mockReq,
      );
      expect(users).toEqual({ users: [] });
    });
  });

  describe('public short link endpoint', () => {
    it('allows public access to getShortLink without admin credentials', async () => {
      const mockReq = {
        headers: { 'user-agent': 'test-agent' },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const result = await controller.getShortLink(
        'abc',
        'test-agent',
        undefined,
        undefined,
        '127.0.0.1',
        mockReq,
      );
      expect(result).toEqual({ url: 'https://example.com' });
    });
  });
});
