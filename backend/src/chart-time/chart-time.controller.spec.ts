import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ChartTimeController } from './chart-time.controller';
import { ChartTimeService } from './chart-time.service';
import { BrowserUseService } from '../browser-use/browser-use.service';
import { Request } from 'express';

describe('ChartTimeController', () => {
  let controller: ChartTimeController;
  let chartTimeService: jest.Mocked<ChartTimeService>;
  let browserUseService: jest.Mocked<BrowserUseService>;

  const originalAdminPassword = process.env.CHART_TIME_INGESTION_PASSWORD;

  beforeEach(async () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'test-admin-secret';

    const mockChartTimeService = {
      getChartTime: jest.fn(),
      setChartTime: jest.fn(),
      getChartTimesForTrain: jest.fn(),
    };

    const mockBrowserUseService = {
      executeFetchChartTime: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChartTimeController],
      providers: [
        { provide: ChartTimeService, useValue: mockChartTimeService },
        { provide: BrowserUseService, useValue: mockBrowserUseService },
      ],
    }).compile();

    controller = module.get<ChartTimeController>(ChartTimeController);
    chartTimeService = module.get(ChartTimeService);
    browserUseService = module.get(BrowserUseService);
  });

  afterEach(() => {
    process.env.CHART_TIME_INGESTION_PASSWORD = originalAdminPassword;
    jest.clearAllMocks();
  });

  describe('POST /api/chart-time (set)', () => {
    it('throws UnauthorizedException when admin header and session are missing', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;

      await expect(
        controller.set('', mockReq, '12345', 'NDLS', '18:00'),
      ).rejects.toThrow(UnauthorizedException);

      expect(chartTimeService.setChartTime).not.toHaveBeenCalled();
    });

    it('successfully calls setChartTime when correct admin password header is provided', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;
      chartTimeService.setChartTime.mockResolvedValue({
        id: '1',
        trainNumber: '12345',
        stationCode: 'NDLS',
        chartTimeLocal: '18:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await controller.set(
        'test-admin-secret',
        mockReq,
        '12345',
        'NDLS',
        '18:00',
      );

      expect(chartTimeService.setChartTime).toHaveBeenCalledWith(
        '12345',
        'NDLS',
        '18:00',
      );
      expect(result).toBeDefined();
    });
  });

  describe('POST /api/chart-time/fetch', () => {
    it('throws UnauthorizedException when admin credentials are missing', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;

      await expect(
        controller.fetch(undefined, mockReq, '12345', 'NDLS', 'New Delhi', '2026-10-15'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('successfully executes fetch when valid admin password is provided', async () => {
      const mockReq = { headers: {}, cookies: {} } as unknown as Request;
      chartTimeService.getChartTime.mockResolvedValue(null);
      browserUseService.executeFetchChartTime.mockResolvedValue({
        jobId: 'job-1',
        output: null,
        status: 'success',
        chartTimeLocal: '18:00',
        chartingStationCode: 'NDLS',
      });

      const result = await controller.fetch(
        'test-admin-secret',
        mockReq,
        '12345',
        'NDLS',
        'New Delhi',
        '2026-10-15',
      );

      expect(result).toEqual({
        trainNumber: '12345',
        stationCode: 'NDLS',
        chartTimeLocal: '18:00',
        chartingStationCode: 'NDLS',
        fromCache: false,
      });
    });
  });
});
