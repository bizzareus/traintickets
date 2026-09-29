import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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
  let journeyTaskService: JourneyTaskService;
  const originalEnv = process.env[ADMIN_PASSWORD_ENV];

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
    journeyTaskService = module.get<JourneyTaskService>(JourneyTaskService);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[ADMIN_PASSWORD_ENV] = originalEnv;
    } else {
      delete process.env[ADMIN_PASSWORD_ENV];
    }
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
