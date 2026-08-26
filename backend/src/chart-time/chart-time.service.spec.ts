import { Test, TestingModule } from '@nestjs/testing';
import { ChartTimeService } from './chart-time.service';
import { PrismaService } from '../prisma/prisma.service';
import { IrctcService } from '../irctc/irctc.service';

describe('ChartTimeService', () => {
  let service: ChartTimeService;
  let prismaMock: { trainStationChartTime: { findMany: jest.Mock } };
  let irctcMock: { getTrainComposition: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      trainStationChartTime: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    irctcMock = {
      getTrainComposition: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartTimeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: IrctcService, useValue: irctcMock },
      ],
    }).compile();

    service = module.get<ChartTimeService>(ChartTimeService);
  });

  describe('getChartTimesWithSecondChartForTrain', () => {
    it('should return DB chart times when rows exist', async () => {
      prismaMock.trainStationChartTime.findMany.mockResolvedValue([
        {
          stationCode: 'RGS',
          chartTimeLocal: '19:54',
          chartOneDayOffset: 0,
          chartTwoTimeLocal: null,
          chartTwoDayOffset: null,
          chartRemoteStation: null,
          chartNextRemoteStation: null,
        },
      ]);

      const result = await service.getChartTimesWithSecondChartForTrain(
        '20474',
        ['RGS'],
        new Date('2026-08-12T00:00:00.000Z'),
      );

      expect(prismaMock.trainStationChartTime.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(irctcMock.getTrainComposition).not.toHaveBeenCalled();
      expect(result.get('RGS')).toEqual({
        chartOne: { time: '19:54', dayOffset: 0 },
        chartRemoteStation: null,
        chartNextRemoteStation: null,
      });
    });

    it('should serve from in-memory cache on subsequent requests without querying DB again', async () => {
      prismaMock.trainStationChartTime.findMany.mockResolvedValue([
        {
          stationCode: 'RGS',
          chartTimeLocal: '19:54',
          chartOneDayOffset: 0,
          chartTwoTimeLocal: null,
          chartTwoDayOffset: null,
          chartRemoteStation: null,
          chartNextRemoteStation: null,
        },
      ]);

      await service.getChartTimesWithSecondChartForTrain('20474', ['RGS']);
      expect(prismaMock.trainStationChartTime.findMany).toHaveBeenCalledTimes(
        1,
      );

      // Second call for same train & station should hit in-memory cache
      const cachedResult = await service.getChartTimesWithSecondChartForTrain(
        '20474',
        ['RGS'],
      );
      expect(prismaMock.trainStationChartTime.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(cachedResult.get('RGS')?.chartOne.time).toBe('19:54');
    });

    it('should invalidate cache when setChartTime is called', async () => {
      prismaMock.trainStationChartTime.findMany.mockResolvedValue([
        {
          stationCode: 'RGS',
          chartTimeLocal: '19:54',
          chartOneDayOffset: 0,
          chartTwoTimeLocal: null,
          chartTwoDayOffset: null,
          chartRemoteStation: null,
          chartNextRemoteStation: null,
        },
      ]);
      prismaMock.trainStationChartTime.upsert.mockResolvedValue({ id: 'r1' });

      await service.getChartTimesWithSecondChartForTrain('20474', ['RGS']);
      expect(prismaMock.trainStationChartTime.findMany).toHaveBeenCalledTimes(
        1,
      );

      // Update chart time
      await service.setChartTime('20474', 'RGS', '20:00');

      // Next lookup should hit DB again
      await service.getChartTimesWithSecondChartForTrain('20474', ['RGS']);
      expect(prismaMock.trainStationChartTime.findMany).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should return empty map when no DB rows exist without blocking on synchronous IRCTC calls', async () => {
      prismaMock.trainStationChartTime.findMany.mockResolvedValue([]);

      const result = await service.getChartTimesWithSecondChartForTrain(
        '20474',
        ['RGS'],
        new Date('2026-08-12T00:00:00.000Z'),
      );

      expect(prismaMock.trainStationChartTime.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(irctcMock.getTrainComposition).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });
  });
});
