import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { RedditAutomationController } from './reddit-automation.controller';
import { RedditAutomationService } from './reddit-automation.service';
import { ADMIN_PASSWORD_ENV, ADMIN_PASSWORD_HEADER } from '../common/admin-auth';

describe('RedditAutomationController', () => {
  let controller: RedditAutomationController;
  let service: RedditAutomationService;
  const originalEnv = process.env[ADMIN_PASSWORD_ENV];

  beforeEach(async () => {
    process.env[ADMIN_PASSWORD_ENV] = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedditAutomationController],
      providers: [
        {
          provide: RedditAutomationService,
          useValue: {
            syncRedditComments: jest.fn().mockResolvedValue({ count: 5 }),
            processCommentAI: jest.fn().mockResolvedValue({ id: '123', status: 'PROCESSED' }),
            getAnalyzedEntries: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<RedditAutomationController>(RedditAutomationController);
    service = module.get<RedditAutomationService>(RedditAutomationService);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[ADMIN_PASSWORD_ENV] = originalEnv;
    } else {
      delete process.env[ADMIN_PASSWORD_ENV];
    }
  });

  describe('unauthenticated requests', () => {
    it('throws UnauthorizedException when no admin password header or cookie is provided', async () => {
      const mockReq = { cookies: {} } as any;
      await expect(controller.syncLatest(undefined, mockReq, {})).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.analyzeLatest(undefined, mockReq, {})).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.processComment(undefined, mockReq, '123')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.getEntries(undefined, mockReq, 1)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when invalid password header is provided', async () => {
      const mockReq = { cookies: {} } as any;
      await expect(controller.syncLatest('wrong-password', mockReq, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('authenticated requests', () => {
    it('succeeds when correct x-admin-password header is provided', async () => {
      const mockReq = { cookies: {} } as any;
      const res = await controller.syncLatest('test-secret', mockReq, {});
      expect(res).toEqual({ count: 5 });
      expect(service.syncRedditComments).toHaveBeenCalled();
    });
  });
});
