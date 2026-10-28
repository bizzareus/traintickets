import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { Service2Controller } from './service2.controller';
import { Service2Service } from './service2.service';
import { IrctcService } from '../irctc/irctc.service';

describe('Service2Controller', () => {
  let controller: Service2Controller;
  let service2Service: Service2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Service2Controller],
      providers: [
        {
          provide: Service2Service,
          useValue: {
            check: jest.fn(),
          },
        },
        {
          provide: IrctcService,
          useValue: {
            getTrainSchedule: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<Service2Controller>(Service2Controller);
    service2Service = module.get<Service2Service>(Service2Service);
  });

  describe('check endpoint error handling', () => {
    it('throws sanitized ServiceUnavailableException without leaking error internals', async () => {
      const sensitiveErrorMessage = 'Database connection string postgresql://user:secret@localhost:5432 failed';
      (service2Service.check as jest.Mock).mockRejectedValue(
        new Error(sensitiveErrorMessage),
      );

      try {
        await controller.check({
          trainNumber: '12951',
          stationCode: 'NDLS',
          journeyDate: '2026-10-15',
        });
        throw new Error('Should have thrown ServiceUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const response = (err as ServiceUnavailableException).getResponse();
        const message = typeof response === 'string' ? response : (response as { message?: string }).message;

        expect(message).not.toContain(sensitiveErrorMessage);
        expect(message).not.toContain('secret');
        expect(message).toBe('Service 2 (IRCTC) check failed.');
      }
    });
  });
});
