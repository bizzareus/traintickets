import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TrainCompositionController } from './train-composition.controller';
import { TrainCompositionService } from './train-composition.service';

describe('TrainCompositionController', () => {
  let controller: TrainCompositionController;
  let service: jest.Mocked<TrainCompositionService>;

  beforeEach(async () => {
    const mockService = {
      fetchSourceStationChartMeta: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainCompositionController],
      providers: [
        {
          provide: TrainCompositionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TrainCompositionController>(
      TrainCompositionController,
    );
    service = module.get(TrainCompositionService);
  });

  describe('stationsMeta', () => {
    it('throws BadRequestException when trainNumber or sourceStation is missing', async () => {
      await expect(
        controller.stationsMeta({ sourceStation: 'NDLS' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.stationsMeta({ trainNumber: '12951' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns station chart meta when valid arguments are supplied', async () => {
      const mockMeta = {
        stationCode: 'NDLS',
        chartTimeLocal: '04:00',
      };
      service.fetchSourceStationChartMeta.mockResolvedValue(mockMeta as any);

      const res = await controller.stationsMeta({
        trainNumber: '12951',
        sourceStation: 'NDLS',
        journeyDate: '2026-10-15',
        refreshFromIrctc: true,
      });

      expect(res).toEqual({ stations: [mockMeta] });
      expect(service.fetchSourceStationChartMeta).toHaveBeenCalledWith({
        trainNumber: '12951',
        sourceStation: 'NDLS',
        refreshFromIrctc: true,
        journeyDate: '2026-10-15',
      });
    });
  });
});
