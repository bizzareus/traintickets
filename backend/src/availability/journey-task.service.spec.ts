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
    $transaction: jest.fn().mockResolvedValue([]),
    chartTimeAvailabilityTask: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    monitoringContact: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mc-1' }),
      update: jest.fn(),
    },
    journeyMonitorContact: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    journeyMonitoringRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    sentNotificationLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };

  const mockService2 = {
    check: jest.fn(),
  };

  const mockNotification = {
    notifyUser: jest
      .fn()
      .mockResolvedValue({ emailSent: true, whatsappSent: true }),
    notifyChartPrepared: jest
      .fn()
      .mockResolvedValue({ emailSent: true, whatsappSent: true }),
    extractJourneyLegCoverage: jest.fn().mockReturnValue([]),
    sendAdminMonitoringRequestEmail: jest.fn().mockResolvedValue(true),
  };

  const mockBookingV2 = {
    findBestTrains: jest.fn(),
    findAlternatePaths: jest.fn().mockResolvedValue({ legs: [] }),
  };

  const mockChartTime = {
    getChartMetaForTrainStation: jest.fn(),
    getChartTimesWithSecondChartForTrain: jest
      .fn()
      .mockResolvedValue(new Map()),
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
        { provide: ChartTimeService, useValue: mockChartTime },
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

    it('excludes unsubscribed contacts via SQL filter (NOT EXISTS JOIN)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const runTaskSpy = jest
        .spyOn(service, 'runTask')
        .mockResolvedValue(undefined);

      await service.runDueTasks();

      const sql = mockPrisma.$queryRaw.mock.calls[0][0];
      // Prisma.sql returns an object whose `strings` and `values` arrays
      // contain the raw template. Concatenate to verify the NOT EXISTS
      // JOIN against notification_unsubscribe + JourneyMonitorContact is in
      // the query.
      const flat = Array.isArray(sql?.strings)
        ? sql.strings.join('?')
        : String(sql);
      expect(flat).toContain('notification_unsubscribe');
      expect(flat).toContain('JourneyMonitorContact');
      expect(flat).toContain('NOT EXISTS');
      expect(runTaskSpy).not.toHaveBeenCalled();
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

    it('skips sending leg update notification when existingNotification is found (isFollowUpLeg is true)', async () => {
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

      mockPrisma.sentNotificationLog.findFirst.mockResolvedValueOnce({
        id: 'existing-log-1',
      });

      await service.runTask('task-1', true);

      expect(mockNotification.notifyUser).not.toHaveBeenCalled();
    });

    it('attaches alternative trains directly to notifyUser when no tickets found and dispatches single notification', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue({
        id: 'task-alt',
        journeyRequestId: 'req-alt',
        trainNumber: '12734',
        trainName: 'Narayanadri Sf',
        fromStationCode: 'GNT',
        toStationCode: 'TPTY',
        stationCode: 'GNT',
        chartAt: new Date(Date.now() - 3600_000),
        journeyDate: new Date('2026-08-25'),
        trainStartDate: new Date('2026-08-25'),
        status: 'running',
        retryCount: 0,
      });

      mockBookingV2.findAlternatePaths.mockResolvedValueOnce({
        legs: [
          {
            segmentKind: 'waitlist',
            travelClass: 'SL',
            from: 'GNT',
            to: 'TPTY',
            isAvailable: false,
          },
        ],
        trainNumber: '12734',
      });

      mockPrisma.journeyMonitoringRequest.findUnique.mockResolvedValue({
        id: 'req-alt',
        classCode: 'SL',
      });

      const mockAltCandidate = {
        train: { trainNumber: '17426', trainName: 'SNSI TPTY EXP' },
        alternatePath: {
          legs: [
            { from: 'GNT', to: 'TPTY', travelClass: '2A', isAvailable: true },
          ],
        },
      };

      mockBookingV2.findBestTrains.mockResolvedValue({
        results: [mockAltCandidate],
      });

      mockPrisma.journeyMonitorContact.findUnique.mockResolvedValue({
        email: 'connectkumar17@gmail.com',
        mobile: '919885515973',
      });

      await service.runTask('task-alt', true);

      expect(mockBookingV2.findBestTrains).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'GNT',
          to: 'TPTY',
          acOnly: false,
        }),
      );

      expect(mockNotification.notifyUser).toHaveBeenCalledTimes(1);
      expect(mockNotification.notifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'connectkumar17@gmail.com',
          mobile: '919885515973',
          alternativeTrains: [mockAltCandidate],
        }),
      );
    });

    it('routes to notifyChartPrepared when toStationCode is empty (no destination flow)', async () => {
      mockPrisma.chartTimeAvailabilityTask.findUnique.mockResolvedValue({
        id: 'task-cp',
        journeyRequestId: 'jid-cp',
        trainNumber: '12310',
        trainName: 'RJPB Tejas Raj',
        fromStationCode: 'RJPB',
        toStationCode: '',
        stationCode: 'RJPB',
        journeyDate: new Date('2026-09-05'),
        trainStartDate: new Date('2026-09-05'),
        chartAt: new Date('2026-09-04T16:30:00Z'),
        status: 'pending',
        retryCount: 0,
        firstRunAt: null,
      });
      mockPrisma.journeyMonitorContact.findUnique.mockResolvedValue({
        email: 'a@example.com',
        mobile: '919999999999',
      });

      await service.runTask('task-cp', true);

      // No IRCTC availability check should run for the no-destination path.
      expect(mockBookingV2.findAlternatePaths).not.toHaveBeenCalled();
      expect(mockNotification.notifyUser).not.toHaveBeenCalled();

      expect(mockNotification.notifyChartPrepared).toHaveBeenCalledTimes(1);
      expect(mockNotification.notifyChartPrepared).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'a@example.com',
          mobile: '919999999999',
          trainNumber: '12310',
          trainName: 'RJPB Tejas Raj',
        }),
      );

      // Task is marked completed and the email/whatsapp notified timestamps
      // are recorded (since both sends succeeded in the mock).
      const updateCalls =
        mockPrisma.chartTimeAvailabilityTask.update.mock.calls;
      const lastUpdate = updateCalls[updateCalls.length - 1][0];
      expect(lastUpdate.data).toMatchObject({
        status: 'completed',
        emailNotifiedAt: expect.any(Date),
        whatsappNotifiedAt: expect.any(Date),
      });
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
          trainRunsOn: {
            sun: true,
            mon: true,
            tue: true,
            wed: true,
            thu: true,
            fri: true,
            sat: true,
          },
          stationList: [
            { stationCode: 'AII', dayCount: 1, departureTime: '22:20' },
            {
              stationCode: 'RGS',
              dayCount: 2,
              arrivalTime: '00:28',
              departureTime: '00:31',
            },
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

  describe('queueJourneyMonitoring', () => {
    it('should validate, create tasks and send admin email notification when valid', async () => {
      const validateSpy = jest
        .spyOn(service, 'validateJourneyForMonitoring')
        .mockResolvedValue({
          valid: true,
          context: {
            schedule: { trainName: 'PUNE INTERCITY' } as any,
            fromCode: 'PUNE',
            toCode: 'CSMT',
            trainNumber: '12128',
            stationsToProcess: ['PUNE'],
            jYmd: '2026-09-01',
            trainStartDate: '2026-09-01',
          },
        });

      const createTasksSpy = jest
        .spyOn(service, 'createJourneyTasks')
        .mockResolvedValue({
          journeyRequestId: 'jid-test-123',
          tasks: [
            {
              id: 'task-1',
              stationCode: 'PUNE',
              chartAt: '2026-09-01T06:00:00.000Z',
              status: 'pending',
            },
          ],
        });

      await service.queueJourneyMonitoring(
        {
          trainNumber: '12128',
          fromStationCode: 'PUNE',
          toStationCode: 'CSMT',
          journeyDate: '2026-09-01',
          classCode: 'CC',
          email: 'test@example.com',
        },
        'jid-test-123',
      );

      expect(validateSpy).toHaveBeenCalled();
      expect(createTasksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trainNumber: '12128',
          fromStationCode: 'PUNE',
          toStationCode: 'CSMT',
        }),
        expect.objectContaining({
          journeyRequestId: 'jid-test-123',
        }),
      );
      expect(
        mockNotification.sendAdminMonitoringRequestEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          journeyRequestId: 'jid-test-123',
          taskCount: 1,
          trainNumber: '12128',
        }),
      );
    });

    it('skips queueing journey monitoring when duplicate alert exists', async () => {
      mockPrisma.journeyMonitoringRequest.findFirst.mockResolvedValue({
        id: 'jid-existing',
      });

      const validateSpy = jest
        .spyOn(service, 'validateJourneyForMonitoring')
        .mockResolvedValue({
          valid: true,
          context: {
            schedule: { trainName: 'Shatabdi', stationList: [] } as any,
            fromCode: 'PUNE',
            toCode: 'CSMT',
            trainNumber: '12128',
            stationsToProcess: ['PUNE'],
            jYmd: '2026-09-01',
            trainStartDate: '2026-09-01',
          },
        });

      await service.queueJourneyMonitoring(
        {
          trainNumber: '12128',
          fromStationCode: 'PUNE',
          toStationCode: 'CSMT',
          journeyDate: '2026-09-01',
          classCode: 'CC',
          email: 'test@example.com',
        },
        'jid-new',
      );

      expect(
        mockPrisma.journeyMonitoringRequest.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trainNumber: '12128',
            fromStationCode: 'PUNE',
            toStationCode: 'CSMT',
          }),
        }),
      );
      expect(
        mockNotification.sendAdminMonitoringRequestEmail,
      ).not.toHaveBeenCalled();
    });

    it('should not create tasks or send notification if validation fails', async () => {
      jest.spyOn(service, 'validateJourneyForMonitoring').mockResolvedValue({
        valid: false,
        errors: [{ code: 'ROUTE_INVALID', message: 'Route invalid' }],
      });

      const createTasksSpy = jest.spyOn(service, 'createJourneyTasks');

      await service.queueJourneyMonitoring(
        {
          trainNumber: '12128',
          fromStationCode: 'INVALID',
          toStationCode: 'CSMT',
          journeyDate: '2026-09-01',
          classCode: 'CC',
        },
        'jid-invalid',
      );

      expect(createTasksSpy).not.toHaveBeenCalled();
      expect(
        mockNotification.sendAdminMonitoringRequestEmail,
      ).not.toHaveBeenCalled();
    });
  });

  describe('createJourneyTasks', () => {
    it('should parallelize pre-reads and batch inserts into a single array transaction with createMany', async () => {
      const chartMap = new Map();
      chartMap.set('PUNE', {
        chartOne: { time: '06:00', dayOffset: 0 },
        chartTwo: { time: '07:00', dayOffset: 0 },
      });
      mockChartTime.getChartTimesWithSecondChartForTrain.mockResolvedValue(
        chartMap,
      );

      const result = await service.createJourneyTasks(
        {
          trainNumber: '12128',
          fromStationCode: 'PUNE',
          toStationCode: 'CSMT',
          journeyDate: '2026-09-01',
          classCode: 'CC',
          email: 'test@example.com',
        },
        {
          journeyRequestId: 'jid-batch-123',
          validatedContext: {
            schedule: { trainName: 'PUNE INTERCITY' } as any,
            fromCode: 'PUNE',
            toCode: 'CSMT',
            trainNumber: '12128',
            stationsToProcess: ['PUNE'],
            jYmd: '2026-09-01',
            trainStartDate: '2026-09-01',
          },
        },
      );

      expect(
        mockChartTime.getChartTimesWithSecondChartForTrain,
      ).toHaveBeenCalledWith('12128', ['PUNE'], expect.any(Date));
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.anything(),
        ]),
      );
      expect(
        mockPrisma.chartTimeAvailabilityTask.createMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              journeyRequestId: 'jid-batch-123',
              stationCode: 'PUNE',
              status: 'pending',
            }),
          ]),
        }),
      );
      expect(result.journeyRequestId).toBe('jid-batch-123');
      expect(result.tasks).toHaveLength(2);
    });
  });

  describe('resendFailedWhatsAppNotifications', () => {
    it('should increment whatsappRetryCount and mark as unsend when retries reach 3', async () => {
      mockPrisma.chartTimeAvailabilityTask.findMany.mockResolvedValueOnce([
        {
          id: 'task-retry-test',
          journeyRequestId: 'jid-1',
          trainNumber: '12128',
          trainName: 'INTERCITY',
          fromStationCode: 'PUNE',
          toStationCode: 'CSMT',
          journeyDate: new Date('2026-09-06'),
          status: 'completed',
          whatsappNotifiedAt: null,
          whatsappRetryCount: 2,
          whatsappStatus: 'pending_retry',
          resultPayload: { status: 'success' },
          contact: { mobile: '919340004898', email: null },
        },
      ]);

      mockNotification.notifyUser.mockResolvedValueOnce({
        emailSent: false,
        whatsappSent: false,
      });

      const res = await service.resendFailedWhatsAppNotifications(24);

      expect(res.found).toBe(1);
      expect(res.failed).toBe(1);
      expect(res.resent).toBe(0);

      expect(mockPrisma.chartTimeAvailabilityTask.update).toHaveBeenCalledWith({
        where: { id: 'task-retry-test' },
        data: expect.objectContaining({
          whatsappRetryCount: { increment: 1 },
          whatsappStatus: 'unsend',
        }),
      });
    });

    it('should mark whatsappStatus as sent and update whatsappNotifiedAt when notification succeeds', async () => {
      mockPrisma.chartTimeAvailabilityTask.findMany.mockResolvedValueOnce([
        {
          id: 'task-success-test',
          journeyRequestId: 'jid-2',
          trainNumber: '12128',
          trainName: 'INTERCITY',
          fromStationCode: 'PUNE',
          toStationCode: 'CSMT',
          journeyDate: new Date('2026-09-06'),
          status: 'completed',
          whatsappNotifiedAt: null,
          whatsappRetryCount: 1,
          whatsappStatus: 'pending_retry',
          resultPayload: { status: 'success' },
          contact: { mobile: '919340004898', email: null },
        },
      ]);

      mockNotification.notifyUser.mockResolvedValueOnce({
        emailSent: false,
        whatsappSent: true,
      });

      const res = await service.resendFailedWhatsAppNotifications(24);

      expect(res.found).toBe(1);
      expect(res.resent).toBe(1);
      expect(res.failed).toBe(0);

      expect(mockPrisma.chartTimeAvailabilityTask.update).toHaveBeenCalledWith({
        where: { id: 'task-success-test' },
        data: expect.objectContaining({
          whatsappNotifiedAt: expect.any(Date),
          whatsappStatus: 'sent',
        }),
      });
    });
  });
});
