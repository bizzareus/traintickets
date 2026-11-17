import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ChartTimeController } from './chart-time.controller';
import {
  ADMIN_PASSWORD_ENV,
  buildAdminSessionCookieValue,
} from '../common/admin-auth';

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

  describe('POST /api/chart-time/fetch', () => {
    it('throws UnauthorizedException when admin credentials are missing', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;

      await expect(
        controller.fetch(
          '',
          mockReq,
          '12345',
          'NDLS',
          'New Delhi',
          '2026-05-01',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns existing cached chart time when authorized', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;
      mockChartTimeService.getChartTime.mockResolvedValue('17:30');

      const result = await controller.fetch(
        'test-admin-secret',
        mockReq,
        '12345',
        'NDLS',
        'New Delhi',
        '2026-05-01',
      );

      expect(result).toEqual({
        trainNumber: '12345',
        stationCode: 'NDLS',
        chartTimeLocal: '17:30',
        fromCache: true,
      });
    });
  });

  describe('GET /api/chart-time/train/:trainNumber/station/:stationCode with fetchIfMissing', () => {
    it('returns cached result without requiring auth', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;
      mockChartTimeService.getChartTime.mockResolvedValue('18:00');

      const result = await controller.get(
        undefined,
        mockReq,
        '12345',
        'NDLS',
        '',
        '',
      );

      expect(result).toEqual({
        trainNumber: '12345',
        stationCode: 'NDLS',
        chartTimeLocal: '18:00',
        fromCache: true,
      });
    });

    it('throws UnauthorizedException when fetchIfMissing=true and admin auth is missing', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;
      mockChartTimeService.getChartTime.mockResolvedValue(null);

      await expect(
        controller.get(
          undefined,
          mockReq,
          '12345',
          'NDLS',
          'true',
          '2026-10-23',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
