import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { JourneyTaskService } from './journey-task.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ChartAlertRefundsService } from '../chart-alert-payments/chart-alert-refunds.service';
import { ADMIN_PASSWORD_ENV } from '../common/admin-auth';

describe('AvailabilityController Admin Endpoints', () => {
  let controller: AvailabilityController;
  let journeyTaskService: Record<
    | 'getAllAlerts'
    | 'getNotificationsAnalytics'
    | 'getRecentCronRuns'
    | 'runTask'
    | 'resendTaskNotification'
    | 'resendFailedWhatsAppNotifications'
    | 'validateJourneyForMonitoring'
    | 'queueJourneyMonitoring'
    | 'queueChartPreparedMonitoring'
    | 'getTasksByJourneyRequestId'
    | 'findDuplicateAlert',
    jest.Mock
  >;
  const originalEnv = process.env[ADMIN_PASSWORD_ENV];
  const savedTasks = [
    {
      id: 'chart-one',
      stationCode: 'GGN',
      chartAt: new Date('2026-09-29T15:56:00Z'),
      status: 'pending',
    },
    {
      id: 'chart-two',
      stationCode: 'GGN',
      chartAt: new Date('2026-09-30T00:25:00Z'),
      status: 'pending',
    },
  ];

  beforeEach(async () => {
    process.env[ADMIN_PASSWORD_ENV] = 'test-secret-password';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [
        {
          provide: AvailabilityService,
          useValue: {},
        },
        {
          provide: JourneyTaskService,
          useValue: {
            validateJourneyForMonitoring: jest
              .fn()
              .mockResolvedValue({ valid: true }),
            queueJourneyMonitoring: jest.fn().mockResolvedValue(true),
            queueChartPreparedMonitoring: jest.fn().mockResolvedValue(true),
            getTasksByJourneyRequestId: jest.fn().mockResolvedValue(savedTasks),
            findDuplicateAlert: jest.fn().mockResolvedValue(null),
            getAllAlerts: jest.fn().mockResolvedValue([]),
            getNotificationsAnalytics: jest.fn().mockResolvedValue([]),
            getRecentCronRuns: jest.fn().mockResolvedValue([]),
            runTask: jest.fn().mockResolvedValue(undefined),
            resendTaskNotification: jest.fn().mockResolvedValue({ sent: true }),
            resendFailedWhatsAppNotifications: jest
              .fn()
              .mockResolvedValue({ found: 0, resent: 0, failed: 0 }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            chartAlertPayment: {
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
        {
          provide: NotificationService,
          useValue: {},
        },
        {
          provide: ChartAlertRefundsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AvailabilityController>(AvailabilityController);
    journeyTaskService =
      module.get<typeof journeyTaskService>(JourneyTaskService);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[ADMIN_PASSWORD_ENV] = originalEnv;
    } else {
      delete process.env[ADMIN_PASSWORD_ENV];
    }
  });

  describe('frontend chart-time contract', () => {
    it('rejects missing chart times synchronously instead of accepting a guessed schedule', async () => {
      await expect(
        controller.createJourney(
          '12665',
          'HWH CAPE',
          'RJY',
          'DG',
          '2026-09-29',
          'SL',
          ['RJY'],
          'test@example.com',
          undefined,
          '2026-09-28',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(journeyTaskService.queueJourneyMonitoring).not.toHaveBeenCalled();
    });

    it.each(['DG', ''])(
      'forwards both supplied events unchanged for destination %s',
      async (destination) => {
        await controller.createJourney(
          '12665',
          'HWH CAPE',
          'RJY',
          destination,
          '2026-09-29',
          'SL',
          ['RJY'],
          'test@example.com',
          undefined,
          '2026-09-28',
          undefined,
          '19:08',
          0,
          '05:35',
          1,
        );
        const queue = destination
          ? journeyTaskService.queueJourneyMonitoring
          : journeyTaskService.queueChartPreparedMonitoring;
        expect(queue).toHaveBeenCalledWith(
          expect.objectContaining({
            chartTimeLocal: '19:08',
            chartOneDayOffset: 0,
            chartTwoTimeLocal: '05:35',
            chartTwoDayOffset: 1,
            trainStartDate: '2026-09-28',
          }),
          expect.any(String),
        );
      },
    );
  });

  describe('subscription persistence acknowledgment', () => {
    const submit = (destination = 'DOZ') =>
      controller.createJourney(
        '12015',
        'Ajmer Shatabdi',
        'GGN',
        destination,
        '2026-09-30',
        'ANY',
        ['GGN'],
        'passenger@example.invalid',
        '919999999999',
        '2026-09-30',
        undefined,
        '21:26',
        -1,
        '05:55',
        0,
      );

    it.each(['DOZ', ''])(
      'waits for persistence for destination %s',
      async (destination) => {
        const queue = destination
          ? journeyTaskService.queueJourneyMonitoring
          : journeyTaskService.queueChartPreparedMonitoring;
        let finishWrite!: (created: boolean) => void;
        queue.mockReturnValue(
          new Promise<boolean>((resolve) => {
            finishWrite = resolve;
          }),
        );
        const respond = jest.fn();
        const pending = submit(destination).then((result) => {
          respond(result);
          return result;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(queue).toHaveBeenCalledTimes(1);
        expect(respond).not.toHaveBeenCalled();
        expect(
          journeyTaskService.getTasksByJourneyRequestId,
        ).not.toHaveBeenCalled();

        finishWrite(true);
        const response = await pending;
        expect(response).toMatchObject({
          accepted: true,
          status: 'scheduled',
          existing: false,
          journeyRequestId: queue.mock.calls[0][1],
          tasks: [
            {
              id: 'chart-one',
              stationCode: 'GGN',
              chartAt: '2026-09-29T15:56:00.000Z',
              status: 'pending',
            },
            {
              id: 'chart-two',
              stationCode: 'GGN',
              chartAt: '2026-09-30T00:25:00.000Z',
              status: 'pending',
            },
          ],
        });
        expect(
          journeyTaskService.getTasksByJourneyRequestId,
        ).toHaveBeenCalledWith(response.journeyRequestId);
      },
    );

    it.each(['DOZ', ''])(
      'returns 503 when queueing fails for destination %s',
      async (destination) => {
        journeyTaskService.queueJourneyMonitoring.mockResolvedValue(false);
        journeyTaskService.queueChartPreparedMonitoring.mockResolvedValue(
          false,
        );
        await expect(submit(destination)).rejects.toThrow(
          ServiceUnavailableException,
        );
        expect(
          journeyTaskService.getTasksByJourneyRequestId,
        ).not.toHaveBeenCalled();
      },
    );

    it('returns a safe 503 response when the database write throws', async () => {
      const cause = new Error(
        'The column chart_number does not exist in the current database.',
      );
      journeyTaskService.queueJourneyMonitoring.mockRejectedValue(cause);
      const error = await submit().catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const exception = error as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      expect(exception.getResponse()).toMatchObject({
        message: 'Could not save your alert subscription. Please try again.',
      });
      expect(exception.cause).toBe(cause);
      expect(JSON.stringify(exception.getResponse())).not.toContain(
        'chart_number',
      );
    });

    it('rejects a queue success without persisted tasks', async () => {
      journeyTaskService.getTasksByJourneyRequestId.mockResolvedValue([]);
      await expect(submit()).rejects.toThrow(ServiceUnavailableException);
    });

    it.each(['DOZ', ''])(
      'returns the existing persisted ID for duplicate destination %s',
      async (destination) => {
        journeyTaskService.getTasksByJourneyRequestId
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(savedTasks);
        journeyTaskService.findDuplicateAlert.mockResolvedValue({
          id: 'existing-request',
        });

        await expect(submit(destination)).resolves.toMatchObject({
          accepted: true,
          existing: true,
          journeyRequestId: 'existing-request',
        });
        expect(
          journeyTaskService.getTasksByJourneyRequestId,
        ).toHaveBeenLastCalledWith('existing-request');
        expect(journeyTaskService.findDuplicateAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            trainNumber: '12015',
            fromStationCode: 'GGN',
            toStationCode: destination,
            journeyDate: '2026-09-30',
            email: 'passenger@example.invalid',
          }),
        );
      },
    );

    it('rejects an existing request that has no chart tasks', async () => {
      journeyTaskService.getTasksByJourneyRequestId.mockResolvedValue([]);
      journeyTaskService.findDuplicateAlert.mockResolvedValue({
        id: 'orphan-request',
      });
      await expect(submit()).rejects.toThrow(ServiceUnavailableException);
    });

    it('does not acknowledge success when the persisted tasks cannot be read', async () => {
      journeyTaskService.getTasksByJourneyRequestId.mockRejectedValue(
        new Error('Database unavailable'),
      );
      await expect(submit()).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('unauthenticated admin requests', () => {
    const mockReq = { cookies: {} } as any;

    it('throws UnauthorizedException on getAllAlerts when unauthenticated', async () => {
      await expect(controller.getAllAlerts(undefined, mockReq)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on getNotificationsAnalytics when unauthenticated', async () => {
      await expect(
        controller.getNotificationsAnalytics(undefined, mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on cronRuns when unauthenticated', async () => {
      await expect(controller.cronRuns(undefined, mockReq)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on triggerAlert when unauthenticated', async () => {
      await expect(
        controller.triggerAlert('task-123', undefined, mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on resendNotification when unauthenticated', async () => {
      await expect(
        controller.resendNotification('task-123', undefined, mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on resendFailedNotifications when unauthenticated', async () => {
      await expect(
        controller.resendFailedNotifications(undefined, mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when wrong header password is provided', async () => {
      await expect(
        controller.getAllAlerts('wrong-password', mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('authenticated admin requests', () => {
    const mockReq = { cookies: {} } as any;
    const validHeader = 'test-secret-password';

    it('succeeds on getAllAlerts when valid password header is provided', async () => {
      const res = await controller.getAllAlerts(validHeader, mockReq);
      expect(res).toEqual({ alerts: [] });
      expect(journeyTaskService.getAllAlerts).toHaveBeenCalled();
    });

    it('succeeds on triggerAlert when valid password header is provided', async () => {
      const res = await controller.triggerAlert(
        'task-123',
        validHeader,
        mockReq,
      );
      expect(res).toEqual({
        success: true,
        message: 'Alert triggered successfully',
      });
      expect(journeyTaskService.runTask).toHaveBeenCalledWith('task-123', true);
    });

    it('succeeds on resendNotification when valid password header is provided', async () => {
      const res = await controller.resendNotification(
        'task-123',
        validHeader,
        mockReq,
      );
      expect(res).toEqual({
        success: true,
        message: 'Notification resent successfully',
        status: { sent: true },
      });
      expect(journeyTaskService.resendTaskNotification).toHaveBeenCalledWith(
        'task-123',
      );
    });

    it('succeeds on resendFailedNotifications when valid password header is provided', async () => {
      const res = await controller.resendFailedNotifications(
        validHeader,
        mockReq,
      );
      expect(res).toEqual({ found: 0, resent: 0, failed: 0 });
      expect(
        journeyTaskService.resendFailedWhatsAppNotifications,
      ).toHaveBeenCalledWith(24);
    });
  });
});
