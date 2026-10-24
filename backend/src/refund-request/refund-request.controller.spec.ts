import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RefundRequestController } from './refund-request.controller';
import { RefundRequestService } from './refund-request.service';
import { CreateRefundRequestDto } from './refund-request.dto';
import { ADMIN_PASSWORD_ENV } from '../common/admin-auth';

describe('RefundRequestController', () => {
  let controller: RefundRequestController;
  let createSpy: jest.SpyInstance;
  let listSpy: jest.SpyInstance;
  let setStatusSpy: jest.SpyInstance;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, [ADMIN_PASSWORD_ENV]: 'test-admin-secret' };

    const mockService = {
      create: jest.fn().mockResolvedValue({ id: 'ref-123', duplicate: false }),
      list: jest.fn().mockResolvedValue([]),
      setStatus: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundRequestController],
      providers: [{ provide: RefundRequestService, useValue: mockService }],
    }).compile();

    controller = module.get<RefundRequestController>(RefundRequestController);
    const service = module.get(RefundRequestService);
    createSpy = jest.spyOn(service, 'create');
    listSpy = jest.spyOn(service, 'list');
    setStatusSpy = jest.spyOn(service, 'setStatus');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockReq = {} as Request;

  describe('create', () => {
    it('throws BadRequestException if body is invalid', async () => {
      await expect(
        controller.create(null as unknown as CreateRefundRequestDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to service.create and returns result', async () => {
      const dto: CreateRefundRequestDto = {
        name: 'John Doe',
        mobile: '+919876543210',
        pnr: '1234567890',
        reason: 'Train cancelled',
      };
      const res = await controller.create(dto);
      expect(createSpy).toHaveBeenLastCalledWith(dto);
      expect(res).toEqual({ ok: true, id: 'ref-123', duplicate: false });
    });
  });

  describe('adminList', () => {
    it('throws UnauthorizedException when admin password is missing or wrong', async () => {
      await expect(controller.adminList('wrong-pw', mockReq)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns list when admin auth passes', async () => {
      const res = await controller.adminList('test-admin-secret', mockReq);
      expect(listSpy).toHaveBeenCalled();
      expect(res).toEqual({ entries: [] });
    });
  });

  describe('adminSetStatus', () => {
    it('throws UnauthorizedException when admin password is missing or wrong', async () => {
      await expect(
        controller.adminSetStatus('wrong-pw', mockReq, 'ref-123', {
          status: 'RESOLVED',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates status when admin auth passes', async () => {
      const res = await controller.adminSetStatus(
        'test-admin-secret',
        mockReq,
        'ref-123',
        { status: 'RESOLVED' },
      );
      expect(setStatusSpy).toHaveBeenLastCalledWith('ref-123', 'RESOLVED');
      expect(res).toEqual({ ok: true });
    });
  });
});
