import { Test, TestingModule } from '@nestjs/testing';
import { TrainsService } from './trains.service';
import { PrismaService } from '../prisma/prisma.service';
import { IrctcService } from '../irctc/irctc.service';

describe('TrainsService', () => {
  let service: TrainsService;
  let prisma: {
    trainList: {
      findMany: jest.Mock;
    };
    train: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      trainList: {
        findMany: jest.fn(),
      },
      train: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainsService,
        { provide: PrismaService, useValue: prisma },
        { provide: IrctcService, useValue: {} },
      ],
    }).compile();

    service = module.get<TrainsService>(TrainsService);
  });

  describe('search', () => {
    it('returns empty array if query length is less than 2', async () => {
      const result = await service.search('a');
      expect(result).toEqual([]);
      expect(prisma.trainList.findMany).not.toHaveBeenCalled();
    });

    it('queries trainList and formats trainNumber and trainName correctly', async () => {
      prisma.trainList.findMany.mockResolvedValue([
        {
          trainNumber: '12951',
          label: '12951 - TEJAS RAJDHANI',
        },
        {
          trainNumber: '12952',
          label: '12952 - MUMBAI RAJDHANI',
        },
      ]);

      const result = await service.search('rajdhani');
      expect(prisma.trainList.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { trainNumber: { contains: 'rajdhani', mode: 'insensitive' } },
            { label: { contains: 'rajdhani', mode: 'insensitive' } },
          ],
        },
        take: 25,
        orderBy: { label: 'asc' },
      });
      expect(result).toEqual([
        {
          trainNumber: '12951',
          trainName: 'TEJAS RAJDHANI',
          label: '12951 - TEJAS RAJDHANI',
        },
        {
          trainNumber: '12952',
          trainName: 'MUMBAI RAJDHANI',
          label: '12952 - MUMBAI RAJDHANI',
        },
      ]);
    });
  });
});
