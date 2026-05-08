import { Test, TestingModule } from '@nestjs/testing';
import { JourneyTaskService } from './journey-task.service';
import { PrismaService } from '../prisma/prisma.service';
import { Service2Service } from '../service2/service2.service';
import { NotificationService } from '../notification/notification.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { IrctcService } from '../irctc/irctc.service';
import { TrainCompositionService } from '../train-composition/train-composition.service';

describe('JourneyTaskService', () => {
  let service: JourneyTaskService;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    chartTimeAvailabilityTask: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    journeyMonitorContact: {
      findUnique: jest.fn(),
    },
  };

  const mockService2 = {
    check: jest.fn(),
  };

  const mockNotification = {
    notifyUser: jest
      .fn()
      .mockResolvedValue({ emailSent: true, whatsappSent: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JourneyTaskService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Service2Service, useValue: mockService2 },
        { provide: NotificationService, useValue: mockNotification },
        { provide: ChartTimeService, useValue: {} },
        { provide: IrctcService, useValue: {} },
        { provide: TrainCompositionService, useValue: {} },
      ],
    }).compile();

    service = module.get<JourneyTaskService>(JourneyTaskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runDueTasks', () => {
    it('should pick up due tasks and mark them as running', async () => {
      const mockTasks = [{ id: 'task-1' }, { id: 'task-2' }];
      mockPrisma.$queryRaw.mockResolvedValue(mockTasks);

      // Mock runTask to prevent actual execution logic for this test
      const runTaskSpy = jest
        .spyOn(service, 'runTask')
        .mockResolvedValue(undefined);

      const result = await service.runDueTasks();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(runTaskSpy).toHaveBeenCalledTimes(2);
      expect(result).toBe(2);
    });
  });

  describe('runTask', () => {
    const mockTaskData = {
      id: 'task-1',
      journeyRequestId: 'jid-1',
      trainNumber: '12121',
      stationCode: 'NDLS',
      journeyDate: new Date('2026-10-10'),
      trainStartDate: new Date('2026-10-10'),
      classCode: '3A',
      toStationCode: 'BPL',
      status: 'pending',
      retryCount: 0,
    };

    it('should process a task and send notification if tickets are found', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue(
        mockTaskData,
      );
      mockService2.check.mockResolvedValue({
        status: 'success',
        availability: [{ status: 'AVAILABLE 10' }],
      });
      mockPrisma.journeyMonitorContact.findUnique.mockResolvedValue({
        email: 'test@example.com',
        mobile: '9999999999',
      });

      await service.runTask('task-1', true);

      const completedData: unknown = expect.objectContaining({
        status: 'completed',
      });
      expect(mockPrisma.chartTimeAvailabilityTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: completedData,
        }),
      );
      expect(mockNotification.notifyUser).toHaveBeenCalled();
    });

    it('should mark task as failed if IRCTC check fails', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue(
        mockTaskData,
      );
      mockService2.check.mockResolvedValue({
        status: 'failed',
        availability: [],
      });

      await service.runTask('task-1', true);

      const failedData: unknown = expect.objectContaining({ status: 'failed' });
      expect(mockPrisma.chartTimeAvailabilityTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: failedData,
        }),
      );
      expect(mockNotification.notifyUser).not.toHaveBeenCalled();
    });

    it('should retry transient rail failures instead of permanently failing immediately', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue(
        mockTaskData,
      );
      mockService2.check.mockResolvedValue({
        status: 'failed',
        debugLog: ['step=composition_error fetch failed'],
        chartStatus: { kind: 'chart_error', error: 'fetch failed' },
      });

      await service.runTask('task-1', true);

      const anyDate: unknown = expect.any(Date);
      const retryData: unknown = expect.objectContaining({
        status: 'pending',
        nextRunAt: anyDate,
        lockedAt: null,
        completedAt: null,
      });
      expect(mockPrisma.chartTimeAvailabilityTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: retryData,
        }),
      );
      expect(mockNotification.notifyUser).not.toHaveBeenCalled();
    });
  });
});
