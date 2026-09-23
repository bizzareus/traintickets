/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ChartTimeIngestionController } from './chart-time-ingestion.controller';
import { ChartTimeIngestionService } from './chart-time-ingestion.service';

describe('ChartTimeIngestionController', () => {
  let controller: ChartTimeIngestionController;
  let service: jest.Mocked<ChartTimeIngestionService>;

  beforeEach(async () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'test-admin-pass';

    const mockService = {
      verifyAdminPassword: jest.fn(),
      collectTrainNumbersForIngestionRun: jest.fn(),
      runIngestionBatch: jest.fn(),
      runTrainListBatchIngestion: jest.fn(),
      listChartTimeAvailabilityTasks: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChartTimeIngestionController],
      providers: [
        {
          provide: ChartTimeIngestionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ChartTimeIngestionController>(
      ChartTimeIngestionController,
    );
    service = module.get(ChartTimeIngestionService);
  });

  afterEach(() => {
    delete process.env.CHART_TIME_INGESTION_PASSWORD;
  });

  describe('run', () => {
    it('throws UnauthorizedException when admin header/cookie is missing', async () => {
      await expect(
        controller.run(undefined, {} as never, {
          journeyDate: '2026-09-23',
          trainNumber: '12782',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('executes when valid admin password header is provided', async () => {
      service.collectTrainNumbersForIngestionRun.mockReturnValue(['12782']);
      service.runIngestionBatch.mockResolvedValue({ status: 'ok' } as never);

      const result = await controller.run('test-admin-pass', {} as never, {
        journeyDate: '2026-09-23',
        trainNumber: '12782',
      });

      expect(result).toEqual({ status: 'ok' });
      expect(service.runIngestionBatch).toHaveBeenCalledWith({
        trainNumbers: ['12782'],
        journeyDate: '2026-09-23',
      });
    });
  });

  describe('runTrainList', () => {
    it('throws UnauthorizedException when admin header/cookie is missing', () => {
      const call = () => controller.runTrainList(undefined, {} as never);
      expect(call).toThrow(UnauthorizedException);
    });

    it('executes when valid admin password header is provided', () => {
      service.runTrainListBatchIngestion.mockReturnValue({
        status: 'started',
      } as never);

      const result = controller.runTrainList('test-admin-pass', {} as never);

      expect(result).toEqual({ status: 'started' });
      expect(service.runTrainListBatchIngestion).toHaveBeenCalledWith();
    });
  });

  describe('listChartTimeTasks', () => {
    it('throws UnauthorizedException when admin header/cookie is missing', () => {
      const call = () => controller.listChartTimeTasks(undefined, {} as never);
      expect(call).toThrow(UnauthorizedException);
    });

    it('executes when valid admin password header is provided', () => {
      service.listChartTimeAvailabilityTasks.mockReturnValue([] as never);

      const result = controller.listChartTimeTasks(
        'test-admin-pass',
        {} as never,
        '10',
        'pending',
      );

      expect(result).toEqual([]);
      expect(service.listChartTimeAvailabilityTasks).toHaveBeenCalledWith({
        limit: 10,
        status: 'pending',
      });
    });
  });
});
