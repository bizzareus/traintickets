import { Test, TestingModule } from '@nestjs/testing';
import { TrainsController } from './trains.controller';
import { TrainsService } from './trains.service';

describe('TrainsController', () => {
  let controller: TrainsController;
  let service: jest.Mocked<Partial<TrainsService>>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([{ id: '1', trainNumber: '12951' }]),
      search: jest.fn().mockResolvedValue([
        {
          trainNumber: '12951',
          trainName: 'TEJAS RAJDHANI',
          label: '12951 - TEJAS RAJDHANI',
        },
      ]),
      getClasses: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainsController],
      providers: [
        {
          provide: TrainsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<TrainsController>(TrainsController);
  });

  it('should call findAll when no query param is provided', async () => {
    const result = await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
    expect(service.search).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: '1', trainNumber: '12951' }]);
  });

  it('should call findAll when query length is less than 2', async () => {
    const result = await controller.findAll('1');
    expect(service.findAll).toHaveBeenCalled();
    expect(service.search).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: '1', trainNumber: '12951' }]);
  });

  it('should call search when query length is >= 2', async () => {
    const result = await controller.findAll('12951');
    expect(service.search).toHaveBeenCalledWith('12951');
    expect(service.findAll).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        trainNumber: '12951',
        trainName: 'TEJAS RAJDHANI',
        label: '12951 - TEJAS RAJDHANI',
      },
    ]);
  });
});
