import { Test, TestingModule } from '@nestjs/testing';
import { JourneyTaskService } from './journey-task.service';
import { PrismaService } from '../prisma/prisma.service';
import { Service2Service } from '../service2/service2.service';
import { NotificationService } from '../notification/notification.service';
import { ChartTimeService } from '../chart-time/chart-time.service';
import { IrctcService } from '../irctc/irctc.service';
import { TrainCompositionService } from '../train-composition/train-composition.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';

describe('JourneyTaskService', () => {
  let service: JourneyTaskService;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    chartTimeAvailabilityTask: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    journeyMonitorContact: {
      findUnique: jest.fn(),
    },
    journeyMonitoringRequest: {
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
    extractJourneyLegCoverage: jest.fn().mockReturnValue([]),
  };

  const mockBookingV2 = {
    findBestTrains: jest.fn(),
    findAlternatePaths: jest.fn().mockResolvedValue({ legs: [] }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JourneyTaskService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Service2Service, useValue: mockService2 },
        { provide: NotificationService, useValue: mockNotification },
        { provide: BookingV2Service, useValue: mockBookingV2 },
        {
          provide: ChartTimeService,
          useValue: { getChartMetaForTrainStation: jest.fn() },
        },
        {
          provide: IrctcService,
          useValue: {
            getTrainSchedule: jest.fn().mockResolvedValue({ ok: false }),
          },
        },
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
      expect(result.tasksRun).toBe(2);
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
      mockBookingV2.findAlternatePaths.mockResolvedValueOnce({
        legs: [
          {
            segmentKind: 'confirmed',
            travelClass: '3A',
            from: 'NDLS',
            to: 'BPL',
          },
        ],
        trainNumber: '12121',
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

    it('should mark task as failed if IRCTC check fails after max retries', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue({
        ...mockTaskData,
        retryCount: 3,
      });
      mockBookingV2.findAlternatePaths.mockResolvedValueOnce({
        legs: [],
        chartStatus: { kind: 'chart_error', error: 'Invalid train' },
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
      mockBookingV2.findAlternatePaths.mockRejectedValueOnce(
        new Error('fetch failed'),
      );

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

    it('should run alternate paths check and notify when confirmed legs are present', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue({
        ...mockTaskData,
        fromStationCode: 'NZM',
        toStationCode: 'BPL',
        stationCode: 'NZM',
      });

      mockBookingV2.findAlternatePaths.mockResolvedValueOnce({
        legs: [
          {
            segmentKind: 'confirmed',
            travelClass: '3A',
            from: 'NZM',
            to: 'BPL',
          },
        ],
        trainNumber: '12121',
      });

      mockPrisma.journeyMonitorContact.findUnique.mockResolvedValue({
        email: 'test@example.com',
        mobile: '9999999999',
      });

      await service.runTask('task-1', true);

      expect(mockBookingV2.findAlternatePaths).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'NZM',
          to: 'BPL',
        }),
      );

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
  });

  describe('autoSubscribeForMissingLegs', () => {
    const mockTask = {
      trainNumber: '11010',
      trainName: 'Sinhagad Exp',
      fromStationCode: 'PUNE',
      toStationCode: 'CSMT',
      journeyDate: new Date('2026-08-10'),
      trainStartDate: new Date('2026-08-10'),
    };

    const mockContact = {
      email: 'user@example.com',
      mobile: '9876543210',
    };

    it('Use Case 1: auto-subscribes user for station B when A->B is available but B->C is not', async () => {
      jest
        .spyOn(service['notificationService'], 'extractJourneyLegCoverage')
        .mockReturnValue([
          {
            type: 'ticket',
            ticketIndex: 1,
            instruction: 'PUNE - CCH - CC',
            approxPrice: 270,
            fromCode: 'PUNE',
            toCode: 'CCH',
          },
          {
            type: 'no_ticket',
            fromCode: 'CCH',
            toCode: 'CSMT',
          },
        ]);

      jest
        .spyOn(service['chartTime'], 'getChartMetaForTrainStation')
        .mockResolvedValue(null as any);

      mockPrisma.chartTimeAvailabilityTask.findFirst = jest
        .fn()
        .mockResolvedValue(null);
      mockPrisma.journeyMonitoringRequest.findUnique = jest
        .fn()
        .mockResolvedValue({ classCode: 'CC' });

      const createTasksSpy = jest
        .spyOn(service, 'createJourneyTasks')
        .mockResolvedValue({
          journeyRequestId: 'jid-new',
          tasks: [
            {
              id: 'task-cch',
              stationCode: 'CCH',
              chartAt: '2026-08-10T05:50:00.000Z',
              status: 'pending',
            },
          ],
        });

      const res = await service.autoSubscribeForMissingLegs({
        journeyRequestId: 'jid-1',
        task: mockTask,
        result: {
          status: 'success',
          vacantBerth: { vbd: [], error: null },
        },
        contact: mockContact,
      });

      expect(res.createdTaskIds).toEqual(['task-cch']);
      expect(createTasksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStationCode: 'CCH',
          toStationCode: 'CSMT',
          trainNumber: '11010',
          email: 'user@example.com',
          mobile: '9876543210',
          stationCodesToMonitor: ['CCH'],
        }),
      );
    });

    it('Use Case 2: auto-subscribes user for remote station D when B->E is not available and chart is prepared at D', async () => {
      jest
        .spyOn(service['notificationService'], 'extractJourneyLegCoverage')
        .mockReturnValue([
          {
            type: 'ticket',
            ticketIndex: 1,
            instruction: 'PUNE - CCH - CC',
            approxPrice: 270,
            fromCode: 'PUNE',
            toCode: 'CCH',
          },
          {
            type: 'no_ticket',
            fromCode: 'CCH',
            toCode: 'CSMT',
          },
        ]);

      jest
        .spyOn(service['chartTime'], 'getChartMetaForTrainStation')
        .mockResolvedValue({
          chartOne: { time: '05:50', dayOffset: 0 },
          chartNextRemoteStation: 'KYN',
        } as any);

      mockPrisma.chartTimeAvailabilityTask.findFirst = jest
        .fn()
        .mockResolvedValue(null);
      mockPrisma.journeyMonitoringRequest.findUnique = jest
        .fn()
        .mockResolvedValue({ classCode: 'CC' });

      const createTasksSpy = jest
        .spyOn(service, 'createJourneyTasks')
        .mockResolvedValue({
          journeyRequestId: 'jid-new-2',
          tasks: [
            {
              id: 'task-kyn',
              stationCode: 'KYN',
              chartAt: '2026-08-10T07:15:00.000Z',
              status: 'pending',
            },
          ],
        });

      const res = await service.autoSubscribeForMissingLegs({
        journeyRequestId: 'jid-1',
        task: mockTask,
        result: {
          status: 'success',
          vacantBerth: { vbd: [], error: null },
        },
        contact: mockContact,
      });

      expect(res.createdTaskIds).toEqual(['task-kyn']);
      expect(createTasksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStationCode: 'KYN',
          toStationCode: 'CSMT',
          trainNumber: '11010',
          email: 'user@example.com',
          mobile: '9876543210',
          stationCodesToMonitor: ['KYN'],
        }),
      );
    });
  });

  describe('validateJourneyForMonitoring', () => {
    it('should resolve correct boarding date when station comes on day 2 of train journey', async () => {
      const mockIrctc = (service as any).irctc;
      mockIrctc.getTrainSchedule.mockResolvedValue({
        ok: true,
        schedule: {
          trainNumber: '20474',
          trainName: 'CHETAK EXPRESS',
          trainRunsOn: { sun: true, mon: true, tue: true, wed: true, thu: true, fri: true, sat: true },
          stationList: [
            { stationCode: 'AII', dayCount: 1, departureTime: '22:20' },
            { stationCode: 'RGS', dayCount: 2, arrivalTime: '00:28', departureTime: '00:31' },
            { stationCode: 'DEE', dayCount: 2, arrivalTime: '05:05' },
          ],
        },
      });

      const res = await service.validateJourneyForMonitoring({
        trainNumber: '20474',
        fromStationCode: 'RGS',
        toStationCode: 'DEE',
        journeyDate: '2026-08-12',
        trainStartDate: '2026-08-12',
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.context.jYmd).toBe('2026-08-13');
        expect(res.context.trainStartDate).toBe('2026-08-12');
      }
    });
  });
});
