import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WasenderHealthcheckService } from './wasender-healthcheck.service';
import { ADMIN_PASSWORD_ENV } from '../common/admin-auth';

/* eslint-disable @typescript-eslint/unbound-method */
describe('WhatsappController', () => {
  let controller: WhatsappController;
  let wasenderHealthcheck: jest.Mocked<WasenderHealthcheckService>;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, [ADMIN_PASSWORD_ENV]: 'test-secret' };

    const mockWhatsappService = {};
    const mockWasenderHealthcheck = {
      getState: jest
        .fn()
        .mockReturnValue({ sessionId: 'session-1', lastStatus: 'OK' }),
      checkHealth: jest.fn().mockResolvedValue({ status: 'HEALTHY' }),
      reconnectAndSendQr: jest
        .fn()
        .mockResolvedValue({ status: 'RECONNECTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WhatsappService, useValue: mockWhatsappService },
        {
          provide: WasenderHealthcheckService,
          useValue: mockWasenderHealthcheck,
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    wasenderHealthcheck = module.get(WasenderHealthcheckService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockReq = {} as Request;

  describe('getWasenderHealth', () => {
    it('throws UnauthorizedException when password is wrong', () => {
      expect(() => controller.getWasenderHealth('wrong', mockReq)).toThrow(
        UnauthorizedException,
      );
    });

    it('succeeds when password is valid', () => {
      const res = controller.getWasenderHealth('test-secret', mockReq);
      expect(res).toEqual({ sessionId: 'session-1', lastStatus: 'OK' });
      expect(wasenderHealthcheck.getState).toHaveBeenCalled();
    });
  });

  describe('triggerWasenderHealthcheck', () => {
    it('throws UnauthorizedException when password is wrong', async () => {
      await expect(
        controller.triggerWasenderHealthcheck('wrong', mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('succeeds when password is valid', async () => {
      const res = await controller.triggerWasenderHealthcheck(
        'test-secret',
        mockReq,
      );
      expect(res).toEqual({ status: 'HEALTHY' });
      expect(wasenderHealthcheck.checkHealth).toHaveBeenCalledWith(
        'manual_api',
      );
    });
  });

  describe('triggerWasenderConnect', () => {
    it('throws UnauthorizedException when password is wrong', async () => {
      await expect(
        controller.triggerWasenderConnect('wrong', mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('succeeds when password is valid', async () => {
      const res = await controller.triggerWasenderConnect(
        'test-secret',
        mockReq,
      );
      expect(res).toEqual({ status: 'RECONNECTED' });
      expect(wasenderHealthcheck.reconnectAndSendQr).toHaveBeenCalledWith(
        'session-1',
        'OK',
        'api_connect',
      );
    });
  });
});
