import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ChartTimeController } from './chart-time.controller';
import { ADMIN_PASSWORD_ENV, buildAdminSessionCookieValue } from '../common/admin-auth';

describe('ChartTimeController', () => {
  let controller: ChartTimeController;
  let mockChartTimeService: any;
  let mockBrowserUseService: any;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ADMIN_PASSWORD_ENV];
    process.env[ADMIN_PASSWORD_ENV] = 'test-admin-secret';

    mockChartTimeService = {
      getChartTime: jest.fn(),
      setChartTime: jest.fn(),
      getChartTimesForTrain: jest.fn(),
    };

    mockBrowserUseService = {
      executeFetchChartTime: jest.fn(),
    };

    controller = new ChartTimeController(
      mockChartTimeService,
      mockBrowserUseService,
    );
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[ADMIN_PASSWORD_ENV] = originalEnv;
    } else {
      delete process.env[ADMIN_PASSWORD_ENV];
    }
  });

  describe('set', () => {
    it('throws UnauthorizedException when no admin password header or session cookie is provided', async () => {
      const mockReq = {} as Request;
      await expect(
        controller.set(undefined, mockReq, '12345', 'NDLS', '08:00'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when an incorrect admin password header is provided', async () => {
      const mockReq = {} as Request;
      await expect(
        controller.set('wrong-password', mockReq, '12345', 'NDLS', '08:00'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('successfully calls setChartTime when valid admin password header is provided', async () => {
      const mockReq = {} as Request;
      mockChartTimeService.setChartTime.mockResolvedValue({ success: true });

      const res = await controller.set(
        'test-admin-secret',
        mockReq,
        '12345',
        'NDLS',
        '08:00',
      );

      expect(mockChartTimeService.setChartTime).toHaveBeenCalledWith(
        '12345',
        'NDLS',
        '08:00',
      );
      expect(res).toEqual({ success: true });
    });

    it('successfully calls setChartTime when valid admin session cookie is provided without password header', async () => {
      const cookieVal = buildAdminSessionCookieValue();
      const mockReq = {
        cookies: {
          admin_session: cookieVal,
        },
      } as unknown as Request;

      mockChartTimeService.setChartTime.mockResolvedValue({ success: true });

      const res = await controller.set(
        undefined,
        mockReq,
        '12345',
        'NDLS',
        '08:00',
      );

      expect(mockChartTimeService.setChartTime).toHaveBeenCalledWith(
        '12345',
        'NDLS',
        '08:00',
      );
      expect(res).toEqual({ success: true });
    });
  });
});
