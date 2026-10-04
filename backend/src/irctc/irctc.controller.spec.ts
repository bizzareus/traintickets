import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IrctcController } from './irctc.controller';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';

describe('IrctcController', () => {
  let controller: IrctcController;
  let browserUseService: jest.Mocked<IrctcBrowserUseService>;
  let irctcChartService: jest.Mocked<IrctcChartService>;
  let irctcService: jest.Mocked<IrctcService>;

  beforeEach(async () => {
    const mockIrctcService = {
      getTrainComposition: jest.fn(),
      getCoachComposition: jest.fn(),
    };
    const mockIrctcChartService = {
      getTrainChart: jest.fn(),
    };
    const mockIrctcBrowserUseService = {
      getTrainChart: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IrctcController],
      providers: [
        { provide: IrctcService, useValue: mockIrctcService },
        { provide: IrctcChartService, useValue: mockIrctcChartService },
        {
          provide: IrctcBrowserUseService,
          useValue: mockIrctcBrowserUseService,
        },
      ],
    }).compile();

    controller = module.get<IrctcController>(IrctcController);
    browserUseService = module.get(IrctcBrowserUseService);
    irctcChartService = module.get(IrctcChartService);
    irctcService = module.get(IrctcService);
  });

  describe('getChartV2', () => {
    it('should return generic error message on failure without leaking details', async () => {
      browserUseService.getTrainChart.mockRejectedValue(
        new Error('Sensitive database credentials or stack trace info'),
      );

      await expect(
        controller.getChartV2('12345', '2026-10-01', 'NDLS'),
      ).rejects.toThrow(
        new ServiceUnavailableException(
          'Failed to fetch train chart via Browser Use.',
        ),
      );
    });
  });

  describe('getChart', () => {
    it('should return generic error message on failure without leaking details', async () => {
      irctcChartService.getTrainChart.mockRejectedValue(
        new Error('Internal network error or secret path /var/internal/...'),
      );

      await expect(
        controller.getChart('12345', '2026-10-01', 'NDLS'),
      ).rejects.toThrow(
        new ServiceUnavailableException('Failed to fetch train chart.'),
      );
    });
  });

  describe('getTrainComposition', () => {
    it('should return generic error message on failure without leaking details', async () => {
      irctcService.getTrainComposition.mockRejectedValue(
        new Error('Internal Axios error or database string leakage'),
      );

      await expect(
        controller.getTrainComposition({
          trainNo: '12345',
          jDate: '2026-10-01',
          boardingStation: 'NDLS',
        }),
      ).rejects.toThrow(
        new ServiceUnavailableException('Failed to fetch train composition.'),
      );
    });
  });

  describe('getCoachComposition', () => {
    it('should return generic error message on failure without leaking details', async () => {
      irctcService.getCoachComposition.mockRejectedValue(
        new Error('Upstream timeout or proxy internal error'),
      );

      await expect(
        controller.getCoachComposition({
          trainNo: '12345',
          boardingStation: 'NDLS',
          jDate: '2026-10-01',
          coach: 'B1',
          cls: '3A',
        }),
      ).rejects.toThrow(
        new ServiceUnavailableException('Failed to fetch coach composition.'),
      );
    });
  });
});
