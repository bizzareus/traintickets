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

  beforeEach(async () => {
    const mockIrctcService = {};
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
        { provide: IrctcBrowserUseService, useValue: mockIrctcBrowserUseService },
      ],
    }).compile();

    controller = module.get<IrctcController>(IrctcController);
    browserUseService = module.get(IrctcBrowserUseService);
    irctcChartService = module.get(IrctcChartService);
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
});
