import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ADMIN_PASSWORD_ENV } from '../common/admin-auth';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, [ADMIN_PASSWORD_ENV]: 'test-secret' };

    const mockAdminService = {
      getTrains: jest.fn().mockResolvedValue([]),
      createTrain: jest
        .fn()
        .mockResolvedValue({ id: '1', trainNumber: '12345' }),
      getChartRules: jest.fn().mockResolvedValue([]),
      createChartRule: jest.fn().mockResolvedValue({ id: '1', trainId: 't1' }),
      getChartEventInstances: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockReq = {} as Request;

  describe('getTrains', () => {
    it('throws UnauthorizedException when password is wrong or missing', () => {
      expect(() => controller.getTrains('wrong', mockReq)).toThrow(
        UnauthorizedException,
      );
      expect(() => controller.getTrains(undefined, mockReq)).toThrow(
        UnauthorizedException,
      );
    });

    it('succeeds when admin password is correct', async () => {
      await controller.getTrains('test-secret', mockReq);
      expect(adminService.getTrains).toHaveBeenCalled();
    });
  });

  describe('createTrain', () => {
    const body = {
      trainNumber: '12345',
      trainName: 'Express',
      originStation: 'NDLS',
      destinationStation: 'HWH',
    };

    it('throws UnauthorizedException when password is wrong', () => {
      expect(() => controller.createTrain('wrong', mockReq, body)).toThrow(
        UnauthorizedException,
      );
    });

    it('succeeds when admin password is correct', async () => {
      await controller.createTrain('test-secret', mockReq, body);
      expect(adminService.createTrain).toHaveBeenCalledWith(body);
    });
  });

  describe('getChartRules', () => {
    it('throws UnauthorizedException when password is wrong', () => {
      expect(() => controller.getChartRules('wrong', mockReq)).toThrow(
        UnauthorizedException,
      );
    });

    it('succeeds when admin password is correct', async () => {
      await controller.getChartRules('test-secret', mockReq);
      expect(adminService.getChartRules).toHaveBeenCalled();
    });
  });

  describe('createChartRule', () => {
    const body = {
      trainId: 't1',
      stationCode: 'NDLS',
      chartTimeLocal: '08:00',
      sequenceNumber: 1,
    };

    it('throws UnauthorizedException when password is wrong', () => {
      expect(() => controller.createChartRule('wrong', mockReq, body)).toThrow(
        UnauthorizedException,
      );
    });

    it('succeeds when admin password is correct', async () => {
      await controller.createChartRule('test-secret', mockReq, body);
      expect(adminService.createChartRule).toHaveBeenCalledWith(body);
    });
  });

  describe('getChartEventInstances', () => {
    it('throws UnauthorizedException when password is wrong', () => {
      expect(() =>
        controller.getChartEventInstances('wrong', mockReq, '50'),
      ).toThrow(UnauthorizedException);
    });

    it('succeeds when admin password is correct', async () => {
      await controller.getChartEventInstances('test-secret', mockReq, '50');
      expect(adminService.getChartEventInstances).toHaveBeenCalledWith(50);
    });
  });
});
